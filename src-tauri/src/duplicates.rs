/// duplicates.rs — The Cleaner: Duplicate Detection & Resolution
/// Runtime SoundMaster Pro — v0.5.15
///
/// Responsabilità:
/// - Phase 1 "binary": SHA-256 su file della stessa dimensione → duplicati esatti
/// - Phase 2 "metadata": normalizzazione Artista+Titolo → duplicati semantici
/// - Phase 3 "acoustic": fpcalc (Chromaprint) → fingerprint acustico, storage in DB
/// - Best-pick algorithm: formato > bitrate > durata > dimensione
/// - Quarantena non-distruttiva in `_Duplicates/` con gestione collisioni
/// - Aggiornamento `conforming_status = 'duplicate'` nel DB per i loser

use crate::logger;
use crate::utils::{
    canonical_or_raw, collision_safe_path, hidden_command, move_file, workspace_like_prefix,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use tauri::{Emitter, Manager};

// ── Strutture pubbliche ──────────────────────────────────────────────────────

/// Un file in un gruppo duplicato, con tutti i campi per il best-pick.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DuplicateFile {
    pub id: i64,
    pub path: String,
    pub filename: String,
    pub artist: Option<String>,
    pub title: Option<String>,
    pub bitrate: Option<i64>,
    pub duration_secs: Option<f64>,
    pub file_size_bytes: i64,
    pub format: Option<String>,
    pub is_best_pick: bool,
}

/// Un gruppo di 2+ file rilevati come duplicati.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DuplicateGroup {
    pub group_id: String,
    /// "binary_hash" | "metadata" | "acoustic"
    pub match_type: String,
    /// 100 = binario esatto, 90 = acustico, 80 = metadati
    pub score: u8,
    pub files: Vec<DuplicateFile>,
    pub best_pick_id: i64,
}

/// Evento Tauri `"duplicate-progress"` — aggiornamento UI real-time.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DuplicateProgress {
    pub phase: String,   // "binary" | "metadata" | "acoustic" | "complete" | "error"
    pub processed: u64,
    pub total: u64,
    pub current_file: String,
    pub groups_found: u64,
}

/// Valore di ritorno di `detect_duplicates`.
#[derive(Debug, Serialize, Deserialize)]
pub struct DuplicateDetectResult {
    pub total_processed: u64,
    pub groups_found: u64,
    pub groups: Vec<DuplicateGroup>,
}

/// Valore di ritorno di `resolve_duplicates`.
#[derive(Debug, Serialize, Deserialize)]
pub struct DuplicateResolveResult {
    pub moved: u64,
    pub failed: u64,
    /// Path effettivo della cartella duplicati (v0.5.9 — mostrato in UI)
    pub quarantine_path: String,
}

// ── Track row da DB ──────────────────────────────────────────────────────────

#[derive(Clone)]
struct TrackRow {
    id: i64,
    path: String,
    filename: String,
    artist: Option<String>,
    title: Option<String>,
    bitrate: Option<i64>,
    duration_secs: Option<f64>,
    file_size_bytes: i64,
    format: Option<String>,
}

// ── Best-pick algorithm ──────────────────────────────────────────────────────
//
// Criteri in ordine di priorità (da PIANIFICAZIONE.md):
// 1. Formato: lossless (flac, wav) > lossy (mp3, aac, ogg)
// 2. Bitrate: superiore vince se differenza > 32 kbps
// 3. Durata: più lungo vince se differenza > 5s
// 4. Dimensione: più grande come tiebreaker

fn format_score(fmt: &Option<String>) -> u8 {
    match fmt.as_deref().map(|s| s.to_lowercase()).as_deref() {
        Some("flac") | Some("wav") | Some("aiff") => 3,
        Some("mp3") | Some("aac") | Some("ogg") | Some("m4a") => 1,
        _ => 0,
    }
}

fn pick_best(tracks: &[TrackRow]) -> i64 {
    if tracks.is_empty() {
        return 0;
    }
    let mut best = &tracks[0];
    for candidate in tracks.iter().skip(1) {
        let best_fmt = format_score(&best.format);
        let cand_fmt = format_score(&candidate.format);

        if cand_fmt > best_fmt {
            best = candidate;
            continue;
        }
        if cand_fmt < best_fmt {
            continue;
        }

        // Stesso livello formato — confronta bitrate
        let b_bit = best.bitrate.unwrap_or(0);
        let c_bit = candidate.bitrate.unwrap_or(0);
        if c_bit > b_bit + 32 {
            best = candidate;
            continue;
        }
        if b_bit > c_bit + 32 {
            continue;
        }

        // Stesso bitrate — confronta durata
        let b_dur = best.duration_secs.unwrap_or(0.0);
        let c_dur = candidate.duration_secs.unwrap_or(0.0);
        if c_dur > b_dur + 5.0 {
            best = candidate;
            continue;
        }
        if b_dur > c_dur + 5.0 {
            continue;
        }

        // Tiebreaker: dimensione file
        if candidate.file_size_bytes > best.file_size_bytes {
            best = candidate;
        }
    }
    best.id
}

fn to_duplicate_files(tracks: &[TrackRow], best_id: i64) -> Vec<DuplicateFile> {
    tracks
        .iter()
        .map(|t| DuplicateFile {
            id: t.id,
            path: t.path.clone(),
            filename: t.filename.clone(),
            artist: t.artist.clone(),
            title: t.title.clone(),
            bitrate: t.bitrate,
            duration_secs: t.duration_secs,
            file_size_bytes: t.file_size_bytes,
            format: t.format.clone(),
            is_best_pick: t.id == best_id,
        })
        .collect()
}

// ── Normalizzazione testo per confronto metadati ─────────────────────────────

fn normalize_text(s: &str) -> String {
    s.to_lowercase()
        // varianti comuni
        .replace(['&', '+'], " and ")
        .replace(['(', ')', '[', ']', '{', '}'], " ")
        // rimuove tutto ciò che non è alfanumerico o spazio
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn metadata_key(artist: &Option<String>, title: &Option<String>) -> Option<String> {
    let a = artist.as_deref().unwrap_or("").trim().to_string();
    let t = title.as_deref().unwrap_or("").trim().to_string();
    if a.is_empty() && t.is_empty() {
        return None; // nessun metadato → non raggruppiamo
    }
    Some(format!("{}||{}", normalize_text(&a), normalize_text(&t)))
}

// ── SHA-256 ──────────────────────────────────────────────────────────────────

fn sha256_file(path: &str) -> Option<String> {
    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536]; // 64KB chunks
    loop {
        match file.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => hasher.update(&buf[..n]),
            Err(_) => return None,
        }
    }
    Some(format!("{:x}", hasher.finalize()))
}

// ── fpcalc acoustic fingerprint ──────────────────────────────────────────────

/// Esegue fpcalc e restituisce (fingerprint, duration_secs).
/// Output atteso: "FINGERPRINT=<base64>\nDURATION=<secs>"
fn run_fpcalc(path: &str, fpcalc_bin: &str) -> Option<(String, f64)> {
    // hidden_command: niente flash di finestre console in release (fix v0.5.12)
    let output = hidden_command(fpcalc_bin)
        .args(["-plain", path])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut fingerprint = String::new();
    let mut duration = 0.0f64;

    for line in text.lines() {
        if let Some(fp) = line.strip_prefix("FINGERPRINT=") {
            fingerprint = fp.trim().to_string();
        }
        if let Some(dur) = line.strip_prefix("DURATION=") {
            duration = dur.trim().parse().unwrap_or(0.0);
        }
    }

    if fingerprint.is_empty() {
        None
    } else {
        Some((fingerprint, duration))
    }
}

/// Calcola la similarità acustica tra due fingerprint Chromaprint completi (CRIT-06 Resolved).
/// Restituisce un valore tra 0.0 e 1.0 basato sulla corrispondenza dei vettori lungo l'intera traccia.
fn acoustic_similarity(fp1: &str, fp2: &str) -> f64 {
    if fp1.is_empty() || fp2.is_empty() {
        return 0.0;
    }
    let min_len = fp1.len().min(fp2.len());
    let max_len = fp1.len().max(fp2.len());
    if max_len == 0 {
        return 0.0;
    }
    // Se le lunghezze dei fingerprint differiscono di oltre il 15%, le strutture audio sono incompatibili
    if (max_len - min_len) as f64 / max_len as f64 > 0.15 {
        return 0.0;
    }
    let matches = fp1.chars().zip(fp2.chars()).filter(|(c1, c2)| c1 == c2).count();
    matches as f64 / max_len as f64
}

// ── Logica detect (sincrona) ─────────────────────────────────────────────────

fn detect_duplicates_impl(
    app: tauri::AppHandle,
    workspace_path: String,
    fpcalc_path: Option<String>,
) -> Result<DuplicateDetectResult, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;

    let conn = crate::db::open_db(&data_dir)?;

    // Legge solo i track non ancora flaggati come problematici, e solo quelli
    // DEL WORKSPACE CORRENTE.
    // FIX G2 (v0.5.4): la query originale escludeva solo 'non_conform', il che
    // includeva i file con conforming_status='duplicate' (già spostati in
    // _Duplicates/ e con path aggiornato nel DB). Su una seconda esecuzione,
    // detect_duplicates li ri-raggruppava e resolve_duplicates li spostava di
    // nuovo (_duplicate → _duplicate_1, ecc.) in loop infinito.
    // FIX v0.5.11 (DB multi-workspace): senza il filtro sul path, la query
    // includeva i track di ogni workspace mai scansionato — conteggi gonfiati
    // e resolve che spostava file di altri workspace nel corrente.
    let like_pattern = workspace_like_prefix(&workspace_path);
    let mut stmt = conn
        .prepare(
            "SELECT id, path, filename, artist, title, bitrate, duration_secs, \
             COALESCE(file_size_bytes, 0), format \
             FROM tracks \
             WHERE conforming_status NOT IN ('non_conform', 'duplicate') \
             AND path LIKE ?1 ESCAPE '!' \
             ORDER BY id",
        )
        .map_err(|e| format!("DB prepare failed: {e}"))?;

    let tracks: Vec<TrackRow> = stmt
        .query_map([&like_pattern], |row| {
            Ok(TrackRow {
                id: row.get(0)?,
                path: row.get(1)?,
                filename: row.get(2)?,
                artist: row.get(3)?,
                title: row.get(4)?,
                bitrate: row.get(5)?,
                duration_secs: row.get(6)?,
                file_size_bytes: row.get(7)?,
                format: row.get(8)?,
            })
        })
        .map_err(|e| format!("DB query failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    let total = tracks.len() as u64;
    let mut groups: Vec<DuplicateGroup> = Vec::new();

    // Lookup O(1) id → track (fix v0.5.15 — criticità 17): il vecchio
    // tracks.iter().find() dentro i loop dei gruppi era O(n·m) — misurabile
    // su librerie da 36k+ track.
    let by_id: HashMap<i64, &TrackRow> = tracks.iter().map(|t| (t.id, t)).collect();
    let members_of = |ids: &[i64]| -> Vec<TrackRow> {
        ids.iter()
            .filter_map(|id| by_id.get(id).map(|t| (*t).clone()))
            .collect()
    };

    logger::log_separator("DUPLICATES — DETECTION");
    logger::log_detail("DUPLICATES", &format!("Track da analizzare: {}", total));
    logger::log_detail(
        "DUPLICATES",
        &format!(
            "fpcalc: {}",
            fpcalc_path.as_deref().unwrap_or("non disponibile — skip acoustic phase")
        ),
    );
    crate::cancellation::reset_abort("duplicates");

    // Traccia quali id sono già stati assegnati a un gruppo
    let mut grouped_ids: std::collections::HashSet<i64> = std::collections::HashSet::new();
    let mut group_counter = 0u64;

    // ── Phase 1: SHA-256 (solo su file della stessa dimensione) ─────────────
    let _ = app.emit(
        "duplicate-progress",
        DuplicateProgress {
            phase: "binary".to_string(),
            processed: 0,
            total,
            current_file: String::new(),
            groups_found: 0,
        },
    );

    // Raggruppa per dimensione (pre-filtro rapido da DB — evita hash inutili)
    let mut by_size: HashMap<i64, Vec<&TrackRow>> = HashMap::new();
    for t in &tracks {
        by_size.entry(t.file_size_bytes).or_default().push(t);
    }

    // Solo i gruppi con 2+ file della stessa dimensione meritano l'hash
    let size_candidates: Vec<&Vec<&TrackRow>> = by_size
        .values()
        .filter(|g| g.len() >= 2)
        .collect();

    // Totale coerente per la progress bar (fix v0.5.15 — criticità 28):
    // la fase binary processa solo i candidati stessa-dimensione, non tutti
    // i track — prima la barra confrontava processed con il totale sbagliato.
    let hash_total: u64 = size_candidates.iter().map(|g| g.len() as u64).sum();

    let mut processed_binary = 0u64;
    for group in &size_candidates {
        if crate::cancellation::is_aborted("duplicates") {
            logger::log_detail("DUPLICATES", "Annullamento richiesto durante Phase 1.");
            break;
        }
        let mut by_hash: HashMap<String, Vec<i64>> = HashMap::new();
        for t in *group {
            if crate::cancellation::is_aborted("duplicates") {
                break;
            }
            processed_binary += 1;
            if processed_binary % 20 == 0 {
                let _ = app.emit(
                    "duplicate-progress",
                    DuplicateProgress {
                        phase: "binary".to_string(),
                        processed: processed_binary,
                        total: hash_total,
                        current_file: t.filename.clone(),
                        groups_found: groups.len() as u64,
                    },
                );
            }
            if let Some(hash) = sha256_file(&t.path) {
                by_hash.entry(hash).or_default().push(t.id);
            }
        }
        for ids in by_hash.values().filter(|v| v.len() >= 2) {
            let members = members_of(ids);
            let best_id = pick_best(&members);
            group_counter += 1;
            let filenames: Vec<&str> = members.iter().map(|t| t.filename.as_str()).collect();
            logger::log_detail(
                "DUPLICATES",
                &format!(
                    "GRUPPO binary_hash [{}]: {} file — best_pick id={} ({})",
                    group_counter,
                    members.len(),
                    best_id,
                    filenames.join(" | ")
                ),
            );
            groups.push(DuplicateGroup {
                group_id: format!("dup-{group_counter}"),
                match_type: "binary_hash".to_string(),
                score: 100,
                files: to_duplicate_files(&members, best_id),
                best_pick_id: best_id,
            });
            for id in ids {
                grouped_ids.insert(*id);
            }
        }
    }

    // ── Phase 2: Metadati normalizzati ──────────────────────────────────────
    let _ = app.emit(
        "duplicate-progress",
        DuplicateProgress {
            phase: "metadata".to_string(),
            processed: 0,
            total,
            current_file: String::new(),
            groups_found: groups.len() as u64,
        },
    );

    let mut by_meta: HashMap<String, Vec<i64>> = HashMap::new();
    for (i, t) in tracks.iter().enumerate() {
        if crate::cancellation::is_aborted("duplicates") {
            logger::log_detail("DUPLICATES", "Annullamento richiesto durante Phase 2.");
            break;
        }
        if grouped_ids.contains(&t.id) {
            continue; // già trovato come duplicato binario
        }
        if let Some(key) = metadata_key(&t.artist, &t.title) {
            by_meta.entry(key).or_default().push(t.id);
        }
        if (i + 1) % 100 == 0 {
            let _ = app.emit(
                "duplicate-progress",
                DuplicateProgress {
                    phase: "metadata".to_string(),
                    processed: (i + 1) as u64,
                    total,
                    current_file: t.filename.clone(),
                    groups_found: groups.len() as u64,
                },
            );
        }
    }

    for ids in by_meta.values().filter(|v| v.len() >= 2) {
        let members = members_of(ids);
        let best_id = pick_best(&members);
        group_counter += 1;
        let filenames: Vec<&str> = members.iter().map(|t| t.filename.as_str()).collect();
        logger::log_detail(
            "DUPLICATES",
            &format!(
                "GRUPPO metadata [{}]: {} file — best_pick id={} ({})",
                group_counter,
                members.len(),
                best_id,
                filenames.join(" | ")
            ),
        );
        groups.push(DuplicateGroup {
            group_id: format!("dup-{group_counter}"),
            match_type: "metadata".to_string(),
            score: 80,
            files: to_duplicate_files(&members, best_id),
            best_pick_id: best_id,
        });
        for id in ids {
            grouped_ids.insert(*id);
        }
    }

    // ── Phase 3: Acoustic fingerprint (fpcalc — opzionale) ──────────────────
    if let Some(ref fpcalc_bin) = fpcalc_path {
        if !crate::cancellation::is_aborted("duplicates") {
            let _ = app.emit(
                "duplicate-progress",
                DuplicateProgress {
                    phase: "acoustic".to_string(),
                    processed: 0,
                    total,
                    current_file: String::new(),
                    groups_found: groups.len() as u64,
                },
            );

            let ungrouped: Vec<&TrackRow> = tracks
                .iter()
                .filter(|t| !grouped_ids.contains(&t.id))
                .collect();

            let mut by_fingerprint: HashMap<String, Vec<i64>> = HashMap::new();
            // Fingerprint completi e durate calcolate da fpcalc per ogni track
            // (CRIT-06 Resolved: validazione incrociata a due stadi anti-jingle/intro)
            let mut fp_durations: HashMap<i64, f64> = HashMap::new();
            let mut fp_strings: HashMap<i64, String> = HashMap::new();

            for (i, t) in ungrouped.iter().enumerate() {
                if crate::cancellation::is_aborted("duplicates") {
                    logger::log_detail("DUPLICATES", "Annullamento richiesto durante Phase 3.");
                    break;
                }
                if (i + 1) % 20 == 0 {
                    let _ = app.emit(
                        "duplicate-progress",
                        DuplicateProgress {
                            phase: "acoustic".to_string(),
                            processed: (i + 1) as u64,
                            total: ungrouped.len() as u64,
                            current_file: t.filename.clone(),
                            groups_found: groups.len() as u64,
                        },
                    );
                }

            if let Some((fp, dur)) = run_fpcalc(&t.path, fpcalc_bin) {
                // Salva fingerprint nel DB per uso futuro
                let _ = conn.execute(
                    "UPDATE tracks SET fingerprint = ?1 WHERE id = ?2",
                    rusqlite::params![fp, t.id],
                );
                // Fix L5 (v0.5.6): popola duration_secs se assente nel DB
                if t.duration_secs.is_none() && dur > 0.0 {
                    let _ = conn.execute(
                        "UPDATE tracks SET duration_secs = ?1 WHERE id = ?2 AND duration_secs IS NULL",
                        rusqlite::params![dur, t.id],
                    );
                }

                // Prefisso ad alta selettività (280 caratteri ~ 35s audio) per il bucket iniziale
                let key = fp.chars().take(280).collect::<String>();
                fp_durations.insert(t.id, dur);
                fp_strings.insert(t.id, fp);
                by_fingerprint.entry(key).or_default().push(t.id);
            }
        }

        // Cross-check durata e verifica similitudine globale (CRIT-06 Resolved)
        let duration_of = |id: i64| -> f64 {
            fp_durations
                .get(&id)
                .copied()
                .or_else(|| by_id.get(&id).and_then(|t| t.duration_secs))
                .unwrap_or(0.0)
        };

        for ids in by_fingerprint.values().filter(|v| v.len() >= 2) {
            let mut sorted_ids = ids.clone();
            sorted_ids.sort_by(|a, b| {
                duration_of(*a)
                    .partial_cmp(&duration_of(*b))
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

            // Partiziona in sottogruppi con durate compatibili (tolleranza broadcast ristretta a 3.0s)
            let mut subgroups: Vec<Vec<i64>> = Vec::new();
            let mut current: Vec<i64> = Vec::new();
            for id in sorted_ids {
                match current.last() {
                    Some(&prev) if (duration_of(id) - duration_of(prev)).abs() > 3.0 => {
                        subgroups.push(std::mem::take(&mut current));
                        current.push(id);
                    }
                    _ => current.push(id),
                }
            }
            if !current.is_empty() {
                subgroups.push(current);
            }

            for sub_ids in subgroups.iter().filter(|v| v.len() >= 2) {
                // Verifica similitudine sul fingerprint completo: previene raggruppamento
                // errato di brani che condividono solo il jingle/intro iniziale
                let pivot_id = sub_ids[0];
                let pivot_fp = match fp_strings.get(&pivot_id) {
                    Some(s) => s,
                    None => continue,
                };

                let verified_ids: Vec<i64> = sub_ids
                    .iter()
                    .copied()
                    .filter(|&id| {
                        if id == pivot_id {
                            return true;
                        }
                        if let Some(target_fp) = fp_strings.get(&id) {
                            acoustic_similarity(pivot_fp, target_fp) >= 0.85
                        } else {
                            false
                        }
                    })
                    .collect();

                if verified_ids.len() < 2 {
                    continue;
                }

                let members = members_of(&verified_ids);
                let best_id = pick_best(&members);
                group_counter += 1;
                let filenames: Vec<&str> = members.iter().map(|t| t.filename.as_str()).collect();
                logger::log_detail(
                    "DUPLICATES",
                    &format!(
                        "GRUPPO acoustic [{}]: {} file verificati — best_pick id={} ({})",
                        group_counter,
                        members.len(),
                        best_id,
                        filenames.join(" | ")
                    ),
                );
                groups.push(DuplicateGroup {
                    group_id: format!("dup-{group_counter}"),
                    match_type: "acoustic".to_string(),
                    score: 95,
                    files: to_duplicate_files(&members, best_id),
                    best_pick_id: best_id,
                });
            }
        }
        }
    }

    let was_aborted = crate::cancellation::is_aborted("duplicates");
    let phase = if was_aborted { "aborted" } else { "complete" };

    // Evento completamento
    let _ = app.emit(
        "duplicate-progress",
        DuplicateProgress {
            phase: phase.to_string(),
            processed: total,
            total,
            current_file: String::new(),
            groups_found: groups.len() as u64,
        },
    );

    logger::log_detail(
        "DUPLICATES",
        &format!(
            "Detection completata: {} gruppi trovati su {} track analizzati",
            groups.len(),
            total
        ),
    );

    Ok(DuplicateDetectResult {
        total_processed: total,
        groups_found: groups.len() as u64,
        groups,
    })
}

// ── Logica resolve (sincrona) ────────────────────────────────────────────────

// resolutions: Vec di (keep_id, Vec<loser_id>) — un entry per gruppo
fn resolve_duplicates_impl(
    app: tauri::AppHandle,
    workspace_path: String,
    resolutions: Vec<(i64, Vec<i64>)>,
    quarantine_path: Option<String>,
) -> Result<DuplicateResolveResult, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;

    let conn = crate::db::open_db(&data_dir)?;

    let quarantine_dir = match quarantine_path {
        Some(ref p) => std::path::PathBuf::from(p),
        None => Path::new(&workspace_path).join("_Duplicates"),
    };
    std::fs::create_dir_all(&quarantine_dir)
        .map_err(|e| format!("Cannot create duplicates dir: {e}"))?;

    // ── Guardia backend destinazione = workspace (fix v0.5.11) ──────────────
    // Difesa in profondità per l'incidente Genesis (419 file rinominati _1 in
    // place): il check frontend è un confronto testuale bypassabile su Windows
    // da differenze di maiuscole o separatori finali. Confronto su path
    // canonicalizzati.
    let ws_canon = canonical_or_raw(Path::new(&workspace_path));
    let quarantine_canon = canonical_or_raw(&quarantine_dir);
    if quarantine_canon == ws_canon {
        logger::log_detail(
            "DUPLICATES",
            "BLOCCATO: destinazione duplicati coincide con il workspace sorgente",
        );
        return Err(
            "Destinazione non valida: coincide con il workspace sorgente. \
             I file verrebbero rinominati in place invece che spostati."
                .to_string(),
        );
    }

    let mut moved = 0u64;
    let mut failed = 0u64;

    logger::log_separator("DUPLICATES — RESOLVE");
    logger::log_detail(
        "DUPLICATES",
        &format!(
            "Risoluzione {} gruppi → {}",
            resolutions.len(),
            quarantine_dir.display()
        ),
    );

    for (keep_id, loser_ids) in &resolutions {
        for id in loser_ids {
            // Validazione difensiva (fix v0.5.15 — criticità 18): il backend
            // non si fida del frontend — un loser che coincide con il keep
            // non viene mai spostato (sposterebbe proprio il file da tenere).
            if id == keep_id {
                logger::log_detail(
                    "DUPLICATES",
                    &format!("SKIP: loser id {} coincide con keep id — ignorato", id),
                );
                failed += 1;
                continue;
            }
            let row: rusqlite::Result<(String, String)> = conn.query_row(
                "SELECT path, filename FROM tracks WHERE id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            );

            match row {
                Err(e) => {
                    eprintln!("[Duplicates] DB lookup failed for id {id}: {e}");
                    failed += 1;
                }
                Ok((src_path, filename)) => {
                    let src = Path::new(&src_path);
                    if !src.exists() {
                        // Già spostato — aggiorna solo status
                        let _ = conn.execute(
                            "UPDATE tracks SET conforming_status='duplicate' WHERE id=?1",
                            [id],
                        );
                        continue;
                    }

                    // Guardia per-file (fix v0.5.11): file già dentro la
                    // cartella duplicati — il rename lo rinominerebbe in place
                    // con _1. Aggiorna solo lo status.
                    let already_in_quarantine = src
                        .parent()
                        .map(|p| canonical_or_raw(p) == quarantine_canon)
                        .unwrap_or(false);
                    if already_in_quarantine {
                        let _ = conn.execute(
                            "UPDATE tracks SET conforming_status='duplicate' WHERE id=?1",
                            [id],
                        );
                        continue;
                    }

                    let dest = collision_safe_path(&quarantine_dir, &filename);
                    // move_file: rename + fallback copy+delete cross-volume (fix v0.5.14)
                    match move_file(src, &dest) {
                        Ok(_) => {
                            moved += 1;
                            logger::log_detail(
                                "DUPLICATES",
                                &format!("SPOSTATO: {} → {}", filename, dest.display()),
                            );
                            let dest_str = dest.to_string_lossy().to_string();
                            let _ = conn.execute(
                                "UPDATE tracks SET path=?1, conforming_status='duplicate' WHERE id=?2",
                                rusqlite::params![dest_str, id],
                            );
                        }
                        Err(e) => {
                            logger::log_detail(
                                "DUPLICATES",
                                &format!("ERRORE spostamento {}: {}", src_path, e),
                            );
                            eprintln!("[Duplicates] Move failed for {src_path}: {e}");
                            failed += 1;
                        }
                    }
                }
            }
        }
    }

    let quarantine_path_str = quarantine_dir.to_string_lossy().to_string();
    logger::log_detail(
        "DUPLICATES",
        &format!("Resolve completata: {} spostati, {} falliti → {}", moved, failed, quarantine_path_str),
    );
    Ok(DuplicateResolveResult { moved, failed, quarantine_path: quarantine_path_str })
}

// ── Comandi Tauri pubblici ───────────────────────────────────────────────────

/// Analizza i track del workspace corrente per trovare duplicati.
/// Emette eventi `"duplicate-progress"` durante l'esecuzione.
/// `workspace_path`: workspace corrente — limita l'analisi ai suoi file
/// (fix v0.5.11 — DB multi-workspace).
/// `fpcalc_path`: path a fpcalc (o `null` per saltare il fingerprinting acustico).
#[tauri::command]
pub async fn detect_duplicates(
    app: tauri::AppHandle,
    workspace_path: String,
    fpcalc_path: Option<String>,
) -> Result<DuplicateDetectResult, String> {
    tokio::task::spawn_blocking(move || {
        detect_duplicates_impl(app, workspace_path, fpcalc_path)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

/// Sposta i file loser in `<workspace>/_Duplicates/`.
/// `resolutions`: array di `[keep_id, [loser_id, ...]]` — uno per gruppo.
/// `quarantine_path`: path destinazione opzionale; default `<workspace>/_Duplicates/`.
#[tauri::command]
pub async fn resolve_duplicates(
    app: tauri::AppHandle,
    workspace_path: String,
    resolutions: Vec<(i64, Vec<i64>)>,
    quarantine_path: Option<String>,
) -> Result<DuplicateResolveResult, String> {
    tokio::task::spawn_blocking(move || {
        resolve_duplicates_impl(app, workspace_path, resolutions, quarantine_path)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}
