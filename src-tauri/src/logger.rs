/// logger.rs — File logger per debug e testing
/// Runtime SoundMaster Pro — v0.5.9
///
/// Scrive su `runtime-soundmaster.log` nella app data dir.
/// Ogni sessione aggiunge una riga separatrice — il file non viene mai troncato,
/// accumula sessioni successive per confronto tra run.
///
/// Uso:
///   crate::logger::log("messaggio")
///   crate::logger::log_detail("sezione", "dettaglio")

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

// Path del file di log — inizializzato una sola volta in setup (lib.rs)
static LOG_PATH: OnceLock<Mutex<PathBuf>> = OnceLock::new();

/// Inizializza il logger. Chiamare in `tauri::Builder::setup`.
/// Crea il file se non esiste, aggiunge header di sessione.
pub fn init(app_data_dir: &PathBuf) {
    let path = app_data_dir.join("runtime-soundmaster.log");
    LOG_PATH.get_or_init(|| Mutex::new(path.clone()));
    write_line(
        &path,
        &format!(
            "\n╔══════════════════════════════════════════════════════╗\
             \n║  SESSION START  [{}]  Runtime SoundMaster Pro        \
             \n╚══════════════════════════════════════════════════════╝",
            timestamp()
        ),
    );
}

/// Scrive una riga di log con timestamp.
pub fn log(msg: &str) {
    if let Some(mutex) = LOG_PATH.get() {
        if let Ok(path) = mutex.lock() {
            write_line(&path, &format!("[{}] {}", timestamp(), msg));
        }
    }
}

/// Scrive una riga di log con sezione e dettaglio.
/// Es: log_detail("CLEANER", "Non-conform: song.mp3 → youtube_pattern (?i)(official video)")
pub fn log_detail(section: &str, detail: &str) {
    if let Some(mutex) = LOG_PATH.get() {
        if let Ok(path) = mutex.lock() {
            write_line(
                &path,
                &format!("[{}] [{:<12}] {}", timestamp(), section, detail),
            );
        }
    }
}

/// Scrive una riga separatrice (per separare fasi diverse)
pub fn log_separator(label: &str) {
    if let Some(mutex) = LOG_PATH.get() {
        if let Ok(path) = mutex.lock() {
            write_line(
                &path,
                &format!("[{}] ── {} ──────────────────────────────────", timestamp(), label),
            );
        }
    }
}

fn write_line(path: &PathBuf, line: &str) {
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{}", line);
    }
}

/// Timestamp UTC nel formato HH:MM:SS (senza dipendenze esterne)
fn timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let h = (secs % 86400) / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    format!("{:02}:{:02}:{:02}", h, m, s)
}

/// Comando Tauri: restituisce il path assoluto del file di log.
/// Il frontend lo mostra all'utente in SettingsModule o nel log panel.
#[tauri::command]
pub fn get_log_path(app: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;
    Ok(data_dir
        .join("runtime-soundmaster.log")
        .to_string_lossy()
        .to_string())
}
