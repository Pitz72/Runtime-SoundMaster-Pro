/// ffmpeg.rs — Rilevamento e validazione FFmpeg
/// Runtime SoundMaster Pro — v0.5.12
///
/// Strategia di ricerca (in ordine di priorità):
/// 1. Sidecar bundled nella resource dir Tauri
///    → src-tauri/binaries/ffmpeg-<target-triple>[.exe]
///    → a runtime: <resource_dir>/ffmpeg-<target-triple>[.exe]
/// 2. PATH di sistema
/// 3. Percorsi comuni Windows (WinGet, Chocolatey, standard)
/// 4. Percorsi comuni macOS (Homebrew, MacPorts)
/// 5. Percorsi comuni Linux

use crate::utils::hidden_command;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

// Target triple iniettato da build.rs (es. "x86_64-pc-windows-msvc")
const TARGET: &str = env!("TARGET");

#[derive(Debug, Serialize, Deserialize)]
pub struct FfmpegInfo {
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub source: Option<String>, // "bundled" | "system_path" | "common_path"
}

/// Verifica che l'eseguibile FFmpeg al path indicato risponda correttamente.
fn probe_ffmpeg(path: &PathBuf) -> Option<String> {
    let output = hidden_command(path).arg("-version").output().ok()?;
    if output.status.success() {
        let line = String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .unwrap_or("unknown")
            .to_string();
        Some(line)
    } else {
        None
    }
}

/// Restituisce il path del sidecar bundled, cercando in due posizioni:
/// 1. `<resource_dir>/binaries/<name>` — dev mode (src-tauri/ come resource_dir)
/// 2. `<resource_dir>/<name>` — produzione (Tauri appiattisce la struttura)
fn bundled_path(resource_dir: &PathBuf) -> Option<PathBuf> {
    let name = if cfg!(target_os = "windows") {
        format!("ffmpeg-{}.exe", TARGET)
    } else {
        format!("ffmpeg-{}", TARGET)
    };
    let dev_path = resource_dir.join("binaries").join(&name);
    if dev_path.exists() {
        return Some(dev_path);
    }
    let prod_path = resource_dir.join(&name);
    if prod_path.exists() {
        return Some(prod_path);
    }
    None
}

/// Cerca FFmpeg nell'ordine di priorità documentato.
/// Richiede AppHandle per risolvere la resource dir Tauri.
pub fn detect_ffmpeg(app: &tauri::AppHandle) -> FfmpegInfo {
    // --- 1. Sidecar bundled (resource dir Tauri) ---
    if let Ok(resource_dir) = app.path().resource_dir() {
        if let Some(bundled) = bundled_path(&resource_dir) {
            if let Some(version) = probe_ffmpeg(&bundled) {
                return FfmpegInfo {
                    found: true,
                    path: Some(bundled.to_string_lossy().to_string()),
                    version: Some(version),
                    source: Some("bundled".to_string()),
                };
            }
        }
    }

    // --- 2. PATH di sistema ---
    let system_name = if cfg!(target_os = "windows") {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
    let system_path = PathBuf::from(system_name);
    if let Some(version) = probe_ffmpeg(&system_path) {
        let full_path = if cfg!(target_os = "windows") {
            hidden_command("where")
                .arg("ffmpeg")
                .output()
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .map(|s| s.lines().next().unwrap_or("ffmpeg").trim().to_string())
        } else {
            hidden_command("which")
                .arg("ffmpeg")
                .output()
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .map(|s| s.trim().to_string())
        };
        return FfmpegInfo {
            found: true,
            path: full_path,
            version: Some(version),
            source: Some("system_path".to_string()),
        };
    }

    // --- 3. Percorsi comuni Windows ---
    #[cfg(target_os = "windows")]
    {
        let common = vec![
            PathBuf::from(r"C:\Program Files\ffmpeg\bin\ffmpeg.exe"),
            PathBuf::from(r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe"),
            PathBuf::from(r"C:\ffmpeg\bin\ffmpeg.exe"),
            PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default())
                .join(r"Microsoft\WinGet\Links\ffmpeg.exe"),
        ];
        for path in &common {
            if path.exists() {
                if let Some(version) = probe_ffmpeg(path) {
                    return FfmpegInfo {
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
        let common = vec![
            PathBuf::from("/opt/homebrew/bin/ffmpeg"),
            PathBuf::from("/usr/local/bin/ffmpeg"),
            PathBuf::from("/opt/local/bin/ffmpeg"),
        ];
        for path in &common {
            if path.exists() {
                if let Some(version) = probe_ffmpeg(path) {
                    return FfmpegInfo {
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
        let common = vec![
            PathBuf::from("/usr/bin/ffmpeg"),
            PathBuf::from("/usr/local/bin/ffmpeg"),
            PathBuf::from("/snap/bin/ffmpeg"),
        ];
        for path in &common {
            if path.exists() {
                if let Some(version) = probe_ffmpeg(path) {
                    return FfmpegInfo {
                        found: true,
                        path: Some(path.to_string_lossy().to_string()),
                        version: Some(version),
                        source: Some("common_path".to_string()),
                    };
                }
            }
        }
    }

    FfmpegInfo {
        found: false,
        path: None,
        version: None,
        source: None,
    }
}

#[tauri::command]
pub fn detect_ffmpeg_cmd(app: tauri::AppHandle) -> FfmpegInfo {
    detect_ffmpeg(&app)
}
