/// cleaner.rs — The Cleaner: Non-Conform Detection & Quarantine
/// Runtime SoundMaster Pro — v0.5.15
///
/// Responsabilità:
/// - Rilevamento file non-conformi tramite regex su filename (pattern YouTube/video-rip)
/// - Rilevamento file video con estensione audio tramite FFprobe codec probe
/// - Rilevamento file corrotti (FFprobe fallisce o duration = 0)
/// - Quarantena non-distruttiva in `_NonConform/` con gestione collisioni
/// - Aggiornamento `conforming_status = 'non_conform'` nel DB

use crate::logger;
use crate::utils::{
    canonical_or_raw, collision_safe_path, hidden_command, move_file, workspace_like_prefix,
};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::OnceLock;
use tauri::{Emitter, Manager};

// ── Strutture per il parsing JSON di FFprobe (M3 fix — v0.5.5) ──────────────
//
// Usano `serde::Deserialize` (già importato) + `serde_json` (in Cargo.toml).
// Campi non usati non vengono dichiarati — serde ignora i campi extra nel JSON.
// Strutture private al modulo: non espongono dettagli implementativi.

#[derive(serde::Deserialize)]
struct FfprobeOutput {
    streams: Option<Vec<FfprobeStream>>,
    format: Option<FfprobeFormat>,
}

/// Flags di disposizione di uno stream FFprobe.
/// Il campo `attached_pic = 1` indica che lo stream è una copertina album (tag ID3 APIC),
/// non un video vero. Quasi tutti gli MP3 moderni hanno questo stream — va ignorato.
#[derive(serde::Deserialize)]
struct FfprobeDisposition {
    attached_pic: Option<u8>,
}

/// Un singolo stream nel JSON FFprobe (`streams[i]`).
#[derive(serde::Deserialize)]
struct FfprobeStream {
    codec_type: Option<String>,
    /// Durata dello stream in secondi (stringa nel JSON FFprobe, es. "234.123456")
    duration: Option<String>,
    /// Disposition flags — contiene `attached_pic` per distinguere cover art da video reali
    disposition: Option<FfprobeDisposition>,
}

/// Sezione `format` del JSON FFprobe — contiene la durata del container.
#[derive(serde::Deserialize)]
struct FfprobeFormat {
    /// Durata del container in secondi (stringa nel JSON FFprobe)
    duration: Option<String>,
}

// ── Pattern YouTube/non-conform ──────────────────────────────────────────────
// Applicati al filename (senza estensione), case-insensitive.
// Ordine: dal più specifico al più generale.
const NON_CONFORM_PATTERNS: &[&str] = &[
    r"\(official\s+music\s+video\)",
    r"\[official\s+music\s+video\]",
    r"\(official\s+video\)",
    r"\[official\s+video\]",
    r"\(lyrics?\s+video\)",
    r"\[lyrics?\s+video\]",
    r"\(lyric\s+video\)",
    r"\[lyric\s+video\]",
    r"\(visuali[zs]er?\)",
    r"\[visuali[zs]er?\]",
    r"\(full\s+album\)",
    r"\[full\s+album\]",
    r"\(audio\)",
    r"\[audio\]",
    r"\(www\.[^)]+\)",
    r"\[www\.[^\]]+\]",
    // YouTube video ID standalone alla fine del filename: underscore/dash + 11 chars alfanumerici
    r"[_\-][a-zA-Z0-9_\-]{11}$",
];

// ── Strutture dati pubbliche ─────────────────────────────────────────────────

/// Un singolo file rilevato come non-conforme.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NonConformItem {
    pub id: i64,
    pub path: String,
    pub filename: String,
    /// Categoria del problema: "youtube_pattern" | "video_stream" | "corrupt"
    pub reason: String,
    /// Dettaglio specifico: pattern regex, codec rilevato, messaggio di errore
    pub reason_detail: String,
    pub file_size_bytes: i64,
}

/// Evento Tauri `"cleaner-progress"` — aggiornamento UI in real-time.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CleanerProgress {
    pub analyzed: u64,
    pub total: u64,
    pub current_file: String,
    /// "analyzing" | "complete" | "error"
    pub phase: String,
    pub found: u64,
}

/// Valore di ritorno del comando `detect_non_conform`.
#[derive(Debug, Serialize, Deserialize)]
pub struct CleanerResult {
    pub total_analyzed: u64,
    pub non_conform_found: u64,
    pub items: Vec<NonConformItem>,
}

/// Valore di ritorno del comando `quarantine_non_conform`.
#[derive(Debug, Serialize, Deserialize)]
pub struct QuarantineResult {
    pub moved: u64,
    pub failed: u64,
    /// Path effettivo della cartella di quarantena (v0.5.9 — mostrato in UI)
    pub quarantine_path: String,
}

// ── Logica interna ───────────────────────────────────────────────────────────

/// Pattern regex compilati una sola volta per processo tramite OnceLock.
///
/// # Fix L4 (v0.5.6)
/// La versione precedente usava `build_patterns()` che ricompilava i pattern
/// a ogni chiamata di `detect_non_conform`, e usava `.expect("Invalid regex pattern")`
/// senza indicare quale pattern fosse fallito.
///
/// OnceLock garantisce:
/// 1. Compilazione al primo accesso, poi riuso — O(1) per chiamate successive
/// 2. Panic message con il pattern specifico che ha causato l'errore (debug)
/// 3. Thread-safe senza lock espliciti
static COMPILED_PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();

fn get_patterns() -> &'static [Regex] {
    COMPILED_PATTERNS.get_or_init(|| {
        NON_CONFORM_PATTERNS
            .iter()
            .map(|p| {
                Regex::new(&format!("(?i){p}")).unwrap_or_else(|e| {
                    panic!("BUG: pattern regex non valido '{}': {}", p, e)
                })
            })
            .collect()
    })
}

/// Verifica il filename (senza estensione) contro tutti i pattern YouTube.
/// Restituisce il pattern grezzo che ha fatto match, o None.
///
/// # Gestione pattern YouTube ID (ultimo pattern — fix G3 v0.5.4)
///
/// Il pattern `[_\-][a-zA-Z0-9_\-]{11}$` è necessariamente ampio per catturare
/// tutti gli ID YouTube (11 chars base64url), ma produce falsi positivi su
/// nomi legittimi come `Track_Remastered1` o `Song_RadioEdit1` che terminano
/// con underscore + 11 chars alfanumerici.
///
/// La distinzione chiave: gli ID YouTube reali sono **sempre alfanumerici misti**
/// (contengono sia lettere che cifre). Sequenze composte esclusivamente da
/// lettere (es. `Remastered`) o esclusivamente da cifre (es. `12345678901`)
/// non sono ID YouTube validi in contesti reali.
///
/// Strategia: i pattern 0..n-2 vengono applicati normalmente. Il pattern n-1
/// (YouTube ID) viene applicato solo se la sequenza da 11 chars contiene
/// **almeno una lettera E almeno una cifra** (charset misto).
fn check_youtube_pattern(filename: &str, patterns: &[Regex]) -> Option<String> {
    // Lavora sul file stem (senza estensione) per evitare match sull'estensione
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename);

    let n = patterns.len();

    // Patterns 0..n-2: applicazione diretta — hanno semantica inequivocabile
    // (es. "(Official Video)", "[Lyrics]", ecc.)
    for pattern in &patterns[..n.saturating_sub(1)] {
        if pattern.is_match(stem) {
            return Some(pattern.as_str().to_string());
        }
    }

    // Pattern n-1: YouTube video ID standalone alla fine del filename.
    // Richiede validazione aggiuntiva del charset per evitare falsi positivi.
    if let Some(id_pattern) = patterns.last() {
        if id_pattern.is_match(stem) {
            // Estrae gli ultimi 11 chars del stem (dopo il separatore _/-)
            let stem_chars: Vec<char> = stem.chars().collect();
            if stem_chars.len() >= 12 {
                let suffix: String = stem_chars[stem_chars.len() - 11..].iter().collect();
                let has_letter = suffix.chars().any(|c| c.is_ascii_alphabetic());
                let has_digit  = suffix.chars().any(|c| c.is_ascii_digit());
                // Solo charset misto (lettera + cifra) = plausibile YouTube ID
                if has_letter && has_digit {
                    return Some(id_pattern.as_str().to_string());
                }
                // Altrimenti: suffisso tutto-lettere (es. "Remastered") o
                // tutto-cifre (es. "12345678901") → non è un ID YouTube → skip
            }
        }
    }

    None
}

/// Esegue `ffprobe` sul file e restituisce:
/// - `has_video`: true se è presente almeno uno stream con `codec_type = "video"`
/// - `duration`: `Some(secs)` se la durata è rilevabile, `None` se assente
///   (NON indica corruzione — solo metadato mancante nel container)
/// - `error`: `Some(msg)` se ffprobe non riesce ad aprire il file → file corrotto
///
/// # Distinzione critica (fix G1 — v0.5.4, mantenuto in v0.5.5)
/// `duration == None` ≠ file corrotto. Solo `duration == Some(0.0)` (durata
/// esplicitamente zero nel JSON) indica file vuoto o troncato.
///
/// # JSON parsing (fix M3 — v0.5.5)
/// Il parsing usa `serde_json` con struct tipizzate invece di string matching.
/// Questo gestisce correttamente tutte le varianti di formattazione JSON
/// (spaziatura, indentazione, ordine dei campi) e versioni future di FFprobe.
///
/// La duration viene cercata prima in `format.duration` (container, più affidabile),
/// con fallback al primo `streams[i].duration` trovato (per formati senza container
/// duration, come certi stream raw o file audio in formato TS).
fn probe_file(path: &str, ffprobe_path: &str) -> (bool, Option<f64>, Option<String>) {
    // hidden_command: niente flash di finestre console in release (fix v0.5.12)
    let output = hidden_command(ffprobe_path)
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            path,
        ])
        .output();

    match output {
        Err(e) => (false, None, Some(format!("ffprobe non eseguibile: {e}"))),
        Ok(out) if !out.status.success() => {
            // Exit code non-zero: FFprobe non è riuscito ad aprire il file
            // → file corrotto, troncato o formato completamente illeggibile
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            let msg = if stderr.is_empty() {
                format!("ffprobe exit code: {}", out.status)
            } else {
                stderr
            };
            (false, None, Some(msg))
        }
        Ok(out) => {
            let json_str = String::from_utf8_lossy(&out.stdout);

            // Parsing tipizzato con serde_json — gestisce tutte le varianti
            // di formattazione senza dipendere dalla spaziatura del JSON
            let parsed: FfprobeOutput = match serde_json::from_str(&json_str) {
                Ok(p) => p,
                Err(_) => {
                    // JSON malformato con exit code 0 — raro, comportamento
                    // conservativo: non tagghiamo come corrupt, segnaliamo
                    // solo che non possiamo leggere i metadati
                    return (false, None, None);
                }
            };

            // Verifica presenza di stream video REALE (codec_type = "video" E attached_pic != 1).
            //
            // Fix v0.5.8: quasi tutti gli MP3 moderni hanno una copertina album (tag ID3 APIC)
            // incorporata nel file. FFprobe la riporta come stream con codec_type = "video",
            // causando falsi positivi su praticamente tutta la libreria.
            //
            // La distinzione corretta è nel campo disposition.attached_pic:
            //   attached_pic = 1  → è una copertina album (ignorare)
            //   attached_pic = 0  → è un vero stream video (segnalare)
            //   campo assente     → trattare come 0 (conservativo: segnalare)
            let has_video = parsed
                .streams
                .as_ref()
                .map_or(false, |streams| {
                    streams.iter().any(|s| {
                        s.codec_type.as_deref() == Some("video")
                            && s.disposition
                                .as_ref()
                                .and_then(|d| d.attached_pic)
                                .unwrap_or(0)
                                != 1
                    })
                });

            // Duration: prima dal container format (più affidabile per la
            // durata totale), poi dal primo stream con duration disponibile
            // (fallback per formati senza container duration, es. raw AAC/MP3)
            let duration = parsed
                .format
                .as_ref()
                .and_then(|f| f.duration.as_deref())
                .and_then(|d| d.parse::<f64>().ok())
                .or_else(|| {
                    parsed.streams.as_ref().and_then(|streams| {
                        streams
                            .iter()
                            .filter_map(|s| {
                                s.duration.as_deref().and_then(|d| d.parse::<f64>().ok())
                            })
                            .next()
                    })
                });

            (has_video, duration, None)
        }
    }
}

// ── Logica detect (sincrona — chiamata da spawn_blocking) ────────────────────

fn detect_non_conform_impl(
    app: tauri::AppHandle,
    workspace_path: String,
    ffprobe_path: Option<String>,
) -> Result<CleanerResult, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;

    let conn = crate::db::open_db(&data_dir)?;

    // Legge solo i track con stato 'unknown' DEL WORKSPACE CORRENTE.
    // Fix v0.5.11 (DB multi-workspace): senza il filtro sul path, la query
    // includeva i track di ogni workspace mai scansionato — e la quarantena
    // spostava file di altri workspace dentro _NonConform del corrente.
    let like_pattern = workspace_like_prefix(&workspace_path);
    let mut stmt = conn
        .prepare(
            "SELECT id, path, filename, COALESCE(file_size_bytes, 0) \
             FROM tracks WHERE conforming_status = 'unknown' \
             AND path LIKE ?1 ESCAPE '!' ORDER BY id",
        )
        .map_err(|e| format!("DB prepare failed: {e}"))?;

    struct TrackRow {
        id: i64,
        path: String,
        filename: String,
        size: i64,
    }

    let tracks: Vec<TrackRow> = stmt
        .query_map([&like_pattern], |row| {
            Ok(TrackRow {
                id: row.get(0)?,
                path: row.get(1)?,
                filename: row.get(2)?,
                size: row.get(3)?,
            })
        })
        .map_err(|e| format!("DB query failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    let total = tracks.len() as u64;
    let patterns = get_patterns();
    let ffprobe = ffprobe_path.as_deref();
    let mut non_conform: Vec<NonConformItem> = Vec::new();

    logger::log_separator("CLEANER — NON-CONFORM DETECTION");
    logger::log_detail("CLEANER", &format!("Track da analizzare: {}", total));
    logger::log_detail(
        "CLEANER",
        &format!(
            "FFprobe: {}",
            ffprobe.unwrap_or("non disponibile — skip video/corrupt check")
        ),
    );

    // Evento iniziale
    let _ = app.emit(
        "cleaner-progress",
        CleanerProgress {
            analyzed: 0,
            total,
            current_file: String::new(),
            phase: "analyzing".to_string(),
            found: 0,
        },
    );

    for (i, track) in tracks.iter().enumerate() {
        let analyzed = (i + 1) as u64;

        // Emetti progress ogni 50 file o all'ultimo
        if analyzed % 50 == 0 || analyzed == total {
            let _ = app.emit(
                "cleaner-progress",
                CleanerProgress {
                    analyzed,
                    total,
                    current_file: track.filename.clone(),
                    phase: "analyzing".to_string(),
                    found: non_conform.len() as u64,
                },
            );
        }

        // ── 1. Pattern YouTube / video-rip (filename) ────────────────────────
        if let Some(matched_pattern) = check_youtube_pattern(&track.filename, &patterns) {
            logger::log_detail(
                "CLEANER",
                &format!(
                    "NON-CONFORM youtube_pattern | {} | pattern: {}",
                    track.filename, matched_pattern
                ),
            );
            non_conform.push(NonConformItem {
                id: track.id,
                path: track.path.clone(),
                filename: track.filename.clone(),
                reason: "youtube_pattern".to_string(),
                reason_detail: matched_pattern,
                file_size_bytes: track.size,
            });
            continue; // una categoria è sufficiente per file
        }

        // ── 2. FFprobe checks (solo se ffprobe disponibile) ──────────────────
        if let Some(ffprobe_bin) = ffprobe {
            let (has_video, duration, probe_err) = probe_file(&track.path, ffprobe_bin);

            if let Some(err_msg) = probe_err {
                logger::log_detail(
                    "CLEANER",
                    &format!(
                        "NON-CONFORM corrupt | {} | ffprobe: {}",
                        track.filename, err_msg
                    ),
                );
                non_conform.push(NonConformItem {
                    id: track.id,
                    path: track.path.clone(),
                    filename: track.filename.clone(),
                    reason: "corrupt".to_string(),
                    reason_detail: err_msg,
                    file_size_bytes: track.size,
                });
            } else if has_video {
                logger::log_detail(
                    "CLEANER",
                    &format!(
                        "NON-CONFORM video_stream | {} | video codec rilevato da FFprobe",
                        track.filename
                    ),
                );
                non_conform.push(NonConformItem {
                    id: track.id,
                    path: track.path.clone(),
                    filename: track.filename.clone(),
                    reason: "video_stream".to_string(),
                    reason_detail: "Video codec stream rilevato da FFprobe".to_string(),
                    file_size_bytes: track.size,
                });
            } else if duration == Some(0.0) {
                logger::log_detail(
                    "CLEANER",
                    &format!(
                        "NON-CONFORM corrupt | {} | duration=0.0 (file vuoto o troncato)",
                        track.filename
                    ),
                );
                non_conform.push(NonConformItem {
                    id: track.id,
                    path: track.path.clone(),
                    filename: track.filename.clone(),
                    reason: "corrupt".to_string(),
                    reason_detail: "Durata 0 rilevata da FFprobe — file vuoto o corrotto"
                        .to_string(),
                    file_size_bytes: track.size,
                });
            }
        }
    }

    logger::log_detail(
        "CLEANER",
        &format!(
            "Detection completata: {}/{} non-conformi trovati",
            non_conform.len(),
            total
        ),
    );

    // Evento completamento
    let _ = app.emit(
        "cleaner-progress",
        CleanerProgress {
            analyzed: total,
            total,
            current_file: String::new(),
            phase: "complete".to_string(),
            found: non_conform.len() as u64,
        },
    );

    Ok(CleanerResult {
        total_analyzed: total,
        non_conform_found: non_conform.len() as u64,
        items: non_conform,
    })
}

// ── Logica quarantine (sincrona) ─────────────────────────────────────────────

fn quarantine_non_conform_impl(
    app: tauri::AppHandle,
    workspace_path: String,
    track_ids: Vec<i64>,
    quarantine_path: Option<String>,
) -> Result<QuarantineResult, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;

    let conn = crate::db::open_db(&data_dir)?;

    // Crea la cartella di quarantena (non-distruttivo: mai eliminare)
    // Se l'utente ha specificato un path custom, usa quello; altrimenti <workspace>/_NonConform
    let quarantine_dir = match quarantine_path {
        Some(ref p) => std::path::PathBuf::from(p),
        None => Path::new(&workspace_path).join("_NonConform"),
    };
    std::fs::create_dir_all(&quarantine_dir)
        .map_err(|e| format!("Cannot create quarantine dir: {e}"))?;

    // ── Guardia backend destinazione = workspace (fix v0.5.11) ──────────────
    // Difesa in profondità per l'incidente Genesis: il check frontend
    // (`selected === workspacePath`) è un confronto testuale bypassabile su
    // Windows da differenze di maiuscole o separatori finali. Qui il confronto
    // avviene su path canonicalizzati: se la destinazione coincide con il
    // workspace, i file verrebbero rinominati in place con suffisso _1 invece
    // di essere spostati.
    let ws_canon = canonical_or_raw(Path::new(&workspace_path));
    let quarantine_canon = canonical_or_raw(&quarantine_dir);
    if quarantine_canon == ws_canon {
        logger::log_detail(
            "CLEANER",
            "BLOCCATO: destinazione quarantena coincide con il workspace sorgente",
        );
        return Err(
            "Destinazione non valida: coincide con il workspace sorgente. \
             I file verrebbero rinominati in place invece che spostati."
                .to_string(),
        );
    }

    let mut moved = 0u64;
    let mut failed = 0u64;

    logger::log_separator("CLEANER — QUARANTINE NON-CONFORM");
    logger::log_detail(
        "CLEANER",
        &format!(
            "Quarantena {} file → {}",
            track_ids.len(),
            quarantine_dir.display()
        ),
    );

    for id in &track_ids {
        let row: rusqlite::Result<(String, String)> = conn.query_row(
            "SELECT path, filename FROM tracks WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        );

        match row {
            Err(e) => {
                eprintln!("[Cleaner] DB lookup failed for id {id}: {e}");
                failed += 1;
            }
            Ok((src_path, filename)) => {
                let src = Path::new(&src_path);

                // File già spostato o eliminato — aggiorna solo il DB
                if !src.exists() {
                    let _ = conn.execute(
                        "UPDATE tracks SET conforming_status='non_conform' WHERE id=?1",
                        [id],
                    );
                    continue;
                }

                // Guardia per-file (fix v0.5.11): se il file è GIÀ dentro la
                // cartella di quarantena, il rename lo rinominerebbe in place
                // con _1 (collisione con se stesso). Aggiorna solo lo status.
                let already_in_quarantine = src
                    .parent()
                    .map(|p| canonical_or_raw(p) == quarantine_canon)
                    .unwrap_or(false);
                if already_in_quarantine {
                    let _ = conn.execute(
                        "UPDATE tracks SET conforming_status='non_conform' WHERE id=?1",
                        [id],
                    );
                    continue;
                }

                // Path di destinazione — collision-safe
                let dest = collision_safe_path(&quarantine_dir, &filename);

                // move_file: rename + fallback copy+delete cross-volume (fix v0.5.14)
                match move_file(src, &dest) {
                    Ok(_) => {
                        moved += 1;
                        logger::log_detail(
                            "CLEANER",
                            &format!("SPOSTATO: {} → {}", filename, dest.display()),
                        );
                        let dest_str = dest.to_string_lossy().to_string();
                        let _ = conn.execute(
                            "UPDATE tracks SET path=?1, conforming_status='non_conform' WHERE id=?2",
                            rusqlite::params![dest_str, id],
                        );
                    }
                    Err(e) => {
                        logger::log_detail(
                            "CLEANER",
                            &format!("ERRORE spostamento {}: {}", src_path, e),
                        );
                        eprintln!("[Cleaner] Move failed for {src_path}: {e}");
                        failed += 1;
                    }
                }
            }
        }
    }

    let quarantine_path_str = quarantine_dir.to_string_lossy().to_string();
    logger::log_detail(
        "CLEANER",
        &format!("Quarantena completata: {} spostati, {} falliti → {}", moved, failed, quarantine_path_str),
    );
    Ok(QuarantineResult { moved, failed, quarantine_path: quarantine_path_str })
}

// ── Comandi Tauri pubblici ───────────────────────────────────────────────────

/// Analizza i track con `conforming_status = 'unknown'` del workspace corrente.
/// Emette eventi `"cleaner-progress"` durante l'esecuzione.
/// Parametro `workspace_path`: workspace corrente — limita l'analisi ai suoi file
/// (fix v0.5.11 — DB multi-workspace).
/// Parametro `ffprobe_path`: path a ffprobe (o `null` per skip FFprobe checks).
#[tauri::command]
pub async fn detect_non_conform(
    app: tauri::AppHandle,
    workspace_path: String,
    ffprobe_path: Option<String>,
) -> Result<CleanerResult, String> {
    tokio::task::spawn_blocking(move || {
        detect_non_conform_impl(app, workspace_path, ffprobe_path)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

/// Sposta i file identificati come non-conformi nella cartella di quarantena.
/// Default: `<workspace_path>/_NonConform/`.
/// Se `quarantine_path` è fornito, usa quel percorso direttamente.
/// Operazione non-distruttiva: i file vengono spostati, mai eliminati.
#[tauri::command]
pub async fn quarantine_non_conform(
    app: tauri::AppHandle,
    workspace_path: String,
    track_ids: Vec<i64>,
    quarantine_path: Option<String>,
) -> Result<QuarantineResult, String> {
    tokio::task::spawn_blocking(move || {
        quarantine_non_conform_impl(app, workspace_path, track_ids, quarantine_path)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}
