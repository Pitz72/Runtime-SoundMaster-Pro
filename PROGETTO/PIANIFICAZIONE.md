# 🎙️ PIANIFICAZIONE: Runtime SoundMaster Pro
## L'Universal Radio Sanitizer per Web Radio Moderne
### Versione Piano: 2.0 — Aggiornato con analisi progetti sorgente

---

### 🎯 1. Visione del Progetto

**Runtime SoundMaster Pro** è la convergenza finale di quattro strumenti separati sviluppati nel corso degli anni:

| Progetto | Eredità | Stato | Percorso Locale |
|---------|---------|-------|-----------------|
| `TuneUp 3.0.2` / `tuneup` | Gestore Duplicati Musicali (Python → Electron/TS) | Archiviato | [TuneUp 3.0.2](file:///C:/Users/Utente/Documents/SVILUPPO/UTILITY/TuneUp%203.0.2) · [tuneup (GitHub)](file:///C:/Users/Utente/Documents/GitHub/tuneup) |
| `LiquidSopaConformer` | Audio & Metadata Converter (Python/CustomTkinter) | Archiviato | [LiquidSopaConformer](file:///C:/Users/Utente/Documents/GitHub/LiquidSopaConformer) |
| `RuntimeAudioManagerPro` | Suite unificata con SQLite (Electron/TS) | **Archiviato al v0.3.8 — 18/03/2026** | [RuntimeAudioManagerPro](file:///C:/Users/Utente/Documents/GitHub/RuntimeAudioManagerPro) |

> ⚠️ **Nota sui progetti di riferimento**: I progetti elencati sopra rappresentano fasi evolutive precedenti, sviluppate in iterazioni successive con stack tecnologici ormai superati (Python/CustomTkinter, Electron/Node.js). Sono analizzati come **fonte di ispirazione per la logica funzionale** (algoritmi, pipeline, lezioni apprese) e **non come modello architetturale**. Runtime SoundMaster Pro è un progetto definitivo progettato con standard qualitativi e tecnici sensibilmente superiori rispetto a tutti i predecessori.

Questo software nasce per essere il **"Filtro di Bonifica"** definitivo prima del caricamento in qualsiasi sistema di automazione radio (Shoutcast, Icecast, RadioDJ, MB STUDIO, Azuracast, Liquidsoap).

Il problema comune a tutti i radiofonici è la **"library sporca"**: file con volumi diversi, duplicati sonori, formati eterogenei, metadati mancanti, copertine assenti o inconsistenti.

---

### 🚀 2. Svolta Tecnologica: Perché Tauri?

L'architettura viene migrata da Electron (usato in tuneup/RuntimeAudioManagerPro) a **Tauri (Rust + React)** per tre ragioni critiche emerse dall'analisi dei progetti precedenti:

1. **Efficienza Rust**: I problemi di OOM (Out Of Memory) documentati in RuntimeAudioManagerPro con librerie >50.000 file vengono risolti alla radice. Il backend Rust gestirà I/O, hashing e FFmpeg senza neanche sfiorare la RAM per i dataset.
2. **Leggerezza Estrema**: Il pacchetto finale peserà circa 10-15MB (contro i 100+MB di Electron/PyInstaller), un vantaggio concreto per chi lo tiene aperto accanto a RadioDJ o MB Studio.
3. **Basso Consumo di Risorse**: Fondamentale per chi lo esegue in background sulla stessa macchina del sistema di automazione radio.

> ⚠️ **Lezione dai progetti precedenti**: RuntimeAudioManagerPro ha subito diversi crash e blocchi causati da SQLite in modalità non-WAL durante scritture massive concorrenti. In SoundMaster Pro, il database SQLite sarà configurato con **WAL + cache ottimizzata** fin dal primo avvio.

---

### 🏛️ 3. Architettura "The Hub" (Dashboard Centrale)

L'app si apre su una dashboard **"Command Center"** (Design: *Cyber-Soviet Dark Mode / Brutalist Control Room*). Da qui l'utente vede lo stato della propria "Area di Lavoro" e accede ai tre moduli specializzati. Al termine di ogni operazione, un tasto "Home" riporta sempre all'Hub.

L'architettura segue un flusso non-distruttivo: i file originali non vengono mai cancellati. Vengono spostati in cartelle di quarantena sicure (`_Duplicates/`, `_NonConform/`, `_ToVerify/`).

---

### 🧩 4. I Tre Moduli

---

#### **Modulo A: THE CLEANER — Deduplicatore Intelligente**
*Eredità: TuneUp 3.0.2 + tuneup (Python → TS) + RuntimeAudioManagerPro (TS)*

##### Logica Core (da `gestore_duplicati_musicali.py` + `AnalysisOrchestrator.ts`)
Il Cleaner orchestra una pipeline in 3 passi:

**Passo 1 — Scansione Ricorsiva + Quarantena "Non-Conformi"**
- Scansione stream-chunked / async per non saturare la RAM (architettura DB-First: ogni file trovato viene scritto su SQLite, non accumulato in RAM)
- Formati audio riconosciuti: `.mp3`, `.flac`, `.wav`, `.m4a`, `.aac`, `.ogg`, `.wma`

**Sistema di Quarantena Multi-Livello** (integrato nella fase di scansione):

Il sistema identifica e isola automaticamente in `_NonConform/` i file che non appartengono a una libreria musicale pulita. Questo avviene **prima ancora della ricerca duplicati**:

| Tipo | Metodo di Rilevamento | Esempi |
|------|----------------------|--------|
| **Audio da Video YouTube** | Pattern regex sul nome file (indipendente dall'estensione — un `.mp3` estratto da YouTube viene comunque isolato) | `Song (Official Video).mp3`, `Artist - Title [Official Music Video].mp3`, `Track (Lyrics Video).flac`, `(Visualizer).mp3` |
| **File video con estensione audio** | Hash/probe FFmpeg: il codec rilevato è video/misto, non audio puro | `.mp4`, `.mkv`, `.avi` rinominati in `.mp3` |
| **Formati non supportati** | Estensione non nella lista allowed | `.wma` legacy, `.ra`, `.aif` non standard, file system temporanei |
| **File senza metadati estraibili** | Nessuna combinazione valida Artista/Titolo dai tag NÉ dal nome file | File completamente privi di tag e con nome non parsabile (`track001.mp3`) |
| **File corrotti** | FFprobe fallisce o riporta durata 0 | File troncati, download incompleti |

I **pattern video** (configurabili dall'utente in `settings.json`) includono di default:
- `(official video)`, `[official video]`
- `(official music video)`, `[official music video]`
- `(lyrics video)`, `[lyrics video]`, `(lyric video)`, `[lyric video]`
- `(visualizer)`, `[visualizer]`
- `(full album)`, `[full album]` — album interi estratti da YouTube
- `(audio)`, `[audio]` — rip YouTube espliciti
- Pattern URL nel nome file: `(www.*)`, presenza di ID YouTube (es. `_dQw4w9WgXcQ`)

Inoltre il sistema rimuove da nomi e tag: URL junk (`www.`, `http`), track number iniziali (`01 -`, `02.`), simboli di copyright e caratteri non stampabili.

**Passo 2 — Analisi Duplicati (triplice)**
- **Per Impronta Acustica (`fpcalc` / AcoustID)**: rileva brani identici anche se rinominati, ri-encodati o in formati diversi. Metodo più preciso.
- **Per Metadati Normalizzati (Artista + Titolo)**: normalizzazione testo (lowercase, rimozione punteggiatura, `&→and`), confronto semantico.
- **Per Versioni Alternative**: raggruppamento brani con stesso titolo base ma varianti (Radio Edit, Live, Remix, Instrumental, Remaster) — pattern configurabili via JSON.

**Passo 3 — Selezione "Best-Pick" (Auto-Pick Gold)**
Algoritmo di selezione del file migliore (da `confronta_qualita()` — TuneUp):
1. **Formato**: Lossless (.flac, .wav) > Lossy (.mp3, .aac, .ogg)
2. **Bitrate** (differenza significativa > 32kbps vince): bitrate superiore preferito
3. **Durata** (differenza > 5s): brano più lungo preferito (evita brani tronchi)
4. **Dimensione file**: a parità di tutto il resto, il file più grande vince

**Review UI** (da RuntimeAudioManagerPro):
- Vista Master-Detail: lista gruppi duplicati a sinistra, dettaglio a destra
- Visualizzazione **Cover Art reali** estratte dai tag ID3 (protocollo `thumb://` per streaming binario senza base64 overhead — lezione da RAMP v0.1.12)
- Toggle interattivo "Forza come Migliore" — permette override manuale della decisione automatica
- Paginazione/virtualizzazione obbligatoria (lezione da RAMP NUOVE_CRITICITA: 5000 img in DOM = crash GPU)

**Sicurezza**:
- Operazioni non-distruttive: duplicati → `_Duplicates/`; video/non conformi → `_NonConform/`; versioni alternative → `_ToVerify/`
- Collision handler automatico su nomi file: aggiunge `_1`, `_2` ecc. se il file esiste già (bug documentato in RAMP ActionRunner)
- Log dettagliato di ogni operazione

---

#### **Modulo B: THE CONFORMER — Standardizzatore Universale**
*Eredità: LiquidSopaConformer (Python) + RuntimeAudioManagerPro `ConformerService.ts`*

##### Logica Core (da `conformer.py` + `ConformerService.ts`)
Il Conformer è un motore di conversione/standardizzazione massiva basato su FFmpeg.

**Funzionamento**:
1. Scansiona la cartella input per trovare file audio
2. Per ogni file: verifica se è già conforme al preset selezionato (check bitrate + sample_rate con tolleranza ±10kbps)
3. Se conforme: copia sicura nella destinazione
4. Se non conforme: transcodifica via FFmpeg con parametri del preset
5. Progressione real-time con possibilità di stop
6. Log su file per debugging post-elaborazione

**Preset Audio Disponibili** — Multi-preset (novità rispetto ai progetti precedenti):

| ID Preset | Nome | Formato | Bitrate | Sample Rate | Canali | Target |
|-----------|------|---------|---------|-------------|--------|--------|
| `PODCAST` | Podcast / Voce | MP3 CBR | 128 kbps | 44.1 kHz | Stereo | Podcast, voce, distribuzione web |
| `RADIO_STD` | Radio Standard | MP3 CBR | 192 kbps | 44.1 kHz | Stereo | **Default radio** — Liquidsoap, Azuracast, Shoutcast, Icecast |
| `RADIO_HQ` | Radio Alta Qualità | MP3 CBR | 256 kbps | 44.1 kHz | Stereo | Sistemi premium, MB STUDIO |
| `MASTER` | Master / Archivio | MP3 CBR | 320 kbps | 48 kHz | Stereo | Archivio, RadioDJ, sistemi hi-fi |
| `LOSSLESS_NORM` | FLAC Normalizzato | FLAC | Lossless | 44.1 kHz | Stereo | Archivi master FLAC |
| `CUSTOM` | Personalizzato | Selezionabile | Configurabile | Configurabile | Configurabile | Utenti avanzati |

**Opzioni aggiuntive** (toggle ON/OFF per ogni preset):
- **Loudness Normalization EBU R128**: applica gain normalization (target -23 LUFS, max TP = -1 dBTP) tramite FFmpeg `loudnorm` filter — standard broadcasting europeo
- **Silent Trimming**: rimozione silenzi iniziali/finali (threshold configurabile in dB, durata min in ms) — fondamentale per mixaggi automatici Liquidsoap
- **Preservazione Struttura Cartelle**: mantiene la gerarchia originale delle directory nell'output
- **Modalità In-Place**: sovrascrive i file originali (con backup opzionale) anziché creare una copia separata

**FFmpeg Integration**:
- Auto-detection FFmpeg nel sistema (PATH, WinGet paths, percorsi comuni)
- In Tauri: binario FFmpeg incluso nel bundle o rilevato nel sistema
- Elaborazione parallela worker-pool (N worker configurabile, default = CPU cores / 2)
- Cancellazione reale: kill() del processo FFmpeg attivo (lezione da RAMP su phantom processes)

---

#### **Modulo C: THE LIBRARIAN — Catalogo & Metadati**
*Eredità: RuntimeAudioManagerPro `MetadataSanitizerService.ts` + LiquidSopaConformer (mutagen)*

##### Logica Core
Il Librarian è il modulo di gestione intelligente dei tag e del catalogo interno SQLite.

**Funzione 1 — Metadata Scrubbing (Pulizia ID3)**
Tre livelli di pulizia selezionabili:

| Livello | Nome | Cosa mantiene |
|---------|------|---------------|
| `BROADCAST` | AzuraCast / Liquidsoap | Title, Artist, Album, Year, Genre, Cover Art |
| `DJ_PROD` | DJ / Producer | Come Broadcast + BPM, Key (Tonalità), Publisher (Etichetta) |
| `MINIMAL` | Pulizia Leggera | Rimuove solo commenti junk, URL nei tag, encoding inconsistente |

Cosa rimuove in automatico (preset BROADCAST/DJ):
- Commenti con URL (tipici dei download YouTube)
- Tag proprietari di software DJ (Serato, Rekordbox, Traktor markup)
- Encoding non-UTF8
- Caratteri di controllo e junk data

**Funzione 2 — Cover Art (Artwork)**
- **Estrazione**: lettura copertine embedded nei tag ID3/FLAC/M4A
- **Visualizzazione**: preview nella UI durante review
- **Injection massiva**: download e embedding automatico cover art mancanti (via MusicBrainz/Last.fm API o file locali selezionati)
- **Fix formato**: conversione copertine in JPEG ottimizzato (max 500x500px per le copie embed, qualità 85%) per ridurre il gonfiore dei file MP3
- **Verifica integrità**: flagging file senza copertina per revisione manuale

**Funzione 3 — Catalogo SQLite**
- Indicizzazione locale ultra-veloce dell'intera libreria (basato su architettura DB-Driven di RAMP)
- Schema tabelle: `library.db` con WAL mode + cache size configurata
  - `tracks`: path, artist, title, album, year, genre, bitrate, sample_rate, duration, file_size, fingerprint, cover_hash, scan_id, conforming_status
  - `scans`: id, timestamp, root_path, status, stats_json
  - `cover_art`: track_id, data (BLOB), format, width, height
- Ricerche istantanee su librerie di 500.000+ brani via FTS5 (Full-Text Search SQLite)
- Persistenza sessioni: il log dell'ultima scansione è sempre consultabile al riavvio

---

### 🛠️ 5. Stack Tecnologico

| Layer | Tecnologia | Note |
|-------|-----------|------|
| **Backend Core** | **Rust (Tauri)** | File I/O, hashing SHA-256, processi FFmpeg, SQLite |
| **Database** | **SQLite** (via `rusqlite`) | WAL mode, cache ottimizzata, FTS5 |
| **Audio Engine** | **FFmpeg** (binario incluso) | Conversione, probe, loudnorm, silence detect |
| **Fingerprinting** | **fpcalc (Chromaprint)** | Acoustic fingerprint per rilevamento duplicati |
| **Metadati Audio** | **lofty-rs** (Rust) | Lettura/scrittura tag ID3/FLAC/M4A/OGG |
| **Frontend** | **React 19 + TypeScript** | UI via Tauri WebView |
| **Styling** | **Tailwind CSS 4** | Design System "Brutalist Control Room" |
| **Animazioni** | **Framer Motion** | Transizioni Hub ↔ Moduli |
| **State** | **Zustand** | Store UI globale (impostazioni, progresso, sessione) |

---

### 🎨 6. Design System — Riferimento Estetico

Il design di riferimento è il sistema **"The Brutalist Control Room"** (Signal Kombinat) documentato in:
`PROTOTIPO-INTERFACCIA/stitch_app_audio/signal_kombinat/DESIGN.md`

**Principi chiave**:
- `0px` border radius ovunque — "no rounded corners", è uno strumento professionale
- **No linee divisorie** — i confini si creano con tonal shifts di superficie
- **Palette "Spectral Functionalism"**: ogni colore ha una "tensione" funzionale
  - Chassis: `#131313` (surface_dim)
  - Pannelli: `#201F1F` / `#2A2A2A` (surface_container)
  - Accento Radioattivo: `#39FF14` (primary_container) — stato attivo, power-on
  - Ambra Alert: `#FFB211` (secondary_container) — highlight, warning
  - Label tecnici: `#BACCB0` (on_surface_variant) — testo su metallo inciso
- **Tipografia**: Space Grotesk uppercase per headlines, Inter/JetBrains Mono per dati
- **Glassmorphism** per overlay HUD (60% opacity + 12px backdrop-blur)
- **Vacuum Tube glow**: ambra con 24px blur al 10% per tooltip/flyout

> ⚠️ **Nota**: Questo design system è un prototipo di riferimento estetico. Sarà adattato e raffinato durante lo sviluppo sulla base delle esigenze effettive di layout e usabilità di ciascun modulo.

---

### 📋 7. Lezioni Critiche dai Progetti Precedenti

Queste sono le criticità documentate in RuntimeAudioManagerPro che **NON devono ripetersi**:

| # | Problema Originale | Soluzione in SoundMaster Pro |
|---|-------------------|------------------------------|
| 1 | OOM su librerie >50.000 file (array RAM) | Architettura DB-First fin dal giorno 1. Nessun array massivo in memoria. |
| 2 | SQLite SQLITE_BUSY in scritture concorrenti | WAL mode attivata al primo `init()`, obbligatoriamente. |
| 3 | Sovrascrittura silente di file con stesso nome | Collision handler universale su tutte le operazioni fisiche (copia, sposta, trascodifica). |
| 4 | Phantom processes FFmpeg dopo cancellazione | Rust `Child::kill()` esplicito su cancellazione. Nessuna promise orfana. |
| 5 | 5000 immagini nel DOM = crash GPU renderer | Virtual List obbligatoria per tutti i risultati (react-window o equivalente). |
| 6 | Cover Art via base64 IPC = lag scroll | Protocollo custom (es. `thumb://`) per streaming binario delle immagini. |
| 7 | Single preset fisso (solo 192kbps) | Sistema multi-preset configurabile (vedi Modulo B). |
| 8 | Switch UI "puramente estetici" non collegati | Ogni controllo UI è collegato a logica reale e aggiorna il database. |

---

### 📅 8. Roadmap di Sviluppo

> **Aggiornamento al 2026-04-04 — v0.5.3**: Le fasi 0, 1 e 2 sono completate. Vedere `docs/CHANGELOG.md` per il dettaglio di ogni versione rilasciata.

#### Fase 0 — Setup Ambiente ✅ _Completata: 2026-03-31 — v0.0.1_

- [x] Inizializzazione progetto Tauri (Rust + React 19 + TS + Tailwind 4)
- [x] Configurazione build pipeline (Windows target principale, macOS/Linux secondari)
- [x] Setup SQLite (`rusqlite`) con schema iniziale + WAL mode
- [x] Integrazione FFmpeg (auto-detection + bundle)
- [x] Integrazione fpcalc (bundle incluso)

#### Fase 1 — Hub UI & Design System ✅ _Completata: 2026-04-03 — v0.2.0_

> Nota: il design system "Brutalist Control Room" (verde `#39FF14`) è stato sostituito in v0.2.0 da "Industrial" (ambra `#FFB300` + ciano `#A4E7FF`). Il documento `PROTOTIPO-INTERFACCIA/signal_kombinat/DESIGN.md` è un riferimento storico.

- [x] Implementazione Design System "Industrial" (ambra/ciano su carbone scuro)
- [x] Dashboard Hub centrale con navigazione a moduli (Framer Motion)
- [x] Sistema di notifiche/log live integrato (Zustand + AnimatePresence)
- [x] Scansione workspace ricorsiva con progress streaming real-time (`scanner.rs`)
- [x] Statistiche libreria live dall'Hub (SQLite → React)

#### Fase 2 — The Cleaner (Modulo A) ✅ _Completata: 2026-04-03 — v0.5.3_

- [x] `scanner.rs`: scansione ricorsiva chunked + DB-First (INSERT OR IGNORE)
- [x] `cleaner.rs`: 17 pattern regex YouTube + FFprobe video stream + corrupt detection
- [x] `ffprobe.rs`: detection dedicata bundled/PATH/common (separata da FFmpeg)
- [x] Quarantena non-distruttiva `_NonConform/` con collision-safe naming
- [x] `duplicates.rs`: SHA-256 binary hash + metadata fuzzy + acoustic fingerprinting (fpcalc)
- [x] Best-pick algorithm: lossless > bitrate > durata > dimensione
- [x] Quarantena duplicati `_Duplicates/` con override manuale per gruppo
- [x] FFmpeg 8.1 + FFprobe 8.1 + fpcalc 1.6.0 bundled attivi
- [x] CleanerModule: mode switcher NON-CONFORM / DUPLICATES, UI completa wired

#### Fase 3 — The Conformer (Modulo B) — _In sviluppo: v0.6.0+_

- [ ] `conformer.rs` (Rust): pipeline FFmpeg con preset (PODCAST / RADIO_STD / RADIO_HQ / MASTER / LOSSLESS_NORM)
- [ ] Loudness normalization EBU R128 via FFmpeg `loudnorm` (2-pass)
- [ ] Silent trimming (`silencedetect` + trim)
- [ ] Worker concorrenti con kill reale (lezione phantom processes da RAMP)
- [ ] Progress streaming via eventi Tauri
- [ ] ConformerModule: collegamento UI preset selector + file queue + progress per-file

#### Fase 4 — The Librarian (Modulo C) — _Pianificata: v0.7.0+_

- [ ] `metadata.rs` (Rust/lofty-rs): read/write tag ID3/FLAC/M4A
- [ ] `artwork.rs` (Rust): estrazione, resize (max 500×500px JPEG), injection massiva
- [ ] `catalog.rs` (Rust): SQLite FTS5 full-text search
- [ ] LibrarianModule: catalogo reale con preview cover art, ricerca, filtri

#### Fase 5 — Polish & Build

- [ ] Test su librerie reali (>50.000 brani) e ottimizzazione performance (profiling Rust)
- [ ] Virtual List obbligatoria per risultati massivi (lezione 5000 img = crash GPU da RAMP)
- [ ] Cover Art streaming via protocollo custom (lezione base64 IPC lag da RAMP)
- [ ] Build installer Windows (NSIS/MSI via Tauri)
- [ ] Documentazione utente

---

---

### 📎 Riferimenti e Fonti

I seguenti progetti locali sono stati analizzati come base di conoscenza per la stesura di questo piano. Contengono logiche, algoritmi e architetture da cui SoundMaster Pro trae ispirazione, pur essendo sviluppi precedenti con qualità tecnica e architetturale inferiore a quella target di questo progetto definitivo:

| Fonte | Percorso Locale | Contributo Principale |
|-------|----------------|----------------------|
| **TuneUp 3.0.2** *(eseguibile stabile)* | [C:\Users\Utente\Documents\SVILUPPO\UTILITY\TuneUp 3.0.2](file:///C:/Users/Utente/Documents/SVILUPPO/UTILITY/TuneUp%203.0.2) | Versione distribuita finale, comportamento atteso, config JSON |
| **tuneup** *(sorgente GitHub)* | [C:\Users\Utente\Documents\GitHub\tuneup](file:///C:/Users/Utente/Documents/GitHub/tuneup) | `gestore_duplicati_musicali.py`: algoritmo best-pick, pipeline duplicati, pattern video/versioni, normalizzazione testo |
| **LiquidSopaConformer** *(sorgente GitHub)* | [C:\Users\Utente\Documents\GitHub\LiquidSopaConformer](file:///C:/Users/Utente/Documents/GitHub/LiquidSopaConformer) | `conformer.py`: pipeline FFmpeg, auto-detection FFmpeg, gestione preset, elaborazione sequenziale |
| **RuntimeAudioManagerPro** *(sorgente GitHub)* | [C:\Users\Utente\Documents\GitHub\RuntimeAudioManagerPro](file:///C:/Users/Utente/Documents/GitHub/RuntimeAudioManagerPro) | Architettura DB-Driven SQLite, streaming Cover Art (`thumb://`), multi-preset, MetadataSanitizerService, criticità architetturali documentate |

---

*Runtime SoundMaster Pro: Professional Audio Library Management Made Lightweight.*  
*Piano v2.0 — Sviluppato da Simone Pizzi — Runtime Radio*
