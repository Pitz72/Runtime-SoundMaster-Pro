/// fpcalc.rs — Rilevamento fpcalc (Chromaprint)
/// Runtime SoundMaster Pro — v0.1.0
///
/// fpcalc è il tool CLI di Chromaprint per generare acoustic fingerprint.
/// Utilizzato da The Cleaner per il rilevamento duplicati sonori.
///
/// Strategia analoga a ffmpeg.rs:
/// 1. Bundled (src-tauri/binaries/)
/// 2. PATH di sistema
/// 3. Percorsi comuni per OS

use std::path::PathBuf;
use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct FpcalcInfo {
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub source: Option<String>,
}

/// Verifica che fpcalc al path indicato risponda correttamente.
fn probe_fpcalc(path: &PathBuf) -> Option<String> {
    let output = Command::new(path)
        .arg("-version")
        .output()
        .ok()?;

    if output.status.success() {
        let version_line = String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .unwrap_or("unknown")
            .trim()
            .to_string();
        Some(version_line)
    } else {
        None
    }
}

/// Cerca fpcalc nell'ordine di priorità.
pub fn detect_fpcalc() -> FpcalcInfo {
    let exe_name = if cfg!(target_os = "windows") { "fpcalc.exe" } else { "fpcalc" };

    // --- 1. Bundled ---
    let bundled = PathBuf::from("binaries").join(exe_name);
    if bundled.exists() {
        if let Some(version) = probe_fpcalc(&bundled) {
            return FpcalcInfo {
                found: true,
                path: Some(bundled.to_string_lossy().to_string()),
                version: Some(version),
                source: Some("bundled".to_string()),
            };
        }
    }

    // --- 2. PATH di sistema ---
    let system_path = PathBuf::from(exe_name);
    if let Some(version) = probe_fpcalc(&system_path) {
        let full_path = if cfg!(target_os = "windows") {
            Command::new("where").arg("fpcalc").output()
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .map(|s| s.lines().next().unwrap_or("fpcalc").trim().to_string())
        } else {
            Command::new("which").arg("fpcalc").output()
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .map(|s| s.trim().to_string())
        };

        return FpcalcInfo {
            found: true,
            path: full_path,
            version: Some(version),
            source: Some("system_path".to_string()),
        };
    }

    // --- 3. Percorsi comuni Windows ---
    #[cfg(target_os = "windows")]
    {
        let paths = vec![
            PathBuf::from(r"C:\Program Files\Chromaprint\fpcalc.exe"),
            PathBuf::from(r"C:\chromaprint\fpcalc.exe"),
        ];
        for path in &paths {
            if path.exists() {
                if let Some(version) = probe_fpcalc(path) {
                    return FpcalcInfo {
                        found: true,
                        path: Some(path.to_string_lossy().to_string()),
                        version: Some(version),
                        source: Some("common_path".to_string()),
                    };
                }
            }
        }
    }

    // --- 4. Percorsi comuni macOS ---
    #[cfg(target_os = "macos")]
    {
        let paths = vec![
            PathBuf::from("/opt/homebrew/bin/fpcalc"),
            PathBuf::from("/usr/local/bin/fpcalc"),
        ];
        for path in &paths {
            if path.exists() {
                if let Some(version) = probe_fpcalc(path) {
                    return FpcalcInfo {
                        found: true,
                        path: Some(path.to_string_lossy().to_string()),
                        version: Some(version),
                        source: Some("common_path".to_string()),
                    };
                }
            }
        }
    }

    // --- 5. Percorsi comuni Linux ---
    #[cfg(target_os = "linux")]
    {
        let paths = vec![
            PathBuf::from("/usr/bin/fpcalc"),
            PathBuf::from("/usr/local/bin/fpcalc"),
        ];
        for path in &paths {
            if path.exists() {
                if let Some(version) = probe_fpcalc(path) {
                    return FpcalcInfo {
                        found: true,
                        path: Some(path.to_string_lossy().to_string()),
                        version: Some(version),
                        source: Some("common_path".to_string()),
                    };
                }
            }
        }
    }

    // Non trovato
    FpcalcInfo {
        found: false,
        path: None,
        version: None,
        source: None,
    }
}

/// Comando Tauri: rileva fpcalc e restituisce info al frontend.
#[tauri::command]
pub fn detect_fpcalc_cmd() -> FpcalcInfo {
    detect_fpcalc()
}
