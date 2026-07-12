/// ffprobe.rs — Rilevamento ffprobe (parte di FFmpeg)
/// Runtime SoundMaster Pro — v0.5.12
///
/// Strategia di ricerca (in ordine di priorità):
/// 1. Sidecar bundled nella resource dir Tauri
///    → src-tauri/binaries/ffprobe-<target-triple>[.exe]
/// 2. PATH di sistema
/// 3. Percorsi comuni per OS

use crate::utils::hidden_command;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

const TARGET: &str = env!("TARGET");

#[derive(Debug, Serialize, Deserialize)]
pub struct FfprobeInfo {
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub source: Option<String>,
}

fn probe_ffprobe(path: &PathBuf) -> Option<String> {
    let output = hidden_command(path)
        .args(["-version"])
        .output()
        .ok()?;
    if output.status.success() {
        let line = String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .unwrap_or("unknown")
            .trim()
            .to_string();
        Some(line)
    } else {
        None
    }
}

fn bundled_path(resource_dir: &PathBuf) -> Option<PathBuf> {
    let name = if cfg!(target_os = "windows") {
        format!("ffprobe-{}.exe", TARGET)
    } else {
        format!("ffprobe-{}", TARGET)
    };

    // 1. Dev mode: <resource_dir>/binaries/<name>
    let dev_path = resource_dir.join("binaries").join(&name);
    if dev_path.exists() {
        return Some(dev_path);
    }

    // 2. Produzione: <resource_dir>/<name>
    let prod_path = resource_dir.join(&name);
    if prod_path.exists() {
        return Some(prod_path);
    }

    None
}

pub fn detect_ffprobe(app: &tauri::AppHandle) -> FfprobeInfo {
    let exe_name = if cfg!(target_os = "windows") { "ffprobe.exe" } else { "ffprobe" };

    // --- 1. Sidecar bundled ---
    if let Ok(resource_dir) = app.path().resource_dir() {
        if let Some(bundled) = bundled_path(&resource_dir) {
            if let Some(version) = probe_ffprobe(&bundled) {
                return FfprobeInfo {
                    found: true,
                    path: Some(bundled.to_string_lossy().to_string()),
                    version: Some(version),
                    source: Some("bundled".to_string()),
                };
            }
        }
    }

    // --- 2. PATH di sistema ---
    let system_path = PathBuf::from(exe_name);
    if let Some(version) = probe_ffprobe(&system_path) {
        let full_path = if cfg!(target_os = "windows") {
            hidden_command("where")
                .arg("ffprobe")
                .output()
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .map(|s| s.lines().next().unwrap_or("ffprobe").trim().to_string())
        } else {
            hidden_command("which")
                .arg("ffprobe")
                .output()
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .map(|s| s.trim().to_string())
        };
        return FfprobeInfo {
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
            PathBuf::from(r"C:\Program Files\ffmpeg\bin\ffprobe.exe"),
            PathBuf::from(r"C:\ffmpeg\bin\ffprobe.exe"),
        ];
        for path in &common {
            if path.exists() {
                if let Some(version) = probe_ffprobe(path) {
                    return FfprobeInfo {
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
            PathBuf::from("/opt/homebrew/bin/ffprobe"),
            PathBuf::from("/usr/local/bin/ffprobe"),
        ];
        for path in &common {
            if path.exists() {
                if let Some(version) = probe_ffprobe(path) {
                    return FfprobeInfo {
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
            PathBuf::from("/usr/bin/ffprobe"),
            PathBuf::from("/usr/local/bin/ffprobe"),
        ];
        for path in &common {
            if path.exists() {
                if let Some(version) = probe_ffprobe(path) {
                    return FfprobeInfo {
                        found: true,
                        path: Some(path.to_string_lossy().to_string()),
                        version: Some(version),
                        source: Some("common_path".to_string()),
                    };
                }
            }
        }
    }

    FfprobeInfo {
        found: false,
        path: None,
        version: None,
        source: None,
    }
}

#[tauri::command]
pub fn detect_ffprobe_cmd(app: tauri::AppHandle) -> FfprobeInfo {
    detect_ffprobe(&app)
}
