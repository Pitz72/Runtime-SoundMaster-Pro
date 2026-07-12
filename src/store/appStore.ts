/**
 * appStore.ts — Zustand Store Globale
 * Runtime SoundMaster Pro v0.5.10
 *
 * Stato globale dell'applicazione:
 * - Navigazione tra Hub e moduli
 * - Workspace path selezionato
 * - Stato del sistema (DB, FFmpeg, fpcalc)
 * - Activity log live
 */

import { create } from "zustand";

// --- Tipi ---

export type ModuleId = "hub" | "cleaner" | "conformer" | "librarian" | "settings";

export type LogType = "info" | "success" | "warning" | "error";

export interface LogEntry {
  id: string;
  timestamp: string; // HH:MM:SS
  type: LogType;
  message: string;
  detail?: string;
}

// Corrisponde a db::LibraryStats nel backend Rust
export interface LibraryStats {
  total_tracks: number;
  non_conform: number;
  duplicates: number;
  to_verify: number;
}

// Corrisponde a scanner::ScanResult nel backend Rust
export interface ScanResult {
  scan_id: number;
  total_files: number;
  duration_secs: number;
}

// Corrisponde a scanner::ScanProgress nel backend Rust
export interface ScanProgress {
  scanned: number;
  total: number;
  current_file: string;
  phase: 'discovering' | 'indexing' | 'complete' | 'error';
}

// Corrisponde a cleaner::NonConformItem nel backend Rust
export interface NonConformItem {
  id: number;
  path: string;
  filename: string;
  /** "youtube_pattern" | "video_stream" | "corrupt" */
  reason: string;
  reason_detail: string;
  file_size_bytes: number;
}

// Corrisponde a cleaner::CleanerProgress nel backend Rust
export interface CleanerProgress {
  analyzed: number;
  total: number;
  current_file: string;
  phase: 'analyzing' | 'complete' | 'error';
  found: number;
}

// Corrisponde a cleaner::CleanerResult nel backend Rust
export interface CleanerResult {
  total_analyzed: number;
  non_conform_found: number;
  items: NonConformItem[];
}

// Corrisponde a cleaner::QuarantineResult nel backend Rust
export interface QuarantineResult {
  moved: number;
  failed: number;
  quarantine_path: string;  // path effettivo dove sono stati spostati i file (v0.5.9)
}

// ── Tipi duplicates.rs ────────────────────────────────────────────────────

export interface DuplicateFile {
  id: number;
  path: string;
  filename: string;
  artist: string | null;
  title: string | null;
  bitrate: number | null;
  duration_secs: number | null;
  file_size_bytes: number;
  format: string | null;
  is_best_pick: boolean;
}

export interface DuplicateGroup {
  group_id: string;
  /** "binary_hash" | "metadata" | "acoustic" */
  match_type: string;
  score: number;
  files: DuplicateFile[];
  best_pick_id: number;
}

export interface DuplicateProgress {
  phase: 'binary' | 'metadata' | 'acoustic' | 'complete' | 'error';
  processed: number;
  total: number;
  current_file: string;
  groups_found: number;
}

export interface DuplicateDetectResult {
  total_processed: number;
  groups_found: number;
  groups: DuplicateGroup[];
}

export interface DuplicateResolveResult {
  moved: number;
  failed: number;
  quarantine_path: string;  // path effettivo dove sono stati spostati i file (v0.5.9)
}

export interface SystemStatus {
  db: string | null;
  ffmpegFound: boolean;
  ffmpegPath: string | null;
  ffmpegVersion: string | null;
  ffmpegSource: string | null;
  ffprobeFound: boolean;
  ffprobePath: string | null;
  ffprobeVersion: string | null;
  ffprobeSource: string | null;
  fpcalcFound: boolean;
  fpcalcPath: string | null;
  fpcalcVersion: string | null;
  fpcalcSource: string | null;
  initialized: boolean;
}

// --- Store Interface ---

interface AppState {
  // Versione app (letta da Tauri al boot — evita hardcoded nei componenti)
  appVersion: string;
  setAppVersion: (v: string) => void;

  // Navigazione
  currentModule: ModuleId;
  setModule: (module: ModuleId) => void;

  // Workspace
  workspacePath: string | null;
  setWorkspacePath: (path: string | null) => void;

  // Stato sistema
  systemStatus: SystemStatus;
  setSystemStatus: (status: Partial<SystemStatus>) => void;

  // Statistiche libreria (popolate da get_library_stats dopo scan)
  libraryStats: LibraryStats | null;
  setLibraryStats: (stats: LibraryStats) => void;

  // Stato scansione workspace
  isScanning: boolean;
  setIsScanning: (scanning: boolean) => void;
  scanProgress: ScanProgress | null;
  setScanProgress: (progress: ScanProgress | null) => void;

  // Stato The Cleaner — non-conform detection
  isCleanerRunning: boolean;
  setIsCleanerRunning: (running: boolean) => void;
  cleanerProgress: CleanerProgress | null;
  setCleanerProgress: (progress: CleanerProgress | null) => void;
  nonConformItems: NonConformItem[];
  setNonConformItems: (items: NonConformItem[]) => void;

  // Stato The Cleaner — duplicate detection
  isDuplicateRunning: boolean;
  setIsDuplicateRunning: (running: boolean) => void;
  duplicateProgress: DuplicateProgress | null;
  setDuplicateProgress: (progress: DuplicateProgress | null) => void;
  duplicateGroups: DuplicateGroup[];
  setDuplicateGroups: (groups: DuplicateGroup[]) => void;

  // Log
  logs: LogEntry[];
  addLog: (type: LogType, message: string, detail?: string) => void;
  clearLogs: () => void;

  // UI
  logPanelOpen: boolean;
  toggleLogPanel: () => void;
  setLogPanelOpen: (open: boolean) => void;
}

// --- Utilità ---

function nowTime(): string {
  return new Date().toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

let logIdCounter = 0;
function newLogId(): string {
  return `log-${Date.now()}-${logIdCounter++}`;
}

// --- Store ---

export const useAppStore = create<AppState>((set) => ({
  // Versione app — aggiornata da App.tsx via getVersion() Tauri.
  // Placeholder neutro fino al boot: mai una versione hardcoded che
  // diventa stale (fix v0.5.16).
  appVersion: '…',
  setAppVersion: (v) => set({ appVersion: v }),

  // Navigazione
  currentModule: "hub",
  setModule: (module) =>
    set((state) => {
      // Log automatico della navigazione
      const labels: Record<ModuleId, string> = {
        hub: "The Hub — Command Center",
        cleaner: "MOD-A: The Cleaner",
        conformer: "MOD-B: The Conformer",
        librarian: "MOD-C: The Librarian",
        settings: "Settings",
      };
      const entry: LogEntry = {
        id: newLogId(),
        timestamp: nowTime(),
        type: "info",
        message: `Navigazione → ${labels[module]}`,
      };
      return {
        currentModule: module,
        logs: [...state.logs, entry].slice(-200), // max 200 entries
      };
    }),

  // Workspace
  workspacePath: null,
  setWorkspacePath: (path) =>
    set((state) => {
      const entry: LogEntry = {
        id: newLogId(),
        timestamp: nowTime(),
        type: path ? "success" : "warning",
        message: path
          ? `Workspace impostato: ${path}`
          : "Workspace rimosso",
      };
      return {
        workspacePath: path,
        // Fix v0.5.13 (criticità 6): cambiare workspace invalida i risultati
        // di detection in memoria. Senza questo reset era possibile eseguire
        // Resolve/Quarantine con i gruppi del workspace precedente, spostando
        // file del vecchio workspace nella quarantena del nuovo.
        nonConformItems: [],
        duplicateGroups: [],
        cleanerProgress: null,
        duplicateProgress: null,
        logs: [...state.logs, entry].slice(-200),
      };
    }),

  // Statistiche libreria
  libraryStats: null,
  setLibraryStats: (stats) => set({ libraryStats: stats }),

  // Scansione
  isScanning: false,
  setIsScanning: (scanning) => set({ isScanning: scanning }),
  scanProgress: null,
  setScanProgress: (progress) => set({ scanProgress: progress }),

  // Cleaner
  isCleanerRunning: false,
  setIsCleanerRunning: (running) => set({ isCleanerRunning: running }),
  cleanerProgress: null,
  setCleanerProgress: (progress) => set({ cleanerProgress: progress }),
  nonConformItems: [],
  setNonConformItems: (items) => set({ nonConformItems: items }),

  // Duplicati
  isDuplicateRunning: false,
  setIsDuplicateRunning: (running) => set({ isDuplicateRunning: running }),
  duplicateProgress: null,
  setDuplicateProgress: (progress) => set({ duplicateProgress: progress }),
  duplicateGroups: [],
  setDuplicateGroups: (groups) => set({ duplicateGroups: groups }),

  // Sistema
  systemStatus: {
    db: null,
    ffmpegFound: false,
    ffmpegPath: null,
    ffmpegVersion: null,
    ffmpegSource: null,
    ffprobeFound: false,
    ffprobePath: null,
    ffprobeVersion: null,
    ffprobeSource: null,
    fpcalcFound: false,
    fpcalcPath: null,
    fpcalcVersion: null,
    fpcalcSource: null,
    initialized: false,
  },
  setSystemStatus: (status) =>
    set((state) => ({
      systemStatus: { ...state.systemStatus, ...status },
    })),

  // Log
  logs: [
    {
      id: "boot-0",
      timestamp: nowTime(),
      type: "info",
      message: "Runtime SoundMaster Pro avviato.",
    },
  ],
  addLog: (type, message, detail) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          id: newLogId(),
          timestamp: nowTime(),
          type,
          message,
          detail,
        },
      ].slice(-200),
    })),
  clearLogs: () =>
    set({
      logs: [
        {
          id: newLogId(),
          timestamp: nowTime(),
          type: "info",
          message: "Log pulito.",
        },
      ],
    }),

  // UI
  logPanelOpen: false,
  toggleLogPanel: () => set((state) => ({ logPanelOpen: !state.logPanelOpen })),
  setLogPanelOpen: (open) => set({ logPanelOpen: open }),
}));
