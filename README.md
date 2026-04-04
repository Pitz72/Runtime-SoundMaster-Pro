# Runtime SoundMaster Pro

**Versione corrente: v0.5.8** — The Cleaner completato e operativo

Strumento desktop professionale per la sanificazione e gestione di librerie audio per operatori di radio web (Shoutcast, Icecast, RadioDJ, MB STUDIO, Azuracast, Liquidsoap).

Costruito con **Tauri v2 + Rust + React 19**, bundle ~10-15 MB contro i 100+ MB di Electron.

---

## Il problema che risolve

Le librerie audio delle web radio accumolano nel tempo:

- File scaricati da YouTube (video-rip mascherati da audio)
- Duplicati esatti o acusticamente identici con nomi diversi
- Volumi inconsistenti (differenze di 10+ dB tra brani consecutivi)
- Metadati mancanti, corrotti o inconsistenti
- Formati eterogenei incompatibili con i sistemi di automazione

---

## I tre moduli

### The Cleaner — Deduplicatore Intelligente

Rileva e isola non-distruttivamente i file problematici:

- **Non-Conform Detection**: 17 pattern regex YouTube, video stream nascosti, file corrotti (via FFprobe)
- **Duplicate Detection**: hash SHA-256 binario + fuzzy matching metadati + acoustic fingerprinting (fpcalc/Chromaprint)
- **Best-Pick**: sceglie automaticamente la versione migliore (lossless > bitrate > durata > dimensione)
- **Quarantena**: `_NonConform/` e `_Duplicates/` — nessun file viene mai eliminato

**Stato**: completamente funzionante e testato su librerie reali (36.000+ file)

### The Conformer — Standardizzatore Universale

Converte e normalizza in batch l'intera libreria verso un preset radio standard:

- Output: MP3 192kbps CBR / 44.1kHz / Stereo
- Loudness normalization EBU R128 (-23 LUFS) via FFmpeg
- Silent trimming configurabile
- Pipeline FFmpeg con worker concorrenti

**Stato**: UI completa, logica backend in sviluppo (v0.6.0+)

### The Librarian — Catalogo & Metadati

Gestione tag ID3, cover art e catalogo SQLite:

- Metadata scrubbing a tre livelli (Broadcast / DJ / Minimal)
- Cover art extraction, resize, embedding massivo
- Database SQLite WAL con FTS5 per librerie 500.000+ brani
- Ricerca full-text istantanea

**Stato**: UI con dati mock, logica backend in sviluppo (v0.7.0+)

---

## Stack tecnologico

| Layer | Tecnologia |
| --- | --- |
| Backend | Rust + Tauri v2 |
| Database | SQLite WAL via `rusqlite` (bundled) |
| Audio engine | FFmpeg 8.1 + FFprobe 8.1 (bundled) |
| Fingerprinting | fpcalc 1.6.0 / Chromaprint (bundled) |
| Frontend | React 19 + TypeScript |
| Styling | Tailwind CSS 4 — Design System "Industrial" |
| Animazioni | Framer Motion |
| State management | Zustand |

---

## Design system

**"Industrial"** — ambra `#FFB300` primario, ciano `#A4E7FF` info/ok, rosso `#FFB3AC` errore, su chassis carbone `#131313`. Zero border-radius. Font: Space Grotesk + Inter + JetBrains Mono.

Design system definito in `PROGETTO/PROTOTIPO-INTERFACCIA/`.

---

## Avvio in sviluppo

### Prerequisiti

I binari seguenti devono essere presenti in `src-tauri/binaries/` con il suffisso target triple (es. `-x86_64-pc-windows-msvc.exe`):

| Binario | Versione | Fonte |
| --- | --- | --- |
| `ffmpeg` | 8.1-essentials | [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) |
| `ffprobe` | 8.1-essentials | Incluso nel pacchetto FFmpeg |
| `fpcalc` | 1.6.0 | [acoustid.org/chromaprint](https://acoustid.org/chromaprint) |

Rinominare secondo la convenzione Tauri: `<nome>-<target-triple>[.exe]`

### Avvio

```bash
npm install
npm run tauri dev
```

---

## Struttura repository

```text
Runtime-SoundMaster-Pro/
├── src/                              # Frontend React 19 + TypeScript
│   ├── store/appStore.ts             # Zustand — stato globale
│   ├── App.tsx                       # Router + listeners eventi Tauri
│   └── components/
│       ├── layout/                   # MainLayout, TopBar, LogPanel
│       └── modules/                  # HubModule, CleanerModule, ConformerModule,
│                                     # LibrarianModule, SettingsModule
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs                    # Entry point + registrazione comandi Tauri
│   │   ├── db.rs                     # SQLite WAL + schema + stats
│   │   ├── scanner.rs                # Scansione workspace ricorsiva
│   │   ├── cleaner.rs                # Non-conform detection + quarantena
│   │   ├── duplicates.rs             # Duplicate detection + resolution
│   │   ├── ffmpeg.rs                 # Auto-detection FFmpeg (bundled/PATH/common)
│   │   ├── ffprobe.rs                # Auto-detection FFprobe
│   │   └── fpcalc.rs                 # Auto-detection fpcalc
│   ├── binaries/                     # FFmpeg, FFprobe, fpcalc bundled
│   └── tauri.conf.json
├── PROGETTO/
│   ├── PIANIFICAZIONE.md             # Piano di progetto e architettura
│   └── PROTOTIPO-INTERFACCIA/        # Prototipi UI di riferimento
└── docs/
    ├── CHANGELOG.md                  # Indice versioni
    └── log/                          # Changelog dettagliati per versione
```

---

## Changelog

Vedere [docs/CHANGELOG.md](docs/CHANGELOG.md) per l'indice completo delle versioni.

---

*Runtime SoundMaster Pro — Professional Audio Library Management Made Lightweight.*
*Sviluppato da Simone Pizzi — Runtime Radio*
