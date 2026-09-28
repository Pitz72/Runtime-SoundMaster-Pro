/// lib.rs — Entry point Tauri
/// Runtime SoundMaster Pro — v0.5.11

mod cancellation;
mod cleaner;
mod conformer;
mod db;
mod duplicates;
mod ffmpeg;
mod ffprobe;
mod fpcalc;
mod librarian;
mod logger;
mod scanner;
mod utils;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Plugin shell rimosso in v0.5.16 (criticità 26): mai usato dal frontend
    // e con permessi allow-execute/allow-spawn inutilmente ampi. I processi
    // esterni (ffprobe/fpcalc) sono lanciati direttamente dal backend Rust.
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // Inizializzazione DB al primo avvio — garantisce che lo schema
        // esista prima che qualsiasi comando venga invocato dal frontend.
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            db::init_database(&data_dir)?;
            logger::init(&data_dir);
            logger::log("App started — DB initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::db_status,
            db::get_library_stats,
            ffmpeg::detect_ffmpeg_cmd,
            ffmpeg::test_custom_ffmpeg,
            ffprobe::detect_ffprobe_cmd,
            ffprobe::test_custom_ffprobe,
            fpcalc::detect_fpcalc_cmd,
            fpcalc::test_custom_fpcalc,
            cancellation::abort_task,
            cancellation::is_task_aborted,
            scanner::scan_workspace,
            cleaner::detect_non_conform,
            cleaner::quarantine_non_conform,
            duplicates::detect_duplicates,
            duplicates::resolve_duplicates,
            conformer::get_conformer_queue,
            conformer::conform_batch,
            librarian::get_librarian_tracks,
            librarian::save_track_metadata,
            librarian::bulk_update_metadata,
            librarian::scrub_track_tags,
            librarian::extract_embedded_artwork,
            logger::get_log_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
