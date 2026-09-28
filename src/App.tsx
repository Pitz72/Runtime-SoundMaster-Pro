import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
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

interface TauriFfprobeInfo {
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
    setAppVersion,
  } = useAppStore();

  // ── Inizializzazione Tauri ─────────────────────────────────────────────────
  useEffect(() => {
    if (systemStatus.initialized) return;

    const init = async () => {
      addLog("info", "System initialization in progress...");
      try {
        // Legge la versione app dal manifesto Tauri (evita hardcoded nei componenti)
        const version = await getVersion();
        setAppVersion(version);

        let [db, ffmpeg, ffprobe, fpcalc] = await Promise.all([
          invoke<string>("db_status"),
          invoke<TauriFfmpegInfo>("detect_ffmpeg_cmd"),
          invoke<TauriFfprobeInfo>("detect_ffprobe_cmd"),
          invoke<TauriFpcalcInfo>("detect_fpcalc_cmd"),
        ]);

        // Priorità configurazione personalizzata (CRIT-09 Resolved)
        const customFfmpeg = localStorage.getItem('custom_ffmpeg_path');
        if (customFfmpeg) {
          const testRes = await invoke<TauriFfmpegInfo>("test_custom_ffmpeg", { path: customFfmpeg });
          if (testRes.found) ffmpeg = testRes;
        }
        const customFfprobe = localStorage.getItem('custom_ffprobe_path');
        if (customFfprobe) {
          const testRes = await invoke<TauriFfprobeInfo>("test_custom_ffprobe", { path: customFfprobe });
          if (testRes.found) ffprobe = testRes;
        }
        const customFpcalc = localStorage.getItem('custom_fpcalc_path');
        if (customFpcalc) {
          const testRes = await invoke<TauriFpcalcInfo>("test_custom_fpcalc", { path: customFpcalc });
          if (testRes.found) fpcalc = testRes;
        }

        setSystemStatus({
          db,
          ffmpegFound: ffmpeg.found,
          ffmpegPath: ffmpeg.path,
          ffmpegVersion: ffmpeg.version,
          ffmpegSource: ffmpeg.source,
          ffprobeFound: ffprobe.found,
          ffprobePath: ffprobe.path,
          ffprobeVersion: ffprobe.version,
          ffprobeSource: ffprobe.source,
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

        if (ffprobe.found)
          addLog("success", `FFprobe [${ffprobe.source}]`, ffprobe.version ?? undefined);
        else
          addLog(
            "warning",
            "FFprobe not detected. Video-stream & corrupt checks will be skipped."
          );

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
  }, [systemStatus.initialized, setSystemStatus, addLog, setLibraryStats, setAppVersion]);

  // ── Listener globale eventi scan-progress ─────────────────────────────────
  // Registrato una sola volta al mount — gestisce progress e refresh stats
  // al termine di ogni scansione workspace.
  //
  // Pattern cleanup (fix v0.5.16 — criticità 19): se il componente smonta
  // prima che la promise di listen() risolva, la vecchia closure non chiamava
  // mai unlisten → listener duplicati (visibile in dev con StrictMode).
  // Il flag `disposed` garantisce l'unregister anche in quel caso.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    listen<ScanProgress>("scan-progress", async (event) => {
      const payload = event.payload;
      setScanProgress(payload);

      if (payload.phase === "complete") {
        setIsScanning(false);
        setScanProgress(null);
        // Aggiorna le statistiche con i dati reali post-scansione.
        // Il log di completamento è emesso dal modulo che ha avviato la
        // scansione (fix v0.5.16 — criticità 24: doppio log rimosso).
        try {
          const stats = await invoke<LibraryStats>("get_library_stats");
          setLibraryStats(stats);
        } catch (err) {
          addLog("error", "Failed to refresh library stats", String(err));
        }
      }

      if (payload.phase === "error") {
        setIsScanning(false);
        setScanProgress(null);
        addLog("error", "Workspace scan failed", payload.current_file || undefined);
      }
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [addLog, setLibraryStats, setScanProgress, setIsScanning]);

  // ── Listener globale eventi cleaner-progress ──────────────────────────────
  useEffect(() => {
    let disposed = false;
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
      if (disposed) fn();
      else unlisten = fn;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [addLog, setIsCleanerRunning, setCleanerProgress]);

  // ── Listener globale eventi duplicate-progress ────────────────────────────
  useEffect(() => {
    let disposed = false;
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
      if (disposed) fn();
      else unlisten = fn;
    });

    return () => {
      disposed = true;
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
