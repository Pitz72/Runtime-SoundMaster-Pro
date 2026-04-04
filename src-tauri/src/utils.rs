/// utils.rs — Utilità condivise tra moduli
/// Runtime SoundMaster Pro — v0.5.9
///
/// Responsabilità:
/// - `collision_safe_path`: naming collision-safe per quarantena file
///   (usata sia da cleaner.rs che da duplicates.rs — fix L3 v0.5.6)

use std::path::Path;

/// Restituisce un path di destinazione che non causa collisioni di nome.
/// Se `<dir>/<filename>` esiste già, aggiunge suffisso `_1`, `_2`, ecc.
///
/// # Esempi
/// - `song.mp3` → `song.mp3` (se non esiste)
/// - `song.mp3` → `song_1.mp3` (se `song.mp3` esiste già)
/// - `song.mp3` → `song_2.mp3` (se anche `song_1.mp3` esiste)
pub fn collision_safe_path(dir: &Path, filename: &str) -> std::path::PathBuf {
    let candidate = dir.join(filename);
    if !candidate.exists() {
        return candidate;
    }

    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename);
    let ext = Path::new(filename)
        .extension()
        .and_then(|s| s.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default();

    let mut counter = 1u32;
    loop {
        let candidate = dir.join(format!("{stem}_{counter}{ext}"));
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}
