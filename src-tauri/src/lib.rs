/// lib.rs — Entry point Tauri
/// Runtime SoundMaster Pro — v0.5.10

mod cleaner;
mod db;
mod duplicates;
mod ffmpeg;
mod ffprobe;
mod fpcalc;
mod logger;
mod scanner;
mod utils;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
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
            ffprobe::detect_ffprobe_cmd,
            fpcalc::detect_fpcalc_cmd,
            scanner::scan_workspace,
            cleaner::detect_non_conform,
            cleaner::quarantine_non_conform,
            duplicates::detect_duplicates,
            duplicates::resolve_duplicates,
            logger::get_log_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
