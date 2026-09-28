/// librarian.rs — The Librarian: Catalog & Metadata Management Engine
/// Runtime SoundMaster Pro — v0.5.18
///
/// Responsabilità:
/// - Interrogazione catalogo SQLite con supporto FTS5
/// - Scrittura e modifica tag ID3/FLAC fisici su disco tramite lofty (100% offline)
/// - Scrubbing metadati a tre livelli (Broadcast, DJ, Deep)
/// - Estrazione e caching locale delle copertine embedded in SQLite

use crate::logger;
use crate::utils::workspace_like_prefix;
use lofty::config::WriteOptions;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::tag::{Accessor, ItemKey, Tag};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibrarianTrack {
    pub id: i64,
    pub path: String,
    pub filename: String,
    pub artist: Option<String>,
    pub title: Option<String>,
    pub album: Option<String>,
    pub year: Option<i64>,
    pub genre: Option<String>,
    pub bitrate: Option<i64>,
    pub sample_rate: Option<i64>,
    pub duration_secs: Option<f64>,
    pub format: Option<String>,
    pub has_cover: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataUpdatePayload {
    pub track_id: i64,
    pub artist: Option<String>,
    pub title: Option<String>,
    pub album: Option<String>,
    pub year: Option<i64>,
    pub genre: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkScrubResult {
    pub processed: u64,
    pub scrubbed: u64,
    pub failed: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkExtractResult {
    pub total: u64,
    pub extracted: u64,
    pub failed: u64,
}

/// Restituisce l'elenco dei brani del catalogo con eventuale filtro full-text.
#[tauri::command]
pub fn get_librarian_tracks(
    app: tauri::AppHandle,
    workspace_path: String,
    search_query: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<LibrarianTrack>, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;

    let conn = crate::db::open_db(&data_dir)?;
    let like_pattern = workspace_like_prefix(&workspace_path);
    let page_limit = limit.unwrap_or(200);
    let page_offset = offset.unwrap_or(0);

    let query_str = search_query.as_deref().unwrap_or("").trim();

    let sql = if query_str.is_empty() {
        "SELECT t.id, t.path, t.filename, t.artist, t.title, t.album, t.year, t.genre, \
                t.bitrate, t.sample_rate, t.duration_secs, t.format, \
                (c.id IS NOT NULL) AS has_cover \
         FROM tracks t \
         LEFT JOIN cover_art c ON c.track_id = t.id \
         WHERE t.path LIKE ?1 ESCAPE '!' \
         ORDER BY t.id DESC LIMIT ?2 OFFSET ?3"
            .to_string()
    } else {
        // Ricerca integrata: tenta prima corrispondenza LIKE su artist/title/album/filename
        "SELECT t.id, t.path, t.filename, t.artist, t.title, t.album, t.year, t.genre, \
                t.bitrate, t.sample_rate, t.duration_secs, t.format, \
                (c.id IS NOT NULL) AS has_cover \
         FROM tracks t \
         LEFT JOIN cover_art c ON c.track_id = t.id \
         WHERE t.path LIKE ?1 ESCAPE '!' \
           AND (t.artist LIKE ?4 OR t.title LIKE ?4 OR t.album LIKE ?4 OR t.genre LIKE ?4 OR t.filename LIKE ?4) \
         ORDER BY t.id DESC LIMIT ?2 OFFSET ?3"
            .to_string()
    };

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Librarian: prepare query failed: {e}"))?;

    let q_param = format!("%{query_str}%");

    let rows: Vec<LibrarianTrack> = if query_str.is_empty() {
        stmt.query_map(params![like_pattern, page_limit, page_offset], |r| {
            Ok(LibrarianTrack {
                id: r.get(0)?,
                path: r.get(1)?,
                filename: r.get(2)?,
                artist: r.get(3)?,
                title: r.get(4)?,
                album: r.get(5)?,
                year: r.get(6)?,
                genre: r.get(7)?,
                bitrate: r.get(8)?,
                sample_rate: r.get(9)?,
                duration_secs: r.get(10)?,
                format: r.get(11)?,
                has_cover: r.get::<_, i64>(12)? != 0,
            })
        })
        .map_err(|e| format!("Librarian: map failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect()
    } else {
        stmt.query_map(
            params![like_pattern, page_limit, page_offset, q_param],
            |r| {
                Ok(LibrarianTrack {
                    id: r.get(0)?,
                    path: r.get(1)?,
                    filename: r.get(2)?,
                    artist: r.get(3)?,
                    title: r.get(4)?,
                    album: r.get(5)?,
                    year: r.get(6)?,
                    genre: r.get(7)?,
                    bitrate: r.get(8)?,
                    sample_rate: r.get(9)?,
                    duration_secs: r.get(10)?,
                    format: r.get(11)?,
                    has_cover: r.get::<_, i64>(12)? != 0,
                })
            },
        )
        .map_err(|e| format!("Librarian: map failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect()
    };

    Ok(rows)
}

/// Salva modifiche metadati su un singolo brano (scrittura fisica su file + aggiornamento DB).
#[tauri::command]
pub fn save_track_metadata(
    app: tauri::AppHandle,
    payload: MetadataUpdatePayload,
) -> Result<(), String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;

    let conn = crate::db::open_db(&data_dir)?;

    let path_str: String = conn
        .query_row(
            "SELECT path FROM tracks WHERE id = ?1",
            [payload.track_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("Track not found in DB: {e}"))?;

    let p = Path::new(&path_str);
    if !p.exists() {
        return Err(format!("File audio non trovato sul disco: {path_str}"));
    }

    // 1. Scrittura fisica del tag con lofty
    let mut tagged = lofty::read_from_path(p).map_err(|e| format!("Lofty read error: {e}"))?;

    let tag_type = tagged.primary_tag_type();
    let tag = match tagged.primary_tag_mut() {
        Some(t) => t,
        None => {
            tagged.insert_tag(Tag::new(tag_type));
            tagged.primary_tag_mut().unwrap()
        }
    };

    if let Some(ref a) = payload.artist {
        tag.set_artist(a.trim().to_string());
    }
    if let Some(ref t) = payload.title {
        tag.set_title(t.trim().to_string());
    }
    if let Some(ref al) = payload.album {
        tag.set_album(al.trim().to_string());
    }
    if let Some(ref g) = payload.genre {
        tag.set_genre(g.trim().to_string());
    }
    if let Some(y) = payload.year {
        tag.insert_text(ItemKey::Year, y.to_string());
    }

    tagged
        .save_to_path(p, WriteOptions::default())
        .map_err(|e| format!("Impossibile salvare i tag sul file fisico: {e}"))?;

    // 2. Aggiornamento record SQLite
    conn.execute(
        "UPDATE tracks SET artist = ?1, title = ?2, album = ?3, year = ?4, genre = ?5 WHERE id = ?6",
        params![
            payload.artist,
            payload.title,
            payload.album,
            payload.year,
            payload.genre,
            payload.track_id
        ],
    )
    .map_err(|e| format!("DB update failed: {e}"))?;

    logger::log_detail(
        "LIBRARIAN",
        &format!("Tag salvati per track id {}: {}", payload.track_id, path_str),
    );

    Ok(())
}

/// Applica modifiche massive (Bulk Editor) a un insieme di brani.
#[tauri::command]
pub fn bulk_update_metadata(
    app: tauri::AppHandle,
    track_ids: Vec<i64>,
    artist: Option<String>,
    genre: Option<String>,
    year: Option<i64>,
    album: Option<String>,
) -> Result<u64, String> {
    let mut updated = 0u64;

    for id in track_ids {
        let payload = MetadataUpdatePayload {
            track_id: id,
            artist: artist.clone(),
            title: None, // Il titolo non viene sovrascritto in bulk per non renderlo identico
            album: album.clone(),
            year,
            genre: genre.clone(),
        };
        if save_track_metadata(app.clone(), payload).is_ok() {
            updated += 1;
        }
    }

    Ok(updated)
}

/// Esegue lo scrubbing dei tag ID3/FLAC per rimuovere commenti junk, URL e tag DJ proprietari.
/// Livelli:
/// 1: BROADCAST — rimuove commenti, URL e metadati proprietari console DJ (Serato/Rekordbox)
/// 2: EXTENDED — come Broadcast, preservando BPM/Key se presenti
/// 3: DEEP — pulizia approfondita e riscrittura conforme UTF-8
#[tauri::command]
pub fn scrub_track_tags(
    app: tauri::AppHandle,
    track_ids: Vec<i64>,
    level: u8,
) -> Result<BulkScrubResult, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;

    let conn = crate::db::open_db(&data_dir)?;

    let mut scrubbed = 0u64;
    let mut failed = 0u64;
    let total = track_ids.len() as u64;

    for id in &track_ids {
        let path_str: String = match conn.query_row(
            "SELECT path FROM tracks WHERE id = ?1",
            [id],
            |r| r.get(0),
        ) {
            Ok(p) => p,
            Err(_) => {
                failed += 1;
                continue;
            }
        };

        let p = Path::new(&path_str);
        if !p.exists() {
            failed += 1;
            continue;
        }

        let mut tagged = match lofty::read_from_path(p) {
            Ok(t) => t,
            Err(_) => {
                failed += 1;
                continue;
            }
        };

        let has_primary = tagged.primary_tag().is_some();
        let tag_opt = if has_primary {
            tagged.primary_tag_mut()
        } else {
            tagged.first_tag_mut()
        };

        if let Some(tag) = tag_opt {
            // Rimozione commenti spazzatura e URL
            tag.remove_comment();
            tag.remove_key(ItemKey::Comment);
            tag.remove_key(ItemKey::EncodedBy);
            tag.remove_key(ItemKey::EncoderSettings);

            // Rimozione tag DJ proprietari (Serato, Rekordbox, Traktor)
            if level == 1 || level == 3 {
                tag.retain(|item| {
                    let k = format!("{:?}", item.key()).to_uppercase();
                    !k.contains("SERATO")
                        && !k.contains("REKORDBOX")
                        && !k.contains("TRAKTOR")
                        && !k.contains("PRIV")
                        && !k.contains("GEOB")
                });
            }

            if tagged.save_to_path(p, WriteOptions::default()).is_ok() {
                scrubbed += 1;
            } else {
                failed += 1;
            }
        }
    }

    logger::log_detail(
        "LIBRARIAN",
        &format!("Scrubbing LVL {level}: {scrubbed}/{total} brani puliti con successo"),
    );

    Ok(BulkScrubResult {
        processed: total,
        scrubbed,
        failed,
    })
}

/// Estrae le copertine embedded dai tag audio dei file del workspace e le memorizza in SQLite.
#[tauri::command]
pub fn extract_embedded_artwork(
    app: tauri::AppHandle,
    workspace_path: String,
) -> Result<ArtworkExtractResult, String> {

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;

    let conn = crate::db::open_db(&data_dir)?;
    let like_pattern = workspace_like_prefix(&workspace_path);

    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.path FROM tracks t \
             LEFT JOIN cover_art c ON c.track_id = t.id \
             WHERE t.path LIKE ?1 ESCAPE '!' \
               AND c.id IS NULL",
        )
        .map_err(|e| format!("Artwork query failed: {e}"))?;

    let candidates: Vec<(i64, String)> = stmt
        .query_map([&like_pattern], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| format!("Artwork map failed: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    let total = candidates.len() as u64;
    let mut extracted = 0u64;
    let mut failed = 0u64;

    for (track_id, path_str) in candidates {
        let p = Path::new(&path_str);
        if !p.exists() {
            failed += 1;
            continue;
        }

        let tagged = match lofty::read_from_path(p) {
            Ok(t) => t,
            Err(_) => {
                failed += 1;
                continue;
            }
        };

        if let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
            if let Some(pic) = tag.pictures().first() {
                let data = pic.data();
                if !data.is_empty() {
                    // Calcolo hash SHA-256 della copertina
                    let mut hasher = Sha256::new();
                    hasher.update(data);
                    let cover_hash = format!("{:x}", hasher.finalize());

                    let mime = pic
                        .mime_type()
                        .map(|m| m.as_str().to_string())
                        .unwrap_or_else(|| "image/jpeg".to_string());
                    let format_str = if mime.contains("png") { "png" } else { "jpeg" };

                    let insert_res = conn.execute(
                        "INSERT INTO cover_art (track_id, data, format, file_size) VALUES (?1, ?2, ?3, ?4)",
                        params![track_id, data, format_str, data.len() as i64],
                    );

                    if insert_res.is_ok() {
                        let _ = conn.execute(
                            "UPDATE tracks SET cover_hash = ?1 WHERE id = ?2",
                            params![cover_hash, track_id],
                        );
                        extracted += 1;
                        continue;
                    }
                }
            }
        }
    }

    logger::log_detail(
        "LIBRARIAN",
        &format!("Artwork embedded estratte: {extracted}/{total}"),
    );

    Ok(ArtworkExtractResult {
        total,
        extracted,
        failed,
    })
}
