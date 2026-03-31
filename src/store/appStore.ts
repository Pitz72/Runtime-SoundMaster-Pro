/**
 * appStore.ts — Zustand Store Globale
 * Runtime SoundMaster Pro v0.1.0
 *
 * Stato globale dell'applicazione:
 * - Navigazione tra Hub e moduli
 * - Workspace path selezionato
 * - Stato del sistema (DB, FFmpeg, fpcalc)
 * - Activity log live
 */

import { create } from "zustand";

// --- Tipi ---

export type ModuleId = "hub" | "cleaner" | "conformer" | "librarian";

export type LogType = "info" | "success" | "warning" | "error";

export interface LogEntry {
  id: string;
  timestamp: string; // HH:MM:SS
  type: LogType;
  message: string;
  detail?: string;
}

export interface SystemStatus {
  db: string | null;
  ffmpegFound: boolean;
  ffmpegVersion: string | null;
  ffmpegSource: string | null;
  fpcalcFound: boolean;
  fpcalcVersion: string | null;
  fpcalcSource: string | null;
  initialized: boolean;
}

// --- Store Interface ---

interface AppState {
  // Navigazione
  currentModule: ModuleId;
  setModule: (module: ModuleId) => void;

  // Workspace
  workspacePath: string | null;
  setWorkspacePath: (path: string | null) => void;

  // Stato sistema
  systemStatus: SystemStatus;
  setSystemStatus: (status: Partial<SystemStatus>) => void;

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
        logs: [...state.logs, entry].slice(-200),
      };
    }),

  // Sistema
  systemStatus: {
    db: null,
    ffmpegFound: false,
    ffmpegVersion: null,
    ffmpegSource: null,
    fpcalcFound: false,
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
