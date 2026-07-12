/// utils.rs — Utilità condivise tra moduli
/// Runtime SoundMaster Pro — v0.5.12
///
/// Responsabilità:
/// - `collision_safe_path`: naming collision-safe per quarantena file
///   (usata sia da cleaner.rs che da duplicates.rs — fix L3 v0.5.6)
/// - `workspace_like_prefix`: pattern LIKE sicuro per filtrare i track di un
///   workspace (fix v0.5.11 — DB multi-workspace)
/// - `canonical_or_raw`: canonicalizzazione tollerante per confronti di path
/// - `hidden_command`: Command senza finestra console su Windows
///   (fix v0.5.12 — flash di finestre in build release)

use std::path::{Path, PathBuf};

/// Costruisce il pattern per `path LIKE ?1 ESCAPE '!'` che matcha solo i file
/// DENTRO il workspace.
///
/// # Fix v0.5.11 (criticità 7)
/// La versione precedente usava `format!("{}%", workspace_path)` che aveva
/// due difetti:
/// 1. `_` e `%` nel path venivano interpretati come wildcard SQL: il workspace
///    `K:\Radio_Hits` matchava anche `K:\RadioXHits`.
/// 2. Il prefisso senza separatore finale matchava cartelle sorelle:
///    `C:\Music\Genesis` matchava anche `C:\Music\Genesis2\...`.
///
/// Qui i metacaratteri LIKE (`%`, `_`) e il carattere di escape (`!`) vengono
/// escapati, e al prefisso viene aggiunto il separatore nativo del path, così
/// il pattern matcha esclusivamente i discendenti del workspace.
pub fn workspace_like_prefix(workspace_path: &str) -> String {
    // Separatore rilevato dal path originale (Windows `\`, Unix `/`)
    let sep = if workspace_path.contains('\\') { '\\' } else { '/' };
    let trimmed = workspace_path.trim_end_matches(['\\', '/']);
    let escaped = trimmed
        .replace('!', "!!")
        .replace('%', "!%")
        .replace('_', "!_");
    format!("{escaped}{sep}%")
}

/// Canonicalizza un path se possibile (risolve case, separatori, prefissi
/// `\\?\`, symlink); se la canonicalizzazione fallisce (path inesistente)
/// restituisce il path originale. Usata per confronti di uguaglianza tra
/// directory dove il confronto testuale non basta (Windows è case-insensitive).
pub fn canonical_or_raw(p: &Path) -> PathBuf {
    std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf())
}

/// Crea un `Command` che su Windows NON apre una finestra console.
///
/// # Fix v0.5.12 (criticità 5 — audit 12/07/2026)
/// L'app è compilata con `windows_subsystem = "windows"` (main.rs): il processo
/// principale non ha una console. In questa condizione ogni processo figlio
/// console (ffprobe, fpcalc, where) apre una propria finestra visibile per la
/// durata dell'esecuzione. Con ffprobe/fpcalc lanciati una volta PER FILE,
/// su una libreria da 36.000 track significa 36.000 flash di finestre in
/// build release. `CREATE_NO_WINDOW` (0x08000000) sopprime la console del
/// figlio. In dev (`tauri dev` da terminale) il problema non si vede perché
/// la console viene ereditata — per questo non era mai emerso nei test.
pub fn hidden_command<S: AsRef<std::ffi::OsStr>>(program: S) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn like_prefix_appends_separator() {
        assert_eq!(workspace_like_prefix(r"C:\Music\Genesis"), r"C:\Music\Genesis\%");
        assert_eq!(workspace_like_prefix("/home/user/music"), "/home/user/music/%");
    }

    #[test]
    fn like_prefix_trims_trailing_separators() {
        assert_eq!(workspace_like_prefix(r"C:\Music\Genesis\"), r"C:\Music\Genesis\%");
        assert_eq!(workspace_like_prefix(r"K:\"), r"K:\%");
    }

    #[test]
    fn like_prefix_escapes_wildcards() {
        assert_eq!(workspace_like_prefix(r"K:\Radio_Hits"), r"K:\Radio!_Hits\%");
        assert_eq!(workspace_like_prefix(r"K:\100%Rock"), r"K:\100!%Rock\%");
        assert_eq!(workspace_like_prefix(r"K:\Wow!"), r"K:\Wow!!\%");
    }

    /// Verifica il comportamento end-to-end contro SQLite reale:
    /// il pattern deve matchare solo i discendenti del workspace,
    /// non cartelle sorelle con lo stesso prefisso né path con
    /// wildcard interpretate.
    #[test]
    fn like_prefix_matches_only_descendants_in_sqlite() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE t (path TEXT)").unwrap();
        let paths = [
            r"C:\Music\Genesis\Abacab.flac",         // dentro → match
            r"C:\Music\Genesis\CD1\Mama.flac",       // sottocartella → match
            r"C:\Music\Genesis2\Other.mp3",          // cartella sorella → NO
            r"C:\Music\Genesis",                     // il workspace stesso → NO
            r"C:\Music\GenesisX\Track.mp3",          // prefisso condiviso → NO
        ];
        for p in &paths {
            conn.execute("INSERT INTO t (path) VALUES (?1)", [p]).unwrap();
        }
        let pattern = workspace_like_prefix(r"C:\Music\Genesis");
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM t WHERE path LIKE ?1 ESCAPE '!'",
                [&pattern],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn like_prefix_underscore_not_wildcard_in_sqlite() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE t (path TEXT)").unwrap();
        conn.execute("INSERT INTO t (path) VALUES (?1)", [r"K:\Radio_Hits\a.mp3"]).unwrap();
        conn.execute("INSERT INTO t (path) VALUES (?1)", [r"K:\RadioXHits\b.mp3"]).unwrap();
        let pattern = workspace_like_prefix(r"K:\Radio_Hits");
        let matched: Vec<String> = conn
            .prepare("SELECT path FROM t WHERE path LIKE ?1 ESCAPE '!'")
            .unwrap()
            .query_map([&pattern], |r| r.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert_eq!(matched, vec![r"K:\Radio_Hits\a.mp3".to_string()]);
    }
}

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
