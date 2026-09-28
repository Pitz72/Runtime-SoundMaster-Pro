/// conformer.rs — The Conformer: Mass Audio Standardization & Normalization Engine
/// Runtime SoundMaster Pro — v0.5.18
///
/// Responsabilità:
/// - Standardizzazione e transcodifica batch con FFmpeg
/// - Normalizzazione Loudness EBU R128 (-23 LUFS)
/// - Silent trimming (rimozione silenzi iniziali/finali)
/// - Supporto Preset Broadcast: PODCAST, RADIO_STD, RADIO_HQ, MASTER, LOSSLESS_NORM
/// - Collision-safe naming nella cartella di destinazione (default: `<workspace>/_Conformed/`)
/// - Progress streaming in tempo reale verso il frontend ("conformer-progress")
/// - Aggiornamento stato nel database SQLite (`conforming_status = 'ok'`)

use crate::logger;
use crate::utils::{canonical_or_raw, collision_safe_path, hidden_command, workspace_like_prefix};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};

/// Elemento nella coda di conformazione.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConformerQueueItem {
    pub id: i64,
    pub path: String,
    pub filename: String,
    pub format: Option<String>,
    pub bitrate: Option<i64>,
    pub sample_rate: Option<i64>,
    pub duration_secs: Option<f64>,
    pub conforming_status: String,
}

/// Opzioni passate dal frontend per la transcodifica batch.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConformerOptions {
    pub preset_id: String,
    pub standardize: bool,
    pub ebu_r128: bool,
    pub silent_trim: bool,
    pub output_dir: Option<String>,
}

/// Evento emesso durante l'avanzamento della transcodifica.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConformerProgress {
    pub current_index: u64,
    pub total: u64,
    pub current_file: String,
    pub phase: String, // "processing" | "complete" | "error"
    pub percentage: f64,
}

/// Risultato di un singolo file transcodificato.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformerFileResult {
    pub id: i64,
    pub filename: String,
    pub output_path: Option<String>,
    pub success: bool,
    pub error: Option<String>,
}

/// Risultato complessivo restituito alla fine del batch.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConformerBatchResult {
    pub total: u64,
    pub succeeded: u64,
    pub failed: u64,
    pub output_dir: String,
    pub results: Vec<ConformerFileResult>,
}

/// Dati tecnici del preset di conversione.
struct PresetConfig {
    codec: &'static str,
    bitrate_arg: Option<String>,
    sample_rate: u32,
    ext: &'static str,
    target_lufs: f64,
}

fn resolve_preset(preset_id: &str) -> PresetConfig {
    match preset_id.to_uppercase().as_str() {
        "PODCAST" => PresetConfig {
            codec: "libmp3lame",
            bitrate_arg: Some("128k".to_string()),
            sample_rate: 44100,
            ext: "mp3",
            target_lufs: -16.0,
        },
        "RADIO_HQ" => PresetConfig {
            codec: "libmp3lame",
            bitrate_arg: Some("256k".to_string()),
            sample_rate: 44100,
            ext: "mp3",
            target_lufs: -23.0,
        },
        "MASTER" => PresetConfig {
            codec: "libmp3lame",
            bitrate_arg: Some("320k".to_string()),
            sample_rate: 48000,
            ext: "mp3",
            target_lufs: -23.0,
        },
        "LOSSLESS_NORM" => PresetConfig {
            codec: "flac",
            bitrate_arg: None,
            sample_rate: 44100,
            ext: "flac",
            target_lufs: -23.0,
        },
        // Default radio broadcast: RADIO_STD (192kbps CBR / 44.1kHz / Stereo / -23 LUFS)
        _ => PresetConfig {
            codec: "libmp3lame",
            bitrate_arg: Some("192k".to_string()),
            sample_rate: 44100,
            ext: "mp3",
            target_lufs: -23.0,
        },
    }
}

/// Restituisce la coda di file del workspace da mostrare in ConformerModule.
#[tauri::command]
pub fn get_conformer_queue(
    app: tauri::AppHandle,
    workspace_path: String,
) -> Result<Vec<ConformerQueueItem>, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;

    let conn = crate::db::open_db(&data_dir)?;
    let like_pattern = workspace_like_prefix(&workspace_path);

    let mut stmt = conn
        .prepare(
            "SELECT id, path, filename, format, bitrate, sample_rate, duration_secs, conforming_status \
             FROM tracks \
             WHERE path LIKE ?1 ESCAPE '!' \
             AND conforming_status NOT IN ('non_conform', 'duplicate') \
             ORDER BY id LIMIT 500",
        )
        .map_err(|e| format!("Conformer: query queue failed: {e}"))?;

    let rows = stmt
        .query_map([&like_pattern], |row| {
            Ok(ConformerQueueItem {
                id: row.get(0)?,
                path: row.get(1)?,
                filename: row.get(2)?,
                format: row.get(3)?,
                bitrate: row.get(4)?,
                sample_rate: row.get(5)?,
                duration_secs: row.get(6)?,
                conforming_status: row.get(7)?,
            })
        })
        .map_err(|e| format!("Conformer: query queue mapping failed: {e}"))?;

    let items: Vec<ConformerQueueItem> = rows.filter_map(|r| r.ok()).collect();
    Ok(items)
}

fn conform_batch_impl(
    app: tauri::AppHandle,
    workspace_path: String,
    track_ids: Option<Vec<i64>>,
    options: ConformerOptions,
    ffmpeg_bin: String,
) -> Result<ConformerBatchResult, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;

    let conn = crate::db::open_db(&data_dir)?;

    let output_dir = match options.output_dir {
        Some(ref p) => PathBuf::from(p),
        None => Path::new(&workspace_path).join("_Conformed"),
    };

    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Cannot create output dir: {e}"))?;

    // Guardia anti-collisione su workspace sorgente
    let ws_canon = canonical_or_raw(Path::new(&workspace_path));
    let out_canon = canonical_or_raw(&output_dir);
    if ws_canon == out_canon {
        return Err("Destinazione non valida: coincide con il workspace radice.".to_string());
    }

    let preset = resolve_preset(&options.preset_id);

    // Selezione tracce da elaborare
    let tracks: Vec<(i64, String, String)> = match track_ids {
        Some(ids) if !ids.is_empty() => {
            let mut list = Vec::new();
            for id in ids {
                let row: rusqlite::Result<(String, String)> = conn.query_row(
                    "SELECT path, filename FROM tracks WHERE id = ?1",
                    [id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                );
                if let Ok((p, f)) = row {
                    list.push((id, p, f));
                }
            }
            list
        }
        _ => {
            let like_pattern = workspace_like_prefix(&workspace_path);
            let mut stmt = conn
                .prepare(
                    "SELECT id, path, filename FROM tracks \
                     WHERE path LIKE ?1 ESCAPE '!' \
                     AND conforming_status NOT IN ('non_conform', 'duplicate') \
                     ORDER BY id",
                )
                .map_err(|e| format!("Conformer: query failed: {e}"))?;

            let rows = stmt
                .query_map([&like_pattern], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                .map_err(|e| format!("Conformer: query mapping failed: {e}"))?;

            rows.filter_map(|r| r.ok()).collect()
        }
    };

    crate::cancellation::reset_abort("conformer");

    let total = tracks.len() as u64;
    logger::log_separator("CONFORMER — BATCH START");
    logger::log_detail(
        "CONFORMER",
        &format!(
            "Inizio batch: {} tracce | Preset: {} | Output: {}",
            total,
            options.preset_id,
            output_dir.display()
        ),
    );

    let mut succeeded = 0u64;
    let mut failed = 0u64;
    let mut results: Vec<ConformerFileResult> = Vec::new();

    for (index, (id, src_path, filename)) in tracks.iter().enumerate() {
        if crate::cancellation::is_aborted("conformer") {
            logger::log_detail("CONFORMER", "Batch conformer interrotto dall'utente.");
            break;
        }

        let current_index = (index + 1) as u64;
        let pct = if total > 0 {
            (current_index as f64 / total as f64) * 100.0
        } else {
            100.0
        };

        let _ = app.emit(
            "conformer-progress",
            ConformerProgress {
                current_index,
                total,
                current_file: filename.clone(),
                phase: "processing".to_string(),
                percentage: pct,
            },
        );

        let src = Path::new(src_path);
        if !src.exists() {
            failed += 1;
            results.push(ConformerFileResult {
                id: *id,
                filename: filename.clone(),
                output_path: None,
                success: false,
                error: Some("File sorgente non trovato su disco".to_string()),
            });
            continue;
        }

        // Calcolo nome file destinazione con nuova estensione
        let stem = Path::new(filename)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(filename);
        let target_filename = format!("{stem}.{}", preset.ext);
        let dest = collision_safe_path(&output_dir, &target_filename);

        // Costruzione filtri audio FFmpeg
        let mut audio_filters = Vec::new();
        if options.ebu_r128 {
            audio_filters.push(format!("loudnorm=I={}:TP=-1:LRA=7", preset.target_lufs));
        }
        if options.silent_trim {
            audio_filters.push(
                "silenceremove=start_periods=1:start_duration=0.1:start_threshold=-50dB:stop_periods=1:stop_duration=0.1:stop_threshold=-50dB".to_string()
            );
        }

        let mut cmd = hidden_command(&ffmpeg_bin);
        cmd.arg("-i").arg(src_path);

        if !audio_filters.is_empty() {
            cmd.arg("-af").arg(audio_filters.join(","));
        }

        cmd.arg("-c:a").arg(preset.codec);
        if let Some(ref b) = preset.bitrate_arg {
            cmd.arg("-b:a").arg(b);
        }
        cmd.arg("-ar").arg(preset.sample_rate.to_string());
        cmd.arg("-ac").arg("2");
        cmd.arg("-y").arg(&dest);

        match cmd.output() {
            Ok(output) if output.status.success() => {
                succeeded += 1;
                let dest_str = dest.to_string_lossy().to_string();
                logger::log_detail(
                    "CONFORMER",
                    &format!("OK: {} → {}", filename, dest.display()),
                );

                // Aggiorna stato nel DB
                let _ = conn.execute(
                    "UPDATE tracks SET conforming_status = 'ok' WHERE id = ?1",
                    [id],
                );

                results.push(ConformerFileResult {
                    id: *id,
                    filename: filename.clone(),
                    output_path: Some(dest_str),
                    success: true,
                    error: None,
                });
            }
            Ok(output) => {
                failed += 1;
                let err_msg = String::from_utf8_lossy(&output.stderr);
                let first_err = err_msg
                    .lines()
                    .last()
                    .unwrap_or("FFmpeg transcoding error")
                    .to_string();
                logger::log_detail(
                    "CONFORMER",
                    &format!("ERRORE FFmpeg [{}]: {}", filename, first_err),
                );
                results.push(ConformerFileResult {
                    id: *id,
                    filename: filename.clone(),
                    output_path: None,
                    success: false,
                    error: Some(first_err),
                });
            }
            Err(e) => {
                failed += 1;
                let err_msg = format!("Impossibile avviare FFmpeg: {e}");
                logger::log_detail("CONFORMER", &format!("ERRORE [{}]: {}", filename, err_msg));
                results.push(ConformerFileResult {
                    id: *id,
                    filename: filename.clone(),
                    output_path: None,
                    success: false,
                    error: Some(err_msg),
                });
            }
        }
    }

    let was_aborted = crate::cancellation::is_aborted("conformer");
    let phase = if was_aborted { "aborted" } else { "complete" };
    let pct = if was_aborted && total > 0 {
        ((succeeded + failed) as f64 / total as f64) * 100.0
    } else {
        100.0
    };

    let _ = app.emit(
        "conformer-progress",
        ConformerProgress {
            current_index: succeeded + failed,
            total,
            current_file: String::new(),
            phase: phase.to_string(),
            percentage: pct,
        },
    );

    let output_str = output_dir.to_string_lossy().to_string();
    logger::log_detail(
        "CONFORMER",
        &format!(
            "Batch completato: {} riusciti, {} falliti → {}",
            succeeded, failed, output_str
        ),
    );

    Ok(ConformerBatchResult {
        total,
        succeeded,
        failed,
        output_dir: output_str,
        results,
    })
}

/// Comando Tauri: avvia la conversione batch in un thread di background.
#[tauri::command]
pub async fn conform_batch(
    app: tauri::AppHandle,
    workspace_path: String,
    track_ids: Option<Vec<i64>>,
    options: ConformerOptions,
    ffmpeg_path: Option<String>,
) -> Result<ConformerBatchResult, String> {
    let ffmpeg_bin = match ffmpeg_path {
        Some(p) if !p.is_empty() => p,
        _ => {
            let info = crate::ffmpeg::detect_ffmpeg(&app);
            if !info.found || info.path.is_none() {
                return Err("FFmpeg non rilevato. Impossibile procedere con la transcodifica.".to_string());
            }
            info.path.unwrap()
        }
    };

    tokio::task::spawn_blocking(move || {
        conform_batch_impl(app, workspace_path, track_ids, options, ffmpeg_bin)
    })
    .await
    .map_err(|e| format!("Conformer task join error: {e}"))?
}
