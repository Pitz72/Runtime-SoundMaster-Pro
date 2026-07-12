/// scanner.rs — Scansione ricorsiva workspace audio
/// Runtime SoundMaster Pro — v0.5.17
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

/// Metadati estratti da un file audio via lofty (fix v0.5.17 — criticità 10).
struct TrackMeta {
    artist: Option<String>,
    title: Option<String>,
    album: Option<String>,
    genre: Option<String>,
    year: Option<i64>,
    bitrate_kbps: Option<i64>,
    sample_rate: Option<i64>,
    duration_secs: Option<f64>,
}

/// Legge tag e proprietà audio con lofty. Restituisce `None` se il file non è
/// leggibile (corrotto/formato non riconosciuto) — la detection dei corrotti
/// resta responsabilità di FFprobe nel Cleaner; qui si degrada in silenzio.
/// Le stringhe vuote nei tag vengono normalizzate a NULL, così la fase
/// metadata dei duplicati non raggruppa file con tag vuoti.
fn read_tags(path: &std::path::Path) -> Option<TrackMeta> {
    use lofty::file::TaggedFileExt;
    use lofty::prelude::{Accessor, AudioFile};

    let tagged = lofty::read_from_path(path).ok()?;
    let props = tagged.properties();
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());

    let clean = |s: Option<std::borrow::Cow<'_, str>>| -> Option<String> {
        s.map(|c| c.trim().to_string()).filter(|s| !s.is_empty())
    };

    // L'anno può essere una data completa ("2021-05-01") — si estraggono
    // le prime 4 cifre. ItemKey::Year copre TYER/TDRC/DATE nei vari formati.
    let year = tag
        .and_then(|t| t.get_string(lofty::tag::ItemKey::Year))
        .and_then(|s| {
            let digits: String = s.chars().take_while(|c| c.is_ascii_digit()).collect();
            digits.parse::<i64>().ok()
        })
        .filter(|y| (1000..=9999).contains(y));

    let duration = props.duration().as_secs_f64();
    Some(TrackMeta {
        artist: tag.and_then(|t| clean(t.artist())),
        title: tag.and_then(|t| clean(t.title())),
        album: tag.and_then(|t| clean(t.album())),
        genre: tag.and_then(|t| clean(t.genre())),
        year,
        bitrate_kbps: props.audio_bitrate().map(|b| b as i64),
        sample_rate: props.sample_rate().map(|s| s as i64),
        duration_secs: if duration > 0.0 { Some(duration) } else { None },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Smoke test manuale su file audio reali — ignorato di default perché
    /// dipende dalla macchina. Eseguire con:
    ///   cargo test read_tags_smoke -- --ignored --nocapture
    #[test]
    #[ignore]
    fn read_tags_smoke() {
        let dir = std::path::Path::new(r"C:\Users\Utente\Music\Genesis");
        if !dir.is_dir() {
            eprintln!("skip: cartella di test non presente");
            return;
        }
        let mut checked = 0;
        for entry in std::fs::read_dir(dir).unwrap().filter_map(|e| e.ok()).take(5) {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("flac") || e.eq_ignore_ascii_case("mp3")).unwrap_or(false) {
                let meta = read_tags(&p).expect("file audio reale deve essere leggibile");
                eprintln!(
                    "{:?} → artist={:?} title={:?} bitrate={:?} dur={:?}",
                    p.file_name().unwrap(), meta.artist, meta.title, meta.bitrate_kbps, meta.duration_secs
                );
                assert!(meta.duration_secs.unwrap_or(0.0) > 0.0);
                checked += 1;
            }
        }
        assert!(checked > 0, "nessun file audio trovato nella cartella di test");
    }
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

    // ── Validazione workspace (fix v0.5.15 — criticità 13) ──────────────────
    // Prima gli errori WalkDir venivano filtrati con .ok(): una cartella
    // inesistente o inaccessibile produceva una scansione "riuscita" con
    // 0 file, senza alcun segnale all'utente.
    if !Path::new(&workspace_path).is_dir() {
        let msg = format!(
            "Workspace non valido o inaccessibile: {}",
            workspace_path
        );
        logger::log_detail("SCANNER", &format!("ERRORE: {}", msg));
        app.emit(
            "scan-progress",
            ScanProgress {
                scanned: 0,
                total: 0,
                current_file: msg.clone(),
                phase: String::from("error"),
            },
        )
        .ok();
        return Err(msg);
    }

    // Connessione dedicata per lo scanner (WAL consente letture concorrenti).
    // journal_mode=WAL è persistente nel file DB; open_db imposta i PRAGMA
    // per-connessione (foreign_keys, synchronous).
    let data_dir = db_path
        .parent()
        .ok_or_else(|| "Scanner: invalid DB path".to_string())?;
    let conn = crate::db::open_db(data_dir)?;

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
    // Confronto case-insensitive (fix v0.5.15 — criticità 29): i filesystem
    // Windows sono case-insensitive — "_nonconform" è la stessa cartella di
    // "_NonConform" e va esclusa allo stesso modo.
    let is_quarantine_name = |name: &str| -> bool {
        QUARANTINE_DIRS.iter().any(|q| q.eq_ignore_ascii_case(name))
    };

    let is_audio_file = |entry: &walkdir::DirEntry| -> bool {
        entry.file_type().is_file()
            && entry
                .path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| AUDIO_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
                .unwrap_or(false)
            // Esclude file dentro cartelle di quarantena (check su tutti i componenti del path)
            && !entry.path().components().any(|c| {
                c.as_os_str()
                    .to_str()
                    .map(is_quarantine_name)
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

    // Mappa dei track già indicizzati: path → (size, ha già artist).
    // Serve per decidere quali file necessitano della lettura tag
    // (fix v0.5.17 — criticità 10): nuovi, modificati su disco, o indicizzati
    // da versioni precedenti che non estraevano i metadati.
    let mut existing: std::collections::HashMap<String, (i64, bool)> =
        std::collections::HashMap::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT path, COALESCE(file_size_bytes, 0), artist IS NOT NULL \
                 FROM tracks WHERE path LIKE ?1 ESCAPE '!'",
            )
            .map_err(|e| format!("Scanner: existing query failed: {e}"))?;
        let rows = stmt
            .query_map([&like_pattern], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    (row.get::<_, i64>(1)?, row.get::<_, bool>(2)?),
                ))
            })
            .map_err(|e| format!("Scanner: existing query failed: {e}"))?;
        for (path, info) in rows.filter_map(|r| r.ok()) {
            existing.insert(path, info);
        }
    }

    // --- Fase 2: Indicizzazione DB-First (stream diretto, senza collect) ---
    // Upsert (fix v0.5.15 — criticità 14): il vecchio INSERT OR IGNORE non
    // aggiornava mai file_size/format/scan_id di file già indicizzati — se un
    // file cambiava su disco, il pre-filtro per dimensione dei duplicati
    // lavorava su dati stale. ON CONFLICT aggiorna i campi filesystem
    // preservando i metadati (artist/title/...) e lo status.
    //
    // Estrazione metadati (fix v0.5.17 — criticità 10): prima di questa
    // versione NESSUN modulo popolava artist/title/bitrate/duration — la fase
    // "metadata" dei duplicati era di fatto morta e il best-pick decideva solo
    // su formato+dimensione. I tag vengono letti con lofty (crate nativo,
    // nessun subprocess) solo per i file nuovi/modificati/mai taggati: i
    // rescan su librerie già taggate restano veloci.
    //
    // L'intero pass gira in una transazione unica: 36k upsert+update in
    // autocommit sarebbero 36k commit WAL. La scansione è ri-eseguibile,
    // quindi la perdita del batch in caso di crash è accettabile.
    let rows_before: i64 = conn
        .query_row("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))
        .unwrap_or(0);

    let mut scanned = 0u64;
    let mut tags_read = 0u64;
    let mut tag_failures = 0u64;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Scanner: index transaction failed: {e}"))?;
    {
        let mut upsert = tx
            .prepare(
                "INSERT INTO tracks
                 (path, filename, format, file_size_bytes, scan_id, conforming_status)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'unknown')
                 ON CONFLICT(path) DO UPDATE SET
                   filename = excluded.filename,
                   format = excluded.format,
                   file_size_bytes = excluded.file_size_bytes,
                   scan_id = excluded.scan_id",
            )
            .map_err(|e| format!("Scanner: cannot prepare statement: {e}"))?;

        // COALESCE su duration_secs: non sovrascrive una durata già presente
        // (es. calcolata da fpcalc) con NULL se i tag non la riportano.
        let mut tag_update = tx
            .prepare(
                "UPDATE tracks SET
                   artist = ?1, title = ?2, album = ?3, genre = ?4, year = ?5,
                   bitrate = ?6, sample_rate = ?7,
                   duration_secs = COALESCE(?8, duration_secs)
                 WHERE path = ?9",
            )
            .map_err(|e| format!("Scanner: cannot prepare tag statement: {e}"))?;

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

            let _ = upsert.execute(params![path_str, filename, format, file_size, scan_id]);

            // Tag da leggere solo se: file nuovo, dimensione cambiata,
            // o record esistente senza artist (indicizzato pre-v0.5.17)
            let needs_tags = match existing.get(&path_str) {
                Some((known_size, has_artist)) => *known_size != file_size || !*has_artist,
                None => true,
            };

            if needs_tags {
                match read_tags(path) {
                    Some(meta) => {
                        tags_read += 1;
                        let _ = tag_update.execute(params![
                            meta.artist,
                            meta.title,
                            meta.album,
                            meta.genre,
                            meta.year,
                            meta.bitrate_kbps,
                            meta.sample_rate,
                            meta.duration_secs,
                            path_str
                        ]);
                    }
                    None => tag_failures += 1,
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
    }
    tx.commit()
        .map_err(|e| format!("Scanner: index commit failed: {e}"))?;

    if tags_read > 0 || tag_failures > 0 {
        logger::log_detail(
            "SCANNER",
            &format!(
                "Metadati: {} file taggati, {} senza tag leggibili",
                tags_read, tag_failures
            ),
        );
    }

    let duration = start.elapsed().as_secs_f64();

    let rows_after: i64 = conn
        .query_row("SELECT COUNT(*) FROM tracks", [], |r| r.get(0))
        .unwrap_or(rows_before);
    let new_files = (rows_after - rows_before).max(0) as u64;

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
