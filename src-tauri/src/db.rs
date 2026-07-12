/// db.rs — Modulo Database SQLite
/// Runtime SoundMaster Pro — v0.5.15
///
/// Responsabilità:
/// - Inizializzazione del database `library.db` con WAL mode
/// - Schema iniziale: tabelle `tracks`, `scans`, `cover_art` + trigger FTS5
/// - `open_db`: connessione con PRAGMA per-connessione (foreign_keys, synchronous)
/// - Path: <app_data_dir>/library.db (direttamente nella app data dir Tauri)

use rusqlite::{Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
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

    -- Trigger di sincronizzazione FTS5 (fix v0.5.15 — criticità 11):
    -- una tabella FTS external-content NON si popola da sola. Senza questi
    -- trigger tracks_fts restava vuota per sempre.
    CREATE TRIGGER IF NOT EXISTS tracks_fts_ai AFTER INSERT ON tracks BEGIN
        INSERT INTO tracks_fts(rowid, artist, title, album, genre)
        VALUES (new.id, new.artist, new.title, new.album, new.genre);
    END;
    CREATE TRIGGER IF NOT EXISTS tracks_fts_ad AFTER DELETE ON tracks BEGIN
        INSERT INTO tracks_fts(tracks_fts, rowid, artist, title, album, genre)
        VALUES ('delete', old.id, old.artist, old.title, old.album, old.genre);
    END;
    CREATE TRIGGER IF NOT EXISTS tracks_fts_au AFTER UPDATE ON tracks BEGIN
        INSERT INTO tracks_fts(tracks_fts, rowid, artist, title, album, genre)
        VALUES ('delete', old.id, old.artist, old.title, old.album, old.genre);
        INSERT INTO tracks_fts(rowid, artist, title, album, genre)
        VALUES (new.id, new.artist, new.title, new.album, new.genre);
    END;

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

    // PRAGMA per-connessione (fix v0.5.15 — criticità 12): foreign_keys è OFF
    // di default in SQLite e va attivato su OGNI connessione. Senza questo,
    // il ON DELETE CASCADE di cover_art non funzionerebbe mai.
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    // Rebuild una tantum dell'indice FTS (fix v0.5.15 — criticità 11):
    // i DB creati prima dei trigger hanno tracks popolata ma tracks_fts vuota.
    // Il rebuild rilegge tutta la tabella content — eseguito solo se serve.
    let tracks_count: i64 = conn.query_row("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))?;
    let fts_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM tracks_fts", [], |r| r.get(0))
        .unwrap_or(0);
    if tracks_count > 0 && fts_count == 0 {
        conn.execute_batch("INSERT INTO tracks_fts(tracks_fts) VALUES('rebuild');")?;
    }

    Ok(conn)
}

/// Apre una connessione al DB con i PRAGMA per-connessione corretti.
/// Da usare in ogni comando invece di `Connection::open` diretto:
/// - `foreign_keys=ON` — OFF di default in SQLite (criticità 12)
/// - `synchronous=NORMAL` — compromesso corretto in WAL mode
/// (journal_mode=WAL è una proprietà persistente del file DB, già impostata
/// da `init_database` — non serve ripeterla qui.)
pub fn open_db(app_data_dir: &std::path::Path) -> Result<Connection, String> {
    let conn = Connection::open(app_data_dir.join("library.db"))
        .map_err(|e| format!("Cannot open DB: {e}"))?;
    conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;")
        .map_err(|e| format!("DB PRAGMA failed: {e}"))?;
    Ok(conn)
}

/// Statistiche aggregate della libreria — esposte all'Hub UI.
#[derive(Debug, Serialize, Deserialize)]
pub struct LibraryStats {
    pub total_tracks: i64,
    pub non_conform: i64,  // conforming_status = 'non_conform'
    pub duplicates: i64,   // conforming_status = 'duplicate'
    pub to_verify: i64,    // conforming_status = 'to_verify'
}

/// Comando Tauri: restituisce le statistiche aggregate della libreria.
/// Fix v0.5.15 (criticità 20): gli errori di query non vengono più mascherati
/// con `.unwrap_or(0)` — un DB corrotto ora produce un errore esplicito
/// invece di mostrare silenziosamente "0 tracks".
#[tauri::command]
pub fn get_library_stats(app: tauri::AppHandle) -> Result<LibraryStats, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;

    let conn = open_db(&data_dir)?;

    let count_where = |cond: &str| -> Result<i64, String> {
        conn.query_row(
            &format!("SELECT COUNT(*) FROM tracks WHERE conforming_status='{cond}'"),
            [],
            |r| r.get(0),
        )
        .map_err(|e| format!("Stats query failed ({cond}): {e}"))
    };

    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))
        .map_err(|e| format!("Stats query failed (total): {e}"))?;

    Ok(LibraryStats {
        total_tracks: total,
        non_conform: count_where("non_conform")?,
        duplicates: count_where("duplicate")?,
        to_verify: count_where("to_verify")?,
    })
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
