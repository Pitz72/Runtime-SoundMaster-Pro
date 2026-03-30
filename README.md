# 🎙️ Runtime SoundMaster Pro

> **The Universal Radio Sanitizer** — Suite professionale per la bonifica e standardizzazione di grandi librerie musicali per web radio e sistemi di automazione.

![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-informational?style=flat-square)
![Status](https://img.shields.io/badge/Status-In%20Development-orange?style=flat-square)
![Stack](https://img.shields.io/badge/Stack-Tauri%20%2B%20Rust%20%2B%20React%2019-blue?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## 🎯 Il Problema

Chiunque gestisca una **web radio** conosce il problema della "**library sporca**": anni di download, import da fonti diverse, file estratti da YouTube, formati eterogenei, tag ID3 inconsistenti, brani duplicati salvati in cartelle diverse con nomi diversi.

Prima di caricare qualsiasi file in un sistema di automazione radio — che si tratti di **Liquidsoap, Azuracast, Shoutcast, Icecast, RadioDJ o MB STUDIO** — la libreria deve essere **bonificata**.

**Runtime SoundMaster Pro** è lo strumento definitivo per farlo.

---

## ✨ Funzionalità Principali

SoundMaster Pro è organizzato in tre moduli specializzati accessibili da una dashboard centrale ("The Hub"):

### 🧹 The Cleaner — Deduplicatore Intelligente

Trova e isola i duplicati nella tua libreria con una pipeline di analisi a tre livelli:

**1. Quarantena "Non-Conformi" (pre-analisi)**
Prima ancora di cercare i duplicati, il sistema scansiona l'intera libreria e isola automaticamente i file che non appartengono a una collezione musicale pulita:

- 🎬 **Audio estratti da video YouTube** — rilevati tramite pattern sul nome file (*indipendentemente dall'estensione*: un `.mp3` con "(Official Video)" nel nome viene comunque isolato)
  - Pattern rilevati: `(Official Video)`, `(Official Music Video)`, `(Lyrics Video)`, `(Lyric Video)`, `(Visualizer)`, `(Full Album)`, `(Audio)`, ID YouTube nel nome, URL junk (`www.*`)
- 🎥 **File video mascherati da audio** — rilevati via FFprobe (codec video/misto in file `.mp3`)
- ❌ **Formati non supportati** — estensioni non nella lista consentita
- 🔇 **File corrotti o troncati** — FFprobe fallisce o riporta durata zero
- 🏷️ **File senza metadati estraibili** — nessun Artista/Titolo recuperabile né dai tag né dal nome file

Tutti questi file vengono spostati in `_NonConform/` per una tua revisione finale — **nessun file viene mai cancellato**.

**2. Rilevamento Duplicati (triplice)**
- 🎵 **Acoustic Fingerprinting** (via `fpcalc`/Chromaprint): rileva brani sonoramente identici anche se rinominati, convertiti o in formati diversi
- 🏷️ **Analisi Metadati Normalizzati**: confronto per Artista + Titolo con normalizzazione test (maiuscole, punteggiatura, `&→and`)
- 🔀 **Raggruppamento Versioni Alternative**: Radio Edit, Live, Remix, Instrumental, Remaster — raggruppati per revisione manuale

**3. Auto-Pick Gold — Selezione del File Migliore**
Per ogni gruppo di duplicati, il sistema identifica automaticamente la versione di qualità superiore:
1. **Formato**: Lossless (FLAC, WAV) > Lossy (MP3, AAC, OGG)
2. **Bitrate**: vince la differenza >32kbps
3. **Durata**: il brano più lungo (evita brani tronchi)
4. **Dimensione file**: tiebreaker finale

Hai sempre la possibilità di **sovrascrivere manualmente** la scelta del sistema dalla Review UI.

---

### 🔧 The Conformer — Standardizzatore Universale

Converte in massa la tua libreria nel formato ottimale per il tuo sistema di destinazione, con supporto a **6 preset audio** e opzioni avanzate:

| Preset | Formato | Bitrate | Sample Rate | Ideale per |
|--------|---------|---------|-------------|------------|
| **Podcast / Voce** | MP3 CBR | 128 kbps | 44.1 kHz | Podcast, talk, distribuzione web |
| **Radio Standard** | MP3 CBR | 192 kbps | 44.1 kHz | Liquidsoap, Azuracast, Shoutcast, Icecast |
| **Radio Alta Qualità** | MP3 CBR | 256 kbps | 44.1 kHz | MB Studio, sistemi premium |
| **Master / Archivio** | MP3 CBR | 320 kbps | 48 kHz | RadioDJ, archivio, sistemi hi-fi |
| **FLAC Lossless** | FLAC | Lossless | 44.1 kHz | Archivi master non compressi |
| **Personalizzato** | Configurabile | Configurabile | Configurabile | Utenti avanzati |

**Opzioni aggiuntive** (toggle per ogni preset):
- 📊 **Loudness Normalization EBU R128** — standardizzazione volume broadcast europeo (-23 LUFS, max TP -1 dBTP) via FFmpeg `loudnorm`
- ✂️ **Silent Trimming** — rimozione silenzi iniziali/finali (fondamentale per i mixaggi automatici Liquidsoap)
- 📁 **Preservazione struttura cartelle** — mantiene la gerarchia originale nell'output
- ⚙️ **Modalità In-Place** — sovrascrive i file originali con backup opzionale

---

### 📚 The Librarian — Catalogo & Metadati

Gestione intelligente dei tag ID3 e del catalogo interno SQLite:

**Metadata Scrubbing (Pulizia Tag)**

| Livello | Ideale per | Cosa mantiene |
|---------|-----------|---------------|
| **Broadcast** | Azuracast, Liquidsoap | Title, Artist, Album, Year, Genre, Cover Art |
| **DJ / Producer** | Serato, Rekordbox | Come Broadcast + BPM, Tonalità (Key), Publisher |
| **Minimal** | Pulizia leggera | Solo rimozione commenti junk, URL e encoding non-UTF8 |

**Cover Art (Copertine)**
- Estrazione e visualizzazione copertine reali dai tag ID3/FLAC/M4A
- Injection massiva su file privi di copertina (da file locali o API esterne)
- Fix formato: conversione in JPEG ottimizzato (max 500×500px, 85% qualità)
- Flagging automatico dei file senza copertina

**Catalogo SQLite**
- Indicizzazione locale ultra-veloce dell'intera libreria (Full-Text Search via SQLite FTS5)
- Ricerche istantanee su collezioni di 500.000+ brani
- Persistenza sessioni: log e stato sempre disponibili al riavvio

---

## 🏛️ Architettura

```
Runtime SoundMaster Pro
│
├── The Hub (Dashboard Centrale)
│   ├── Stato area di lavoro
│   ├── Accesso ai 3 moduli
│   └── Log attività live
│
├── Modulo A: The Cleaner
│   ├── FileSystemService (Rust) — Scansione chunked → SQLite
│   ├── QuarantineService (Rust) — Rilevamento Non-Conformi
│   ├── FingerprintService (Rust) — fpcalc / Chromaprint
│   ├── AnalysisOrchestrator (Rust) — Pipeline duplicati
│   ├── QualityPicker (Rust) — Best-Pick algorithm
│   └── Review UI (React) — Master-Detail + Cover Art + Override
│
├── Modulo B: The Conformer
│   ├── ConformerService (Rust) — FFmpeg pipeline multi-preset
│   ├── LoudnormService (Rust) — EBU R128 2-pass
│   └── SilenceTrimService (Rust) — Rilevamento e taglio silenzi
│
└── Modulo C: The Librarian
    ├── MetadataService (Rust/lofty-rs) — Read/write tag
    ├── ArtworkService (Rust) — Estrazione, resize, injection
    └── CatalogService (Rust) — SQLite FTS5, ricerca full-text
```

**Principio fondamentale: Non-Distruttivo**
SoundMaster Pro non cancella mai nulla. Ogni operazione sposta i file in cartelle sicure:
- `_Duplicates/` — copie inferiori rilevate dal Cleaner
- `_NonConform/` — audio da YouTube, video mascherati, file corrotti
- `_ToVerify/` — versioni alternative (Live, Remix, ecc.) per revisione manuale

---

## 🛠️ Stack Tecnologico

| Layer | Tecnologia |
|-------|-----------|
| **Backend Core** | Rust (Tauri) |
| **Database** | SQLite (`rusqlite`) — WAL mode, FTS5 |
| **Audio Engine** | FFmpeg (bundle incluso) |
| **Fingerprinting** | fpcalc / Chromaprint (bundle incluso) |
| **Metadati Audio** | lofty-rs |
| **Frontend** | React 19 + TypeScript |
| **Styling** | Tailwind CSS 4 |
| **Animazioni** | Framer Motion |
| **State Management** | Zustand |

---

## 💻 Piattaforme Supportate

| Sistema Operativo | Architettura | Formato Distribuzione |
|------------------|-------------|----------------------|
| **Windows 10/11** | x64 | Installer `.exe` (NSIS/MSI) |
| **macOS 12+** | Apple Silicon (ARM64) | `.dmg` |
| **macOS 12+** | Intel (x64) | `.dmg` |
| **Linux** | x64 | AppImage / `.deb` / `.rpm` |

> 📦 Pacchetto stimato: **~15MB** (vs 100+MB delle versioni Electron precedenti), grazie all'architettura Tauri/Rust.

---

## 🎨 Design System

Il design segue la filosofia **"The Brutalist Control Room"**: un pannello di controllo industriale ispirato all'estetica Cyber-Soviet, pensato per un uso professionale prolungato.

- `0px` border radius — nessun arrotondamento, è uno strumento da lavoro
- Palette **Spectral Functionalism**: ogni colore ha una funzione precisa
  - Verde Radioattivo `#39FF14` — stato attivo, segnale
  - Ambra `#FFB211` — alert, highlight
  - Chassis `#131313` / `#201F1F` / `#2A2A2A` — superfici
- Tipografia: **Space Grotesk** (uppercase, headlines) + **JetBrains Mono** (dati tecnici)
- Glassmorphism per overlay HUD
- Micro-animazioni Framer Motion per transizioni Hub ↔ Moduli

---

## 📂 Struttura Repository

```
Runtime-SoundMaster-Pro/
├── PROGETTO/
│   ├── PIANIFICAZIONE.md                    ← Piano tecnico dettagliato v2.0
│   └── PROTOTIPO-INTERFACCIA/
│       └── stitch_app_audio/
│           ├── signal_kombinat/             ← Design System (DESIGN.md)
│           ├── the_hub_dashboard/           ← Mockup Hub (screen.png + code.html)
│           ├── the_cleaner_deduplicator/    ← Mockup The Cleaner
│           ├── the_conformer_standardizer/  ← Mockup The Conformer
│           └── the_librarian_metadata_catalog/ ← Mockup The Librarian
└── README.md
```

---

## 🗺️ Roadmap

- **Fase 0** — Setup ambiente Tauri + SQLite + FFmpeg + fpcalc
- **Fase 1** — Hub UI & Design System
- **Fase 2** — The Cleaner (Quarantena + Duplicati + Review UI)
- **Fase 3** — The Conformer (Multi-preset + EBU R128 + Silent Trim)
- **Fase 4** — The Librarian (Metadati + Cover Art + Catalogo)
- **Fase 5** — Polish, test su librerie reali, build multipiattaforma

---

## 🎵 Origine del Progetto

SoundMaster Pro è la convergenza finale di quattro strumenti sviluppati separatamente nel corso degli anni:

| Progetto | Contributo |
|---------|-----------|
| **TuneUp 3.0.2** | Gestore duplicati con Acoustic Fingerprinting e Best-Pick algorithm |
| **LiquidSopaConformer** | Motore di standardizzazione audio con FFmpeg |
| **RuntimeAudioManagerPro** | Architettura DB-Driven SQLite, preset multi-formato, Cover Art streaming |

---

*Sviluppato da **Simone Pizzi** — Runtime Radio*  
*Software professionale per la gestione di librerie musicali radio*
