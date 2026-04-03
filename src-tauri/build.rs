fn main() {
    // Espone TARGET come env var accessibile via env!("TARGET") nel codice Rust.
    // Necessario per costruire i path dei sidecar Tauri a compile time:
    //   src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe
    //   src-tauri/binaries/fpcalc-x86_64-pc-windows-msvc.exe
    println!(
        "cargo:rustc-env=TARGET={}",
        std::env::var("TARGET").unwrap()
    );
    tauri_build::build()
}
