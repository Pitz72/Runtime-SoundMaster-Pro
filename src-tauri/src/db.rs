/// db.rs — Modulo Database SQLite
/// Runtime SoundMaster Pro — v0.1.0
///
/// Responsabilità:
/// - Inizializzazione del database `library.db` con WAL mode
/// - Schema iniziale: tabelle `tracks`, `scans`, `cover_art`
/// - Path: <app_data_dir>/runtime-soundmaster-pro/library.db

use rusqlite::{Connection, Result as SqlResult};
use std::path::PathBuf;
use tauri::Manager;

/// Schema SQL per l'inizializzazione del database.
/// Tutte le CREATE TABLE usano IF NOT EXISTS per idempotenza.
const INIT_SQL: &str = "
    -- WAL mode: obbligatoria per prestazioni e concorrenza sicura
    -- (lezione da RuntimeAudioManagerPro: SQLite_BUSY senza WAL)
    PRAGMA journal_mode=WAL;

    -- Cache ottimizzata: 64MB (64000 * 1KB)
    PRAGMA cache_size=-64000;

    -- Sincronizzazione normale: buon compromesso velocità/sicurezza in WAL
    PRAGMA synchronous=NORMAL;

    -- Tabella principale: ogni brano scansionato dalla libreria
    CREATE TABLE IF NOT EXISTS tracks (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        path            TEXT NOT NULL UNIQUE,      -- path assoluto del file
        filename        TEXT NOT NULL,
        artist          TEXT,
        title           TEXT,
        album           TEXT,
        year            INTEGER,
        genre           TEXT,
        bitrate         INTEGER,                   -- kbps
        sample_rate     INTEGER,                   -- Hz
        duration_secs   REAL,
        file_size_bytes INTEGER,
        format          TEXT,                      -- 'mp3', 'flac', 'wav', ecc.
        fingerprint     TEXT,                      -- AcoustID fingerprint
        cover_hash      TEXT,                      -- SHA-256 della cover embedded
        scan_id         INTEGER,                   -- FK -> scans.id
        conforming_status TEXT DEFAULT 'unknown',  -- 'ok', 'non_conform', 'duplicate', 'to_verify'
        created_at      TEXT DEFAULT (datetime('now'))
    );

    -- Indice composito per ricerche rapide artista+titolo (deduplicazione)
    CREATE INDEX IF NOT EXISTS idx_tracks_artist_title
        ON tracks (artist, title);

    -- Indice per lo stato di conformità (filtri rapidi nella Review UI)
    CREATE INDEX IF NOT EXISTS idx_tracks_status
        ON tracks (conforming_status);

    -- FTS5: Full-Text Search su librerie da 500.000+ brani
    CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
        artist, title, album, genre,
        content='tracks',
        content_rowid='id'
    );

    -- Tabella sessioni di scansione
    CREATE TABLE IF NOT EXISTS scans (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        root_path   TEXT NOT NULL,                 -- cartella radice scansionata
        status      TEXT DEFAULT 'running',        -- 'running', 'completed', 'failed'
        total_files INTEGER DEFAULT 0,
        stats_json  TEXT,                          -- JSON: { duplicates, non_conform, ok }
        started_at  TEXT DEFAULT (datetime('now')),
        finished_at TEXT
    );

    -- Tabella cover art (BLOB separato per non gonfiare la tabella tracks)
    CREATE TABLE IF NOT EXISTS cover_art (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id  INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        data      BLOB NOT NULL,                   -- immagine JPEG raw
        format    TEXT DEFAULT 'jpeg',
        width     INTEGER,
        height    INTEGER,
        file_size INTEGER
    );

    -- Indice cover art per track_id
    CREATE INDEX IF NOT EXISTS idx_cover_art_track
        ON cover_art (track_id);
";

/// Inizializza (o apre) il database SQLite nella directory dati dell'app.
/// Crea lo schema completo se non esiste ancora.
///
/// # Parametri
/// - `app_data_dir`: directory dati Tauri (es. %APPDATA%/runtime-soundmaster-pro)
///
/// # Errori
/// Restituisce `Err` se il file non può essere creato o lo schema SQL fallisce.
pub fn init_database(app_data_dir: &PathBuf) -> SqlResult<Connection> {
    // Garantisce che la directory esista
    std::fs::create_dir_all(app_data_dir).map_err(|e| {
        rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
            Some(format!("Cannot create app data dir: {e}")),
        )
    })?;

    let db_path = app_data_dir.join("library.db");
    let conn = Connection::open(&db_path)?;

    // Esegue l'intero script di inizializzazione
    conn.execute_batch(INIT_SQL)?;

    Ok(conn)
}

/// Comand Tauri: verifica che il DB sia inizializzato e restituisce il path.
/// Utilizzato dall'Hub UI per mostrare lo stato del catalogo.
#[tauri::command]
pub fn db_status(app: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;

    let db_path = data_dir.join("library.db");

    if db_path.exists() {
        Ok(format!("OK — {}", db_path.display()))
    } else {
        // Inizializza al primo utilizzo
        init_database(&data_dir).map_err(|e| format!("DB init failed: {e}"))?;
        Ok(format!("INITIALIZED — {}", db_path.display()))
    }
}
