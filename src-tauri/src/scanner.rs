/// scanner.rs — Scansione ricorsiva workspace audio
/// Runtime SoundMaster Pro — v0.3.0
///
/// Responsabilità:
/// - Scansione ricorsiva della cartella workspace
/// - Filtro estensioni audio supportate
/// - Inserimento DB-First in SQLite (nessun accumulo in RAM)
/// - Streaming progress events verso il frontend via Tauri emit
///
/// Architettura DB-First (lezione da RuntimeAudioManagerPro):
/// ogni file trovato viene scritto su SQLite immediatamente,
/// senza accumulo in Vec per non saturare la RAM su librerie grandi.

use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Emitter;
use tauri::Manager;
use walkdir::WalkDir;

/// Estensioni audio riconosciute come file validi per la libreria.
const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "m4a", "aac", "ogg", "wma"];

/// Payload degli eventi di progresso emessi verso il frontend.
/// Evento Tauri: "scan-progress"
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScanProgress {
    /// File processati finora
    pub scanned: u64,
    /// Totale file audio trovati (0 durante la fase discovery)
    pub total: u64,
    /// Nome del file corrente (stringa vuota a fine scansione)
    pub current_file: String,
    /// Fase corrente: "discovering" | "indexing" | "complete" | "error"
    pub phase: String,
}

/// Risultato finale restituito al frontend alla fine della scansione.
#[derive(Debug, Serialize, Deserialize)]
pub struct ScanResult {
    pub scan_id: i64,
    pub total_files: u64,
    pub duration_secs: f64,
}

/// Logica di scansione eseguita in thread bloccante (spawn_blocking).
/// Apre una connessione SQLite dedicata — safe con WAL mode.
fn scan_workspace_impl(
    workspace_path: String,
    app: tauri::AppHandle,
    db_path: PathBuf,
) -> Result<ScanResult, String> {
    let start = std::time::Instant::now();

    // Connessione dedicata per lo scanner (WAL consente letture concorrenti)
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Scanner: cannot open DB: {e}"))?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
        .map_err(|e| format!("Scanner: PRAGMA failed: {e}"))?;

    // Crea il record di sessione scansione
    conn.execute(
        "INSERT INTO scans (root_path, status) VALUES (?1, 'running')",
        [&workspace_path],
    )
    .map_err(|e| format!("Scanner: cannot create scan record: {e}"))?;
    let scan_id = conn.last_insert_rowid();

    // --- Fase 1: Discovery ---
    // Emette evento iniziale e raccoglie i path (la lista è leggera —
    // contiene solo PathBuf, non i contenuti dei file)
    app.emit(
        "scan-progress",
        ScanProgress {
            scanned: 0,
            total: 0,
            current_file: String::from("Discovering audio files..."),
            phase: String::from("discovering"),
        },
    )
    .ok();

    let audio_files: Vec<PathBuf> = WalkDir::new(&workspace_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_file())
        .filter(|entry| {
            entry
                .path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| AUDIO_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
                .unwrap_or(false)
        })
        .map(|entry| entry.into_path())
        .collect();

    let total = audio_files.len() as u64;

    // --- Fase 2: Indicizzazione DB-First ---
    // Prepariamo lo statement una sola volta fuori dal loop (performance)
    let mut stmt = conn
        .prepare(
            "INSERT OR IGNORE INTO tracks
             (path, filename, format, file_size_bytes, scan_id, conforming_status)
             VALUES (?1, ?2, ?3, ?4, ?5, 'unknown')",
        )
        .map_err(|e| format!("Scanner: cannot prepare statement: {e}"))?;

    for (i, path) in audio_files.iter().enumerate() {
        let scanned = i as u64 + 1;

        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let format = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("unknown")
            .to_lowercase();

        let file_size = std::fs::metadata(path)
            .map(|m| m.len() as i64)
            .unwrap_or(0);

        let path_str = path.to_string_lossy().to_string();

        // INSERT OR IGNORE: i file già indicizzati vengono saltati
        // (sicurezza per rescansioni incrementali)
        stmt.execute(params![path_str, filename, format, file_size, scan_id])
            .ok();

        // Emit ogni 100 file o sull'ultimo — bilanciamento tra
        // granularità del feedback e overhead IPC
        if scanned % 100 == 0 || scanned == total {
            app.emit(
                "scan-progress",
                ScanProgress {
                    scanned,
                    total,
                    current_file: filename,
                    phase: String::from("indexing"),
                },
            )
            .ok();
        }
    }

    let duration = start.elapsed().as_secs_f64();

    // Aggiorna il record di sessione con il risultato
    conn.execute(
        "UPDATE scans SET status='completed', total_files=?1, finished_at=datetime('now') WHERE id=?2",
        params![total as i64, scan_id],
    )
    .map_err(|e| format!("Scanner: cannot update scan record: {e}"))?;

    // Evento finale — il frontend lo usa per aggiornare le statistiche
    app.emit(
        "scan-progress",
        ScanProgress {
            scanned: total,
            total,
            current_file: String::new(),
            phase: String::from("complete"),
        },
    )
    .ok();

    Ok(ScanResult {
        scan_id,
        total_files: total,
        duration_secs: duration,
    })
}

/// Comando Tauri: avvia la scansione del workspace in background.
/// Restituisce il ScanResult finale; il progresso arriva via eventi "scan-progress".
///
/// Usa spawn_blocking perché rusqlite e walkdir sono operazioni sincrone.
/// L'AppHandle è Send + 'static in Tauri 2, sicuro da passare al thread.
#[tauri::command]
pub async fn scan_workspace(
    path: String,
    app: tauri::AppHandle,
) -> Result<ScanResult, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;
    let db_path = data_dir.join("library.db");

    tokio::task::spawn_blocking(move || scan_workspace_impl(path, app, db_path))
        .await
        .map_err(|e| format!("Scanner thread panicked: {e}"))?
}
