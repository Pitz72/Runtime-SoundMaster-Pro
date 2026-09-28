/// cancellation.rs — Gestione Token di Interruzione (Abort/Cancellation) per Task di Background
/// Runtime SoundMaster Pro — v0.5.18
///
/// Responsabilità:
/// - Coordinamento dello stato atomico di cancellazione per task lunghi (Scanner, Cleaner, Duplicates, Conformer)
/// - Esposizione comandi Tauri per richiedere l'interruzione immediata dalla UI
/// - Prevenzione di task orfani o blocchi prolungati su filesystem/drive esterni

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

static CANCEL_TOKENS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn get_map() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    CANCEL_TOKENS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Richiede l'interruzione immediata per il task specificato.
pub fn request_abort(task_name: &str) {
    let mut map = get_map().lock().unwrap();
    let token = map
        .entry(task_name.to_lowercase())
        .or_insert_with(|| Arc::new(AtomicBool::new(false)));
    token.store(true, Ordering::SeqCst);
    crate::logger::log_detail("ABORT", &format!("Interruzione richiesta per task '{}'", task_name));
}

/// Reimposta lo stato del task per consentirne una nuova esecuzione.
pub fn reset_abort(task_name: &str) {
    let mut map = get_map().lock().unwrap();
    let token = map
        .entry(task_name.to_lowercase())
        .or_insert_with(|| Arc::new(AtomicBool::new(false)));
    token.store(false, Ordering::SeqCst);
}

/// Verifica se il task ha ricevuto una richiesta di interruzione.
pub fn is_aborted(task_name: &str) -> bool {
    let mut map = get_map().lock().unwrap();
    let token = map
        .entry(task_name.to_lowercase())
        .or_insert_with(|| Arc::new(AtomicBool::new(false)));
    token.load(Ordering::SeqCst)
}

/// Comando Tauri: invoca l'abort per un task dalla UI.
#[tauri::command]
pub fn abort_task(task_name: String) -> bool {
    request_abort(&task_name);
    true
}

/// Comando Tauri: verifica se un task è stato interrotto.
#[tauri::command]
pub fn is_task_aborted(task_name: String) -> bool {
    is_aborted(&task_name)
}
