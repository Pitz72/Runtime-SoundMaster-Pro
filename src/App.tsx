import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence } from "framer-motion";

import { useAppStore } from "./store/appStore";
import type { LibraryStats, ScanProgress, CleanerProgress, DuplicateProgress } from "./store/appStore";
import { MainLayout } from "./components/layout/MainLayout";
import { HubModule } from "./components/modules/HubModule";
import { CleanerModule } from "./components/modules/CleanerModule";
import { ConformerModule } from "./components/modules/ConformerModule";
import { LibrarianModule } from "./components/modules/LibrarianModule";
import { SettingsModule } from "./components/modules/SettingsModule";

interface TauriFfmpegInfo {
  found: boolean;
  path: string | null;
  version: string | null;
  source: string | null;
}

interface TauriFpcalcInfo {
  found: boolean;
  path: string | null;
  version: string | null;
  source: string | null;
}

export default function App() {
  const {
    currentModule,
    setSystemStatus,
    systemStatus,
    addLog,
    setLibraryStats,
    setScanProgress,
    setIsScanning,
    setIsCleanerRunning,
    setCleanerProgress,
    setIsDuplicateRunning,
    setDuplicateProgress,
  } = useAppStore();

  // ── Inizializzazione Tauri ─────────────────────────────────────────────────
  useEffect(() => {
    if (systemStatus.initialized) return;

    const init = async () => {
      addLog("info", "System initialization in progress...");
      try {
        const [db, ffmpeg, fpcalc] = await Promise.all([
          invoke<string>("db_status"),
          invoke<TauriFfmpegInfo>("detect_ffmpeg_cmd"),
          invoke<TauriFpcalcInfo>("detect_fpcalc_cmd"),
        ]);

        setSystemStatus({
          db,
          ffmpegFound: ffmpeg.found,
          ffmpegPath: ffmpeg.path,
          ffmpegVersion: ffmpeg.version,
          ffmpegSource: ffmpeg.source,
          fpcalcFound: fpcalc.found,
          fpcalcPath: fpcalc.path,
          fpcalcVersion: fpcalc.version,
          fpcalcSource: fpcalc.source,
          initialized: true,
        });

        addLog("success", "System loaded", db);
        if (ffmpeg.found)
          addLog("success", `FFmpeg [${ffmpeg.source}]`, ffmpeg.version ?? undefined);
        else addLog("error", "FFmpeg not detected. Required for The Conformer.");

        if (fpcalc.found)
          addLog("success", `fpcalc [${fpcalc.source}]`, fpcalc.version ?? undefined);
        else
          addLog(
            "warning",
            "fpcalc not detected. Acoustic fingerprinting unavailable for The Cleaner."
          );

        // Carica le statistiche della libreria dopo l'init
        const stats = await invoke<LibraryStats>("get_library_stats");
        setLibraryStats(stats);
        if (stats.total_tracks > 0) {
          addLog("info", `Library catalog: ${stats.total_tracks.toLocaleString()} tracks indexed.`);
        }
      } catch (err) {
        setSystemStatus({ initialized: true });
        addLog("error", "Critical initialization error", String(err));
      }
    };

    init();
  }, [systemStatus.initialized, setSystemStatus, addLog, setLibraryStats]);

  // ── Listener globale eventi scan-progress ─────────────────────────────────
  // Registrato una sola volta al mount — gestisce progress e refresh stats
  // al termine di ogni scansione workspace.
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen<ScanProgress>("scan-progress", async (event) => {
      const payload = event.payload;
      setScanProgress(payload);

      if (payload.phase === "complete") {
        setIsScanning(false);
        setScanProgress(null);
        // Aggiorna le statistiche con i dati reali post-scansione
        try {
          const stats = await invoke<LibraryStats>("get_library_stats");
          setLibraryStats(stats);
          addLog(
            "success",
            `Scan complete — ${stats.total_tracks.toLocaleString()} tracks indexed.`
          );
        } catch (err) {
          addLog("error", "Failed to refresh library stats", String(err));
        }
      }

      if (payload.phase === "error") {
        setIsScanning(false);
        setScanProgress(null);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [addLog, setLibraryStats, setScanProgress, setIsScanning]);

  // ── Listener globale eventi cleaner-progress ──────────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen<CleanerProgress>("cleaner-progress", (event) => {
      const payload = event.payload;
      setCleanerProgress(payload);

      if (payload.phase === "complete") {
        setIsCleanerRunning(false);
        // cleanerProgress viene azzerato da CleanerModule dopo aver letto il risultato
      }

      if (payload.phase === "error") {
        setIsCleanerRunning(false);
        setCleanerProgress(null);
        addLog("error", "Cleaner analysis failed");
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [addLog, setIsCleanerRunning, setCleanerProgress]);

  // ── Listener globale eventi duplicate-progress ────────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen<DuplicateProgress>("duplicate-progress", (event) => {
      const payload = event.payload;
      setDuplicateProgress(payload);

      if (payload.phase === "complete") {
        setIsDuplicateRunning(false);
      }

      if (payload.phase === "error") {
        setIsDuplicateRunning(false);
        setDuplicateProgress(null);
        addLog("error", "Duplicate analysis failed");
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [addLog, setIsDuplicateRunning, setDuplicateProgress]);

  return (
    <MainLayout>
      <AnimatePresence mode="wait">
        {currentModule === "hub"       && <HubModule       key="hub"       />}
        {currentModule === "cleaner"   && <CleanerModule   key="cleaner"   />}
        {currentModule === "conformer" && <ConformerModule key="conformer" />}
        {currentModule === "librarian" && <LibrarianModule key="librarian" />}
        {currentModule === "settings"  && <SettingsModule  key="settings"  />}
      </AnimatePresence>
    </MainLayout>
  );
}
