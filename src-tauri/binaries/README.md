# Cartella Binari Bundled — Runtime SoundMaster Pro
#
# Questa cartella conterrà i binari FFmpeg e fpcalc (Chromaprint)
# per l'inclusione nel bundle finale dell'applicazione (Fase 5).
#
# I binari devono essere nominati con il suffisso della piattaforma target
# come richiesto da Tauri 2.x externalBin:
#
# Windows:
#   ffmpeg-x86_64-pc-windows-msvc.exe
#   fpcalc-x86_64-pc-windows-msvc.exe
#
# macOS Apple Silicon:
#   ffmpeg-aarch64-apple-darwin
#   fpcalc-aarch64-apple-darwin
#
# macOS Intel:
#   ffmpeg-x86_64-apple-darwin
#   fpcalc-x86_64-apple-darwin
#
# Linux x64:
#   ffmpeg-x86_64-unknown-linux-gnu
#   fpcalc-x86_64-unknown-linux-gnu
#
# Fonti ufficiali:
#   FFmpeg:    https://ffmpeg.org/download.html
#   fpcalc:    https://acoustid.org/chromaprint
#
# NOTA: I binari NON sono committati su Git (vedi .gitignore).
# Verranno aggiunti nella Fase 5 (Polish & Build) del progetto.
