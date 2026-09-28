# Runtime SoundMaster Pro — Project Memory & Guidelines

> **STATO DEL PROGETTO**: Versione `v0.5.18` (Production-Ready: The Cleaner, The Conformer & The Librarian).  
> **REPO GITHUB**: Pubblica su `https://github.com/Pitz72/Runtime-SoundMaster-Pro.git`  
> **ARCHITETTURA**: Tauri v2 + Rust (Backend nativo ad alte prestazioni) + React 19 (Frontend Broadcast Rack Console) + Tailwind v4.

---

## ⚠️ MEMORIA CRITICA PER LE PROSSIME SESSIONI (OBBLIGATORIO)

1. **TEST DI PROVA SUL CAMPO**:
   - **Nelle prossime sessioni l'utente invierà i risultati e i log dei test di prova sul campo (field tests)** eseguiti su librerie audio reali di web radio (file MP3/FLAC/WAV/AAC eterogenei, database complessi, volumi disallineati, doppioni acustici, tag corrotti).
   - **Non iniziare nuovi refactor o stravolgimenti architetturali prima di aver ricevuto, analizzato e verificato tali test sul campo.**
   - Priorità assoluta: stabilità professionale, robustezza offline, feedback diagnostico dai test utente.

2. **LINGUA E COMUNICAZIONE**:
   - Rispondere **SEMPRE in lingua italiana**.

3. **GESTIONE SERVER DI SVILUPPO**:
   - **NON avviare MAI il development server** (`npm run dev`, `cargo tauri dev`, ecc.). L'utente gestisce l'avvio e il testing manualmente.

4. **OFFLINE AIR-GAPPED & PRIVACY**:
   - Software rigorosamente **100% offline** (zero chiamate AI esterne, zero cloud APIs, CSP restrittiva, font WOFF2 locali).
   - Tutti gli stadi (sanitizzazione, normalizzazione, deduplicazione e tagging) operano in locale via Rust, SQLite bundled e binari esterni dedicati (`ffmpeg`, `ffprobe`, `fpcalc`).

---

## 🛠️ Stack Tecnologico e Architettura

### Frontend (`src/`)
- **React 19 + TypeScript + Vite + Tailwind CSS v4**
- **Paradigma UI**: *Broadcast Rack Console* (hardware broadcast modulare da studio, dark theme `#0c0d10`, LED di stato, orologio broadcast live UTC, terminale di telemetria laterale docked).
- Viewport fissa a `100vh`, navigazione a rack tramite 4 stadi:
  - **STAGE 01 — HUB**: Ingestion Cockpit (`src/components/modules/HubModule.tsx`).
  - **STAGE 02 — CLEANER**: Sanitization Bay (`src/components/modules/CleanerModule.tsx`).
  - **STAGE 03 — CONFORMER**: EBU R128 Audio Rack (`src/components/modules/ConformerModule.tsx`).
  - **STAGE 04 — LIBRARIAN**: Broadcast Tag Studio (`src/components/modules/LibrarianModule.tsx`).
  - **HARDWARE DIAGNOSTICS**: Configurazione e test binari di sistema (`src/components/modules/SettingsModule.tsx`).
- Gestione stato: Zustand (`src/store/useAppStore.ts`).

### Backend Nativo Tauri (`src-tauri/`)
- **Tauri v2** + Rust
- **Database**: SQLite embedded con `rusqlite` (feature `bundled` attiva), transazioni a blocchi (chunk da 200 record) e indici dedicati.
- **Deduplicazione Acustica**: Dual-stage Fingerprinting (Chromaprint / fpcalc nativo con tolleranza jingle radiofonici e durata).
- **Normalizzazione Audio**: EBU R128 dual-pass basato su FFmpeg nativo con target integrato EBU (-23 LUFS), Radio Web (-14 LUFS) o Custom (-9 a -24 LUFS).
- **Metadata Engine**: Lofty v0.24 (Rust puro) per lettura/scrittura rapida tag ID3v2, Vorbis, MP4, FLAC.
- **Cancellation Token Manager**: Thread-safe con `AtomicBool` per l'interruzione immediata e sicura di qualsiasi operazione batch.

---

## 🚀 CI/CD & Build Windows

- **Workflow GitHub Actions**: [`.github/workflows/build-windows.yml`](file:///.github/workflows/build-windows.yml)
- **Target**: Windows x64 (`x86_64-pc-windows-msvc`).
- **Output generati**:
  - Installer setup NSIS (`Runtime SoundMaster Pro_0.5.18_x64-setup.exe`).
  - Installer MSI (`.msi`).
  - Eseguibile standalone portatile (`Runtime-SoundMaster-Pro-standalone.exe`).
- **Attivazione**: Su push su branch `main`, su tag di release `v*`, oppure manualmente via `workflow_dispatch`.
