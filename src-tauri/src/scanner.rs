/// scanner.rs — Scansione ricorsiva workspace audio
/// Runtime SoundMaster Pro — v0.5.11
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
///
/// Isolamento scansioni (v0.5.7):
/// All'avvio di una nuova scansione, conforming_status viene resettato
/// a 'unknown' per tutti i track del workspace, garantendo che ogni run
/// parta da uno stato pulito senza mescolare risultati di sessioni diverse.
/// Le cartelle _NonConform e _Duplicates vengono escluse dal WalkDir.

use crate::logger;
use crate::utils::workspace_like_prefix;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::Emitter;
use tauri::Manager;
use walkdir::WalkDir;

/// Estensioni audio riconosciute come file validi per la libreria.
const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "m4a", "aac", "ogg", "wma"];

/// Cartelle di quarantena da escludere sempre dalla scansione.
/// Sono sottocartelle del workspace create da The Cleaner.
const QUARANTINE_DIRS: &[&str] = &["_NonConform", "_Duplicates"];

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

    logger::log_separator("SCANNER START");
    logger::log_detail("SCANNER", &format!("Workspace: {}", workspace_path));

    // Connessione dedicata per lo scanner (WAL consente letture concorrenti)
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Scanner: cannot open DB: {e}"))?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
        .map_err(|e| format!("Scanner: PRAGMA failed: {e}"))?;

    // Pattern LIKE sicuro: wildcard escapate + separatore finale (fix v0.5.11)
    let like_pattern = workspace_like_prefix(&workspace_path);

    // ── Purga record orfani (fix v0.5.11) ───────────────────────────────────
    // File presenti nel DB ma non più su disco (cancellati, spostati o
    // rinominati fuori dall'app). Senza questa purga i record fantasma
    // venivano resettati a 'unknown' e detect_non_conform li flaggava come
    // falsi "corrupt" (ffprobe fallisce su path inesistenti).
    // La purga è limitata al workspace corrente: record di altri workspace
    // (potenzialmente su drive non montati) non vengono toccati.
    let mut orphan_ids: Vec<i64> = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT id, path FROM tracks WHERE path LIKE ?1 ESCAPE '!'")
            .map_err(|e| format!("Scanner: orphan query failed: {e}"))?;
        let rows = stmt
            .query_map([&like_pattern], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| format!("Scanner: orphan query failed: {e}"))?;
        for (id, path) in rows.filter_map(|r| r.ok()) {
            if !Path::new(&path).exists() {
                orphan_ids.push(id);
            }
        }
    }
    if !orphan_ids.is_empty() {
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("Scanner: purge transaction failed: {e}"))?;
        for id in &orphan_ids {
            let _ = tx.execute("DELETE FROM tracks WHERE id = ?1", [id]);
        }
        tx.commit()
            .map_err(|e| format!("Scanner: purge commit failed: {e}"))?;
        logger::log_detail(
            "SCANNER",
            &format!(
                "Purgati {} record orfani (file non più presenti su disco)",
                orphan_ids.len()
            ),
        );
    }

    // ── Isolamento scansione (fix v0.5.7, rivisto in v0.5.11) ────────────────
    // Reset conforming_status = 'unknown' per i track del workspace NON in
    // quarantena. I record con status 'non_conform'/'duplicate' (file già
    // spostati in _NonConform/_Duplicates) mantengono il loro stato: il reset
    // indiscriminato li reimmetteva nel ciclo di detection e la ri-quarantena
    // li rinominava in place con suffisso _1 (collisione con se stessi).
    // Se l'utente ripristina manualmente un file dalla quarantena, il vecchio
    // record viene eliminato dalla purga orfani qui sopra e il file viene
    // re-indicizzato come nuovo al pass 2.
    let reset_count = conn
        .execute(
            "UPDATE tracks SET conforming_status = 'unknown' \
             WHERE path LIKE ?1 ESCAPE '!' \
             AND conforming_status NOT IN ('non_conform', 'duplicate')",
            [&like_pattern],
        )
        .unwrap_or(0);

    if reset_count > 0 {
        logger::log_detail(
            "SCANNER",
            &format!(
                "Reset conforming_status='unknown' per {} track esistenti (isolamento scansione)",
                reset_count
            ),
        );
    }

    // Crea il record di sessione scansione
    conn.execute(
        "INSERT INTO scans (root_path, status) VALUES (?1, 'running')",
        [&workspace_path],
    )
    .map_err(|e| format!("Scanner: cannot create scan record: {e}"))?;
    let scan_id = conn.last_insert_rowid();

    logger::log_detail("SCANNER", &format!("Scan ID: {}", scan_id));

    // --- Fase 1: Discovery (conteggio — nessun accumulo in memoria) ---
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

    // Helper closure per filtrare i file audio — usata in entrambi i pass.
    // Esclude anche le cartelle di quarantena (_NonConform, _Duplicates) per
    // evitare che i file messi in quarantena vengano ri-indicizzati come 'unknown'.
    let is_audio_file = |entry: &walkdir::DirEntry| -> bool {
        // Esclude intere directory di quarantena (WalkDir le visita ma non processa i file dentro)
        if entry.file_type().is_dir() {
            if let Some(dir_name) = entry.file_name().to_str() {
                if QUARANTINE_DIRS.contains(&dir_name) {
                    return false;
                }
            }
        }
        entry.file_type().is_file()
            && entry
                .path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| AUDIO_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
                .unwrap_or(false)
            // Esclude file dentro cartelle di quarantena (check sul path padre)
            && !entry.path().components().any(|c| {
                c.as_os_str()
                    .to_str()
                    .map(|s| QUARANTINE_DIRS.contains(&s))
                    .unwrap_or(false)
            })
    };

    // Pass 1: conta i file audio senza allocare Vec<PathBuf>
    let total = WalkDir::new(&workspace_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| is_audio_file(e))
        .count() as u64;

    logger::log_detail("SCANNER", &format!("File audio trovati: {}", total));

    // --- Fase 2: Indicizzazione DB-First (stream diretto, senza collect) ---
    let mut stmt = conn
        .prepare(
            "INSERT OR IGNORE INTO tracks
             (path, filename, format, file_size_bytes, scan_id, conforming_status)
             VALUES (?1, ?2, ?3, ?4, ?5, 'unknown')",
        )
        .map_err(|e| format!("Scanner: cannot prepare statement: {e}"))?;

    let mut scanned = 0u64;
    let mut new_files = 0u64;
    for entry in WalkDir::new(&workspace_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| is_audio_file(e))
    {
        scanned += 1;
        let path = entry.path();

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

        // INSERT OR IGNORE: conta quanti file sono effettivamente nuovi
        if let Ok(n) = stmt.execute(params![path_str, filename, format, file_size, scan_id]) {
            if n > 0 {
                new_files += 1;
            }
        }

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

    logger::log_detail(
        "SCANNER",
        &format!(
            "Completata: {} file totali, {} nuovi, {:.2}s",
            total, new_files, duration
        ),
    );

    conn.execute(
        "UPDATE scans SET status='completed', total_files=?1, finished_at=datetime('now') WHERE id=?2",
        params![total as i64, scan_id],
    )
    .map_err(|e| format!("Scanner: cannot update scan record: {e}"))?;

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
