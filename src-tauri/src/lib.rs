// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod db;
mod ffmpeg;
mod fpcalc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            db::db_status,
            ffmpeg::detect_ffmpeg_cmd,
            fpcalc::detect_fpcalc_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
