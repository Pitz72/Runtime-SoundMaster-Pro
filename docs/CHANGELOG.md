# Changelog — Runtime SoundMaster Pro

Indice di tutte le versioni rilasciate. Ogni versione ha il proprio documento dettagliato in `docs/log/`.

---

## Versioni

### v0.5.3 — Three-Bug Hotfix: Scan Button, FFprobe & Mode Switcher

> 2026-04-03 · Hotfix

Fix di tre bug rilevati durante i test reali con 36.701 file: scan button bloccato grigio post-workspace, tutti i file marcati CORRUPT per path errato di FFprobe, pulsanti mode switcher apparentemente invertiti (artefatto visivo del primo bug). Introdotto `ffprobe.rs` con detection dedicata, analogo a `ffmpeg.rs`.

[Dettaglio completo](log/0.5.3.md)

---

### v0.5.2 — FFmpeg & fpcalc Bundled e Attivi

> 2026-04-03 · Hotfix infrastrutturale

Installati i binari reali FFmpeg 8.1-essentials e fpcalc 1.6.0 in `src-tauri/binaries/`. Fix del path errato in `bundled_path()` che cercava nella resource dir root invece di `binaries/`.

[Dettaglio completo](log/0.5.2.md)

---

### v0.5.1 — Workspace Selector nel Cleaner + FFmpeg Bundled

> 2026-04-03 · Hotfix + miglioramento UX

Aggiunto pannello configurazione workspace nello Step 1 del Cleaner (Source + Destination custom). Fix architettura sidecar Tauri: `bundled_path()` ora usa `resource_dir + TARGET` da `build.rs`. Destinazioni quarantena personalizzabili come parametro opzionale.

[Dettaglio completo](log/0.5.1.md)

---

### v0.5.0 — The Cleaner: Duplicate Detection & Resolution

> 2026-04-03 · Feature completa

The Cleaner è ora completo. Aggiunta pipeline di rilevamento duplicati con tre fasi: SHA-256 binary hash, metadata fuzzy matching (normalizzazione testo), acoustic fingerprinting via fpcalc. Best-pick algorithm (lossless > bitrate > durata > size). UI mode switcher NON-CONFORM / DUPLICATES con layout master-detail per i gruppi duplicati.

[Dettaglio completo](log/0.5.0.md)

---

### v0.4.1 — Hotfix: Scroll Bug + rust-analyzer Cache

> 2026-04-03 · Hotfix

Fix del bug che apriva l'app con la viewport in fondo: `scrollIntoView` senza `block: 'nearest'` propagava lo scroll al container principale. Aggiunto reset scroll su cambio modulo in `MainLayout.tsx`.

[Dettaglio completo](log/0.4.1.md)

---

### v0.4.0 — The Cleaner: Non-Conform Detection & Quarantine

> 2026-04-03 · Primo modulo operativo reale

Implementato `cleaner.rs`: 17 pattern regex YouTube per filename detection, FFprobe video stream check e corrupt detection. Quarantena non-distruttiva in `_NonConform/` con collision-safe naming. Aggiornamento DB post-quarantena. CleanerModule riscritto con UI reale a 3 step.

[Dettaglio completo](log/0.4.0.md)

---

### v0.3.0 — Layer 0: Scanner, DB Stats, Event Streaming

> 2026-04-03 · Prima release con logica backend reale

Implementato `scanner.rs`: scansione ricorsiva workspace, indicizzazione DB-First (INSERT OR IGNORE), progress events ogni 100 file. `get_library_stats` con query aggregate read-only. Setup hook Tauri per init DB prima dei comandi. Hub cablato a dati reali.

[Dettaglio completo](log/0.3.0.md)

---

### v0.2.0 — Migrazione UI "Industrial" + Audit di Conformità

> 2026-04-03 · Sostituzione completa design system

Design system "Brutalist Control Room" (verde `#39FF14`) sostituito da "Industrial" (ambra `#FFB300` + ciano `#A4E7FF`). Riscrittura completa di tutti i moduli UI. Aggiunto `SettingsModule`. Rimossi elementi non previsti dallo spec (ricerca globale, notifiche, profili utente). Audit completo dei mock data verso contesto radio broadcasting.

[Dettaglio completo](log/0.2.0.md)

---

### v0.1.0 — Hub UI & Design System

> 2026-03-31 · Struttura UI funzionante

Zustand store globale (`appStore.ts`). Layout master con sidebar, TopBar, LogPanel animato. Navigazione Hub ↔ Moduli con Framer Motion `AnimatePresence`. Plugin Tauri Dialog integrato. Moduli placeholder per Cleaner, Conformer, Librarian.

[Dettaglio completo](log/0.1.0.md)

---

### v0.0.1 — Setup Ambiente

> 2026-03-31 · Setup iniziale

Inizializzazione progetto Tauri 2.x con React 19 + TypeScript + Vite. Schema SQLite con WAL mode, FTS5, indici compositi. Auto-detection FFmpeg e fpcalc (5 strategie per OS). Hub UI placeholder. Configurazione `externalBin` e permessi shell.

[Dettaglio completo](log/0.0.1.md)

---

*Runtime SoundMaster Pro — Professional Audio Library Management Made Lightweight.*
