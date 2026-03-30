# 🎙️ PIANIFICAZIONE: Runtime SoundMaster Pro
## L'Universal Radio Sanitizer per Web Radio Moderne

### 🎯 1. Visione del Progetto
**Runtime SoundMaster Pro** non è più solo uno strumento interno per Azuracast/Liquidsoap, ma si evolve in una suite universale per chiunque gestisca webradio di piccole e medie dimensioni (Shoutcast, Icecast, RadioDJ, MB STUDIO, Azuracast). Il problema comune a tutti i radiofonici è la "library sporca": file con volumi diversi, duplicati silenti, formati eterogenei e metadati mancanti. 

Questo software nasce per essere il **"Filtro di Bonifica"** definitivo prima del caricamento nel sistema di automazione.

---

### 🚀 2. Svolta Tecnologica: Perché Tauri?
L'architettura viene migrata da Electron a **Tauri (Rust + React)** per tre ragioni critiche:
1.  **Efficienza Rust**: Il backend in Rust gestirà le operazioni di I/O sui file e l'interfacciamento con FFmpeg con una velocità e sicurezza di memoria impossibili per Node.js.
2.  **Leggerezza Estrema**: Il pacchetto finale peserà circa 10-15MB (contro i 100+MB di Electron), rendendolo uno strumento "agile" e portabile.
3.  **Basso Consumo di Risorse**: Fondamentale per chi lo tiene aperto in background mentre gestisce altri software di regia o encoding.

---

### 🏛️ 3. Architettura "The Hub" (Dashboard Centrale)
L'app si apre su una dashboard "Command Center" pulita e professionale (Design: *Cyber-Soviet Dark Mode*). Da qui l'utente vede lo stato della propria "Area di Lavoro" e può accedere a tre moduli specializzati. Al termine di ogni operazione, un tasto "Home" riporta sempre all'Hub.

---

### 🧩 4. I Tre Moduli (Opzioni Separate)

#### **Opzione A: The Cleaner (Deduplicatore)**
*Eredità: TuneUp*
- **Acoustic Fingerprinting**: Scansione dell'impronta sonora per trovare brani identici anche se rinominati o salvati in formati diversi.
- **Auto-Pick Gold**: Suggerisce automaticamente quale copia tenere in base alla qualità tecnica (Bitrate/Lossless).
- **Safety Vault**: Spostamento fisico dei duplicati in una cartella di quarantena prima dell'eliminazione definitiva.

#### **Opzione B: The Conformer (Standardizzatore Radio)**
*Eredità: LiquidSopaConformer / AudioMetadataConverter*
- **Universal Radio Format**: Conversione massiva in **MP3 192kbps CBR 44.1kHz** (lo standard aureo per lo streaming web efficiente).
- **Loudness Normalization**: Applicazione automatica del gain basato sullo standard **EBU R128** per evitare sbalzi di volume tra i brani in onda.
- **Silent Trimming**: Rimozione automatica dei silenzi eccessivi a inizio e fine brano (fondamentale per i mixaggi automatici di Liquidsoap).

#### **Opzione C: The Librarian (Catalogatore & Metadati)**
*Eredità: RuntimeAudioManagerPro*
- **Metadata Scrubbing**: Pulizia dei tag ID3 (rimozione di URL nei commenti, fix maiuscole/minuscole).
- **Artwork Injection**: Recupero e embedding massivo delle cover art nei file.
- **SQLite Catalog**: Creazione di un indice locale ultra-veloce per ricerche istantanee anche su library di 500.000+ brani.

---

### 🛠️ 5. Stack Tecnologico Aggiornato
- **Backend**: Rust (Tauri Core) - Gestione file, hashing e processi FFmpeg.
- **Frontend**: React 19 + Tailwind CSS 4 + Framer Motion (per transizioni fluide tra Hub e Moduli).
- **Database**: SQLite (tramite plugin Tauri SQL) per la persistenza dei dati.
- **Audio Engine**: Integrazione nativa con FFmpeg (binario incluso o rilevato).

---

### 📅 6. Prossimi Passi
1. **Setup Ambiente Tauri**: Inizializzazione del progetto `runtime-soundmaster-pro`.
2. **Sviluppo Hub UI**: Design della dashboard centrale con sistema di navigazione a moduli.
3. **Rust Bridge**: Creazione dei comandi Rust per la scansione rapida delle directory.
4. **Porting Logiche**: Traduzione degli algoritmi Python (Conformer) e TS (TuneUp) in moduli Rust performanti.

---
*Runtime SoundMaster Pro: Professional Audio Library Management Made Lightweight.*
