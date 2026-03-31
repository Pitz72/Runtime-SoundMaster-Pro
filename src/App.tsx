import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence } from "framer-motion";

import { useAppStore } from "./store/appStore";
import { MainLayout } from "./components/layout/MainLayout";
import { HubModule } from "./components/modules/HubModule";
import { CleanerModule } from "./components/modules/CleanerModule";
import { ConformerModule } from "./components/modules/ConformerModule";
import { LibrarianModule } from "./components/modules/LibrarianModule";

// Tipi duplicati per il parsing dell'init Tauri
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
  const { currentModule, setSystemStatus, systemStatus, addLog } = useAppStore();

  useEffect(() => {
    // Evita loop di inizializzazione
    if (systemStatus.initialized) return;

    const init = async () => {
      addLog("info", "Inizializzazione sistema in corso...");
      try {
        const [db, ffmpeg, fpcalc] = await Promise.all([
          invoke<string>("db_status"),
          invoke<TauriFfmpegInfo>("detect_ffmpeg_cmd"),
          invoke<TauriFpcalcInfo>("detect_fpcalc_cmd"),
        ]);
        
        setSystemStatus({
          db,
          ffmpegFound: ffmpeg.found,
          ffmpegVersion: ffmpeg.version,
          ffmpegSource: ffmpeg.source,
          fpcalcFound: fpcalc.found,
          fpcalcVersion: fpcalc.version,
          fpcalcSource: fpcalc.source,
          initialized: true,
        });

        addLog("success", "Sistema caricato", db);
        if (ffmpeg.found) addLog("success", `FFmpeg [${ffmpeg.source}]`, ffmpeg.version || undefined);
        else addLog("error", "FFmpeg non rilevato. Necessario per The Conformer");

        if (fpcalc.found) addLog("success", `fpcalc [${fpcalc.source}]`, fpcalc.version || undefined);
        else addLog("warning", "fpcalc non rilevato. Nessun acoustic fingerprinting per The Cleaner");

      } catch (err) {
        setSystemStatus({ initialized: true });
        addLog("error", "Errore critico di inizializzazione", String(err));
      }
    };
    init();
  }, [systemStatus.initialized, setSystemStatus, addLog]);

  return (
    <MainLayout>
      {/* Route Animato Interno */}
      <AnimatePresence mode="wait">
        {currentModule === "hub" && <HubModule key="hub" />}
        {currentModule === "cleaner" && <CleanerModule key="cleaner" />}
        {currentModule === "conformer" && <ConformerModule key="conformer" />}
        {currentModule === "librarian" && <LibrarianModule key="librarian" />}
      </AnimatePresence>
    </MainLayout>
  );
}

