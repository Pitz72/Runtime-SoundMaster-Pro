/// logger.rs — File logger per debug e testing
/// Runtime SoundMaster Pro — v0.5.16
///
/// Scrive su `runtime-soundmaster.log` nella app data dir.
/// Ogni sessione aggiunge una riga separatrice. Rotazione a 5 MB
/// (fix v0.5.16 — criticità 22): il file corrente viene rinominato in
/// `.log.old` (sovrascrivendo la rotazione precedente) — al massimo
/// ~10 MB di log su disco invece di crescita illimitata.
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

/// Dimensione oltre la quale il log viene ruotato all'avvio della sessione.
const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024; // 5 MB

/// Inizializza il logger. Chiamare in `tauri::Builder::setup`.
/// Crea il file se non esiste, aggiunge header di sessione.
/// Se il file supera MAX_LOG_BYTES viene ruotato in `.log.old`.
pub fn init(app_data_dir: &PathBuf) {
    let path = app_data_dir.join("runtime-soundmaster.log");

    // Rotazione (fix v0.5.16): eseguita solo all'avvio — durante la sessione
    // il file cresce liberamente, così una singola run resta sempre integra.
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > MAX_LOG_BYTES {
            let old = app_data_dir.join("runtime-soundmaster.log.old");
            let _ = std::fs::remove_file(&old);
            let _ = std::fs::rename(&path, &old);
        }
    }

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

/// Timestamp UTC nel formato `YYYY-MM-DD HH:MM:SSZ` (senza dipendenze esterne).
/// Fix v0.5.16 (criticità 23): il vecchio formato HH:MM:SS non aveva la data —
/// impossibile distinguere sessioni di giorni diversi in un log che le accumula.
/// La conversione giorni→data civile usa l'algoritmo di Howard Hinnant.
fn timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let days = (secs / 86400) as i64;
    let (y, mo, d) = civil_from_days(days);
    let h = (secs % 86400) / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}Z", y, mo, d, h, m, s)
}

/// Converte giorni dall'epoca Unix (1970-01-01) in data civile (anno, mese, giorno).
/// Algoritmo di Howard Hinnant — esatto per tutto il range di interesse.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    (if m <= 2 { y + 1 } else { y }, m, d)
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
