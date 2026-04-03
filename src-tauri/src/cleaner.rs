/// cleaner.rs — The Cleaner: Non-Conform Detection & Quarantine
/// Runtime SoundMaster Pro — v0.4.1
///
/// Responsabilità:
/// - Rilevamento file non-conformi tramite regex su filename (pattern YouTube/video-rip)
/// - Rilevamento file video con estensione audio tramite FFprobe codec probe
/// - Rilevamento file corrotti (FFprobe fallisce o duration = 0)
/// - Quarantena non-distruttiva in `_NonConform/` con gestione collisioni
/// - Aggiornamento `conforming_status = 'non_conform'` nel DB

use regex::Regex;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use tauri::{Emitter, Manager};

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
}

// ── Logica interna ───────────────────────────────────────────────────────────

/// Compila i pattern regex una sola volta per tutta la sessione di analisi.
fn build_patterns() -> Vec<Regex> {
    NON_CONFORM_PATTERNS
        .iter()
        .map(|p| Regex::new(&format!("(?i){}", p)).expect("Invalid regex pattern"))
        .collect()
}

/// Verifica il filename (senza estensione) contro tutti i pattern YouTube.
/// Restituisce il pattern grezzo che ha fatto match, o None.
fn check_youtube_pattern(filename: &str, patterns: &[Regex]) -> Option<String> {
    // Lavora sul file stem (senza estensione) per evitare match sull'estensione
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename);

    for pattern in patterns {
        if pattern.is_match(stem) {
            return Some(pattern.as_str().to_string());
        }
    }
    None
}

/// Esegue `ffprobe` sul file e restituisce:
/// - `has_video`: true se è presente uno stream video
/// - `duration`: durata in secondi (0.0 se non rilevabile)
/// - `error`: Some(msg) se ffprobe non è eseguibile o restituisce errore
fn probe_file(path: &str, ffprobe_path: &str) -> (bool, f64, Option<String>) {
    let output = Command::new(ffprobe_path)
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
        Err(e) => (false, 0.0, Some(format!("ffprobe non eseguibile: {e}"))),
        Ok(out) if !out.status.success() => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            let msg = if stderr.is_empty() {
                format!("ffprobe exit code: {}", out.status)
            } else {
                stderr
            };
            (false, 0.0, Some(msg))
        }
        Ok(out) => {
            let json = String::from_utf8_lossy(&out.stdout);
            let has_video = json.contains(r#""codec_type": "video""#)
                || json.contains(r#""codec_type":"video""#);
            let duration = extract_duration_from_json(&json);
            (has_video, duration, None)
        }
    }
}

/// Estrae il valore di `"duration"` dal JSON FFprobe senza dipendenze extra.
/// Cerca la prima occorrenza — di solito nella sezione `format`.
fn extract_duration_from_json(json: &str) -> f64 {
    if let Some(pos) = json.find("\"duration\"") {
        let after = &json[pos + 10..]; // salta `"duration"`
        // Cerca la stringa del valore: `": "XX.XX"`
        if let Some(colon) = after.find(':') {
            let value_area = after[colon + 1..].trim_start();
            if value_area.starts_with('"') {
                let inner = &value_area[1..];
                if let Some(end) = inner.find('"') {
                    return inner[..end].parse::<f64>().unwrap_or(0.0);
                }
            }
        }
    }
    0.0
}

// ── Logica detect (sincrona — chiamata da spawn_blocking) ────────────────────

fn detect_non_conform_impl(
    app: tauri::AppHandle,
    ffprobe_path: Option<String>,
) -> Result<CleanerResult, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;

    let conn = Connection::open(data_dir.join("library.db"))
        .map_err(|e| format!("Cannot open DB: {e}"))?;

    // Legge solo i track con stato 'unknown' — già indicizzati ma non ancora analizzati
    let mut stmt = conn
        .prepare(
            "SELECT id, path, filename, COALESCE(file_size_bytes, 0) \
             FROM tracks WHERE conforming_status = 'unknown' ORDER BY id",
        )
        .map_err(|e| format!("DB prepare failed: {e}"))?;

    struct TrackRow {
        id: i64,
        path: String,
        filename: String,
        size: i64,
    }

    let tracks: Vec<TrackRow> = stmt
        .query_map([], |row| {
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
    let patterns = build_patterns();
    let ffprobe = ffprobe_path.as_deref();
    let mut non_conform: Vec<NonConformItem> = Vec::new();

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
                // File corrotto: FFprobe non riesce ad aprirlo
                non_conform.push(NonConformItem {
                    id: track.id,
                    path: track.path.clone(),
                    filename: track.filename.clone(),
                    reason: "corrupt".to_string(),
                    reason_detail: err_msg,
                    file_size_bytes: track.size,
                });
            } else if has_video {
                // File video mascherato da audio
                non_conform.push(NonConformItem {
                    id: track.id,
                    path: track.path.clone(),
                    filename: track.filename.clone(),
                    reason: "video_stream".to_string(),
                    reason_detail: "Video codec stream rilevato da FFprobe".to_string(),
                    file_size_bytes: track.size,
                });
            } else if duration == 0.0 {
                // Durata zero: file vuoto o corrotto
                non_conform.push(NonConformItem {
                    id: track.id,
                    path: track.path.clone(),
                    filename: track.filename.clone(),
                    reason: "corrupt".to_string(),
                    reason_detail: "Durata 0 — file vuoto o corrotto".to_string(),
                    file_size_bytes: track.size,
                });
            }
        }
    }

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

    let conn = Connection::open(data_dir.join("library.db"))
        .map_err(|e| format!("Cannot open DB: {e}"))?;

    // Crea la cartella di quarantena (non-distruttivo: mai eliminare)
    // Se l'utente ha specificato un path custom, usa quello; altrimenti <workspace>/_NonConform
    let quarantine_dir = match quarantine_path {
        Some(ref p) => std::path::PathBuf::from(p),
        None => Path::new(&workspace_path).join("_NonConform"),
    };
    std::fs::create_dir_all(&quarantine_dir)
        .map_err(|e| format!("Cannot create quarantine dir: {e}"))?;

    let mut moved = 0u64;
    let mut failed = 0u64;

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

                // Path di destinazione — collision-safe
                let dest = collision_safe_path(&quarantine_dir, &filename);

                match std::fs::rename(src, &dest) {
                    Ok(_) => {
                        moved += 1;
                        // Aggiorna path e status nel DB
                        let dest_str = dest.to_string_lossy().to_string();
                        let _ = conn.execute(
                            "UPDATE tracks SET path=?1, conforming_status='non_conform' WHERE id=?2",
                            rusqlite::params![dest_str, id],
                        );
                    }
                    Err(e) => {
                        eprintln!("[Cleaner] Move failed for {src_path}: {e}");
                        failed += 1;
                    }
                }
            }
        }
    }

    Ok(QuarantineResult { moved, failed })
}

/// Restituisce un path di destinazione che non causa collisioni.
/// Se `filename` esiste già in `dir`, aggiunge suffisso `_1`, `_2`, ecc.
fn collision_safe_path(dir: &Path, filename: &str) -> std::path::PathBuf {
    let candidate = dir.join(filename);
    if !candidate.exists() {
        return candidate;
    }

    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename);
    let ext = Path::new(filename)
        .extension()
        .and_then(|s| s.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default();

    let mut counter = 1u32;
    loop {
        let candidate = dir.join(format!("{stem}_{counter}{ext}"));
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

// ── Comandi Tauri pubblici ───────────────────────────────────────────────────

/// Analizza i track con `conforming_status = 'unknown'` nel DB.
/// Emette eventi `"cleaner-progress"` durante l'esecuzione.
/// Parametro `ffprobe_path`: path a ffprobe (o `null` per skip FFprobe checks).
#[tauri::command]
pub async fn detect_non_conform(
    app: tauri::AppHandle,
    ffprobe_path: Option<String>,
) -> Result<CleanerResult, String> {
    tokio::task::spawn_blocking(move || detect_non_conform_impl(app, ffprobe_path))
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
