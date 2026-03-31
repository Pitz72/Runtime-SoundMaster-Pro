/// ffmpeg.rs — Rilevamento e validazione FFmpeg
/// Runtime SoundMaster Pro — v0.1.0
///
/// Strategia di ricerca (in ordine di priorità):
/// 1. Binario bundled in src-tauri/binaries/ (rilascio produzione)
/// 2. PATH di sistema (utenti con FFmpeg già installato)
/// 3. Percorsi comuni Windows (WinGet, Chocolatey, percorsi standard)
/// 4. Percorsi comuni macOS (Homebrew, MacPorts)
/// 5. Percorsi comuni Linux (/usr/bin, /usr/local/bin)

use std::path::PathBuf;
use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct FfmpegInfo {
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub source: Option<String>, // "bundled" | "system_path" | "common_path"
}

/// Verifica che un eseguibile FFmpeg al path indicato risponda correttamente.
/// Chiama `ffmpeg -version` e controlla l'exit code.
fn probe_ffmpeg(path: &PathBuf) -> Option<String> {
    let output = Command::new(path)
        .arg("-version")
        .output()
        .ok()?;

    if output.status.success() {
        // Estrae la prima riga dell'output (es. "ffmpeg version 7.1 Copyright...")
        let version_line = String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .unwrap_or("unknown")
            .to_string();
        Some(version_line)
    } else {
        None
    }
}

/// Cerca FFmpeg nell'ordine di priorità documentato.
pub fn detect_ffmpeg() -> FfmpegInfo {
    // --- 1. Binario bundled (produzione) ---
    // In Tauri 2.x i binari external sono in src-tauri/binaries/
    // A runtime, Tauri li copia nella resource dir dell'app.
    // Per ora verifichiamo il path relativo durante lo sviluppo.
    let bundled_names = if cfg!(target_os = "windows") {
        vec!["ffmpeg.exe"]
    } else {
        vec!["ffmpeg"]
    };

    for name in &bundled_names {
        // Tauri resource dir (runtime) — usabile solo con AppHandle in produzione
        // In Fase 0 è sufficiente documentare la posizione attesa
        let bundled = PathBuf::from("binaries").join(name);
        if bundled.exists() {
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
    let system_name = if cfg!(target_os = "windows") { "ffmpeg.exe" } else { "ffmpeg" };
    let system_path = PathBuf::from(system_name);
    if let Some(version) = probe_ffmpeg(&system_path) {
        // Recupera il path completo tramite 'where' (Windows) o 'which' (Unix)
        let full_path = if cfg!(target_os = "windows") {
            Command::new("where").arg("ffmpeg").output()
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .map(|s| s.lines().next().unwrap_or("ffmpeg").trim().to_string())
        } else {
            Command::new("which").arg("ffmpeg").output()
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
        let common_windows_paths = vec![
            PathBuf::from(r"C:\Program Files\ffmpeg\bin\ffmpeg.exe"),
            PathBuf::from(r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe"),
            PathBuf::from(r"C:\ffmpeg\bin\ffmpeg.exe"),
            // WinGet install path
            PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default())
                .join(r"Microsoft\WinGet\Links\ffmpeg.exe"),
        ];

        for path in &common_windows_paths {
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
        let common_macos_paths = vec![
            PathBuf::from("/opt/homebrew/bin/ffmpeg"),      // Homebrew Apple Silicon
            PathBuf::from("/usr/local/bin/ffmpeg"),          // Homebrew Intel / MacPorts
            PathBuf::from("/opt/local/bin/ffmpeg"),          // MacPorts
        ];

        for path in &common_macos_paths {
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
        let common_linux_paths = vec![
            PathBuf::from("/usr/bin/ffmpeg"),
            PathBuf::from("/usr/local/bin/ffmpeg"),
            PathBuf::from("/snap/bin/ffmpeg"),
        ];

        for path in &common_linux_paths {
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

    // Non trovato
    FfmpegInfo {
        found: false,
        path: None,
        version: None,
        source: None,
    }
}

/// Comando Tauri: rileva FFmpeg e restituisce info al frontend.
/// Utilizzato dall'Hub UI per mostrare lo stato del motore audio.
#[tauri::command]
pub fn detect_ffmpeg_cmd() -> FfmpegInfo {
    detect_ffmpeg()
}
