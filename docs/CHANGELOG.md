# Changelog — Runtime SoundMaster Pro

Indice di tutte le versioni rilasciate. Ogni versione ha il proprio documento dettagliato in `docs/log/`.

---

## Versioni

### v0.5.10 — Destination Clarity + Workspace Guard

> 2026-04-04 · Fix UX critico — prevenzione perdita dati

**Bug**: la selezione della cartella sorgente come destinazione custom causava lo spostamento dei file nella stessa cartella di origine con suffisso `_1` (anziché in `_Duplicates/` o `_NonConform/`). **Fix**: aggiunta guardia che blocca la selezione se `destinazione == workspace`, con log errore esplicito. **Chiarezza UI**: badge `AUTO — subfolder of source` visibile su entrambe le righe di destinazione quando si usa il default automatico; il pulsante mostra `Override` (default) o `Change` (custom).

[Dettaglio completo](log/0.5.10.md)

---

### v0.5.9 — Dynamic Version + Quarantine Path Display + Groups UX

> 2026-04-04 · Fix UX post-test

**Quarantine path in UI**: dopo quarantena o resolve, la UI mostra il path esatto della cartella dove i file sono stati spostati — risolve il problema segnalato dove l'utente trovava "2 moved, 0 failed" ma non sapeva dove cercare i file. Il path è ora restituito da Rust (`QuarantineResult.quarantine_path`, `DuplicateResolveResult.quarantine_path`) e mostrato nelle schermate risultato. **Versione dinamica**: rimosso ogni hardcoded — `getVersion()` da `@tauri-apps/api/app` legge la versione da `tauri.conf.json` al boot e la propaga all'intera UI via Zustand store; eliminato `V3.4.1 PRO` nella sidebar (retaggio di vecchio template). **Groups UX**: aggiunta spiegazione "A group = 2+ files identified as duplicates of each other" sotto il contatore in Step 2 Duplicates.

[Dettaglio completo](log/0.5.9.md)

---

### v0.5.8 — Critical Fix: Cover Art False Positive + Scan Progress UX

> 2026-04-04 · Fix critico emerso dal primo test reale su libreria di produzione

**Bug critico**: quasi tutti gli MP3 venivano flaggati come `video_stream` (98% falsi positivi). Causa: FFprobe riporta la copertina album (tag ID3 APIC) come stream con `codec_type = "video"`. Fix: aggiunta struct `FfprobeDisposition` con campo `attached_pic` — la condizione `has_video` ora esclude gli stream con `attached_pic == 1` (cover art) e segnala solo i veri video stream. **UX**: durante la scansione del workspace, `CleanerModule` mostrava il bottone grigio senza spiegazione. Ora mostra una progress bar animata con contatore `file / totale` e nome del file corrente, identica a quella dell'HubModule.

[Dettaglio completo](log/0.5.8.md)

---

### v0.5.7 — Debug Log + Scan Isolation

> 2026-04-04 · Feature di supporto al testing

**File di log persistente**: nuovo modulo `logger.rs` — scrive in `%APPDATA%\runtime-soundmaster-pro\runtime-soundmaster.log` con timestamp `HH:MM:SS`. Ogni non-conform rilevato, ogni gruppo duplicato trovato, ogni file spostato è tracciato con filename, categoria e dettaglio. Comando Tauri `get_log_path` per localizzare il file. **Isolamento scansioni**: `scan_workspace` ora resetta `conforming_status='unknown'` per tutti i track del workspace prima di ogni nuova scansione — ogni run produce risultati fresh senza ereditare stati precedenti. **Fix correlato**: `_NonConform` e `_Duplicates` escluse dal WalkDir — i file in quarantena non vengono più re-indicizzati come nuovi track.

[Dettaglio completo](log/0.5.7.md)

---

### v0.5.6 — Four-Lieve Fix: Cross-Platform Path, Code Deduplication, Regex OnceLock, fpcalc Duration

> 2026-04-04 · Fix criticità lievi — chiude il ciclo di code review sistematica v0.5.x

**L2** — `CleanerModule.tsx`: separatore path rilevato dinamicamente dal workspace path di sistema (`\` su Windows, `/` su macOS/Linux) — elimina il `\\` hardcoded. **L3** — `collision_safe_path` estratta dai due moduli in cui era duplicata (`cleaner.rs`, `duplicates.rs`) nel nuovo modulo condiviso `utils.rs` — unica fonte di verità, nessun rischio di divergenza silente. **L4** — `build_patterns()` sostituita con `COMPILED_PATTERNS: OnceLock<Vec<Regex>>` — i 17 pattern vengono compilati una sola volta per processo; panic message ora indica il pattern specifico. **L5** — La duration calcolata da fpcalc (`_dur` era scartata) viene ora salvata in `tracks.duration_secs` per i file senza metadati, migliorando il best-pick algorithm in presenza di tag ID3 mancanti.

[Dettaglio completo](log/0.5.6.md)

---

### v0.5.5 — Three-Medium Fix: Type Safety, RAM Optimization, Robust JSON Parsing

> 2026-04-04 · Fix criticità medie (stessa sessione di v0.5.4)

**M1** — `CleanerModule.tsx`: rimossi 2× dynamic import ridondanti di `invoke` (già importato staticamente); sostituiti con `invoke<LibraryStats>` tipato — elimina il cast `as any` e allinea il pattern a `App.tsx`. **M2** — `scanner.rs`: refactor two-pass — Pass 1 conta i file senza allocare `Vec<PathBuf>` (O(1) RAM), Pass 2 li indicizza direttamente su SQLite; conforme alla specifica DB-First in `PIANIFICAZIONE.md §4`. **M3** — `cleaner.rs`: parsing FFprobe riscritto con `serde_json` e struct `#[derive(Deserialize)]`; `extract_duration_from_json` rimossa; duration estratta da `format.duration` (container, più affidabile) con fallback a `stream.duration`.

[Dettaglio completo](log/0.5.5.md)

---

### v0.5.4 — Three-Critical-Bug Fix: Corrupt False Positives, Duplicate Loop, YouTube ID

> 2026-04-04 · Hotfix su tre criticità gravi

**G1** — `extract_duration_from_json` ora restituisce `Option<f64>`: `None` (campo assente) non è più confuso con `Some(0.0)` (durata realmente zero), eliminando i falsi positivi corrupt su file con formati non standard. **G2** — Query `detect_duplicates` ora esclude `conforming_status='duplicate'`: file già spostati in `_Duplicates/` non vengono più ri-processati in loop a ogni esecuzione. **G3** — Pattern YouTube ID ora richiede charset misto (lettera + cifra) nel suffisso da 11 chars: elimina falsi positivi su nomi come `Song_Remastered` o `Track_LiveEdit`.

[Dettaglio completo](log/0.5.4.md)

---

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
