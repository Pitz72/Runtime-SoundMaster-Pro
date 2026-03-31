/**
 * HubModule.tsx
 * Runtime SoundMaster Pro v0.1.0
 * 
 * Comando centrale: selezione moduli e dashboard di stato
 */

import { motion } from "framer-motion";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../../store/appStore";

// Transizione base del router framer-motion
const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.15 } }
};

export function HubModule() {
  const { setModule, workspacePath, setWorkspacePath, addLog } = useAppStore();

  const handleSelectWorkspace = async () => {
    try {
      addLog("info", "Apertura finestra dialogo selezione workspace...");
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: "Seleziona la cartella della libreria musicale",
      });
      if (selectedPath && !Array.isArray(selectedPath)) {
        setWorkspacePath(selectedPath);
      } else {
        addLog("warning", "Selezione workspace annullata dall'utente.");
      }
    } catch (err) {
      addLog("error", "Errore durante la selezione del workspace", String(err));
    }
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="max-w-5xl mx-auto flex flex-col gap-8 h-full"
    >
      {/* Hero */}
      <section className="flex flex-col gap-1">
        <p className="font-data text-[10px] tracking-[0.3em] uppercase text-[#39FF14]">
          Command Center — Phase 1
        </p>
        <h1 className="font-display text-2xl font-bold tracking-widest uppercase text-[#E8E8E8]">
          The Hub
        </h1>
        <p className="text-sm mt-1 text-[#BACCB0]">
          Seleziona un workspace e un modulo per avviare l'elaborazione.
        </p>
      </section>

      {/* Area Workspace */}
      <section className="bg-[#131313] border border-[#1A1A1A] p-6 flex flex-col gap-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="font-display text-sm tracking-widest uppercase text-[#E8E8E8]">Workspace</h2>
            <p className="text-xs text-[#6B6B6B] mt-1">
              Cartella asoluta contenente la libreria musicale da analizzare
            </p>
          </div>
          <button
            onClick={handleSelectWorkspace}
            className="px-4 py-2 font-display text-[11px] tracking-widest uppercase transition-all
                       bg-[#2A2A2A] hover:bg-[#3A3A3A] text-[#E8E8E8] border border-[#3A3A3A] hover:border-[#6B6B6B]"
          >
            {workspacePath ? "Cambia Cartella" : "Seleziona Cartella..."}
          </button>
        </div>

        {workspacePath ? (
          <div className="border border-[#39FF14]/30 bg-[#39FF14]/5 p-3 flex gap-3 items-center">
            <span className="w-2 h-2 rounded-none bg-[#39FF14] shadow-[0_0_8px_#39FF14]" />
            <span className="font-data text-xs text-[#E8E8E8] truncate" title={workspacePath}>
              {workspacePath}
            </span>
          </div>
        ) : (
          <div className="border border-[#FFB211]/30 bg-[#FFB211]/5 p-3 flex gap-3 items-center">
            <span className="w-2 h-2 rounded-none bg-[#FFB211] shadow-[0_0_8px_#FFB211]" />
            <span className="font-data text-xs text-[#FFB211]">Nessun workspace configurato</span>
          </div>
        )}
      </section>

      {/* Grid Moduli */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Cleaner */}
        <ModuleCard
          code="MOD-A"
          name="The Cleaner"
          description="Deduplicatore intelligente. Quarantena Non-Conformi. Acoustic fingerprinting. Auto-Pick Gold."
          phase="Pronto all'uso"
          ready={!!workspacePath}
          onClick={() => setModule("cleaner")}
        />
        {/* Conformer */}
        <ModuleCard
          code="MOD-B"
          name="The Conformer"
          description="Standardizzatore universale. 6 preset audio. EBU R128. Silent Trimming. Conversione."
          phase="Pronto all'uso"
          ready={!!workspacePath}
          onClick={() => setModule("conformer")}
        />
        {/* Librarian */}
        <ModuleCard
          code="MOD-C"
          name="The Librarian"
          description="Gestione metadati ID3. Cover Art massiva. Catalogo SQLite FTS5 per 500k+ brani."
          phase="Pronto all'uso"
          ready={!!workspacePath}
          onClick={() => setModule("librarian")}
        />
      </section>

    </motion.div>
  );
}

// Sostituisco il vecchio componente ModuleCard per abilitarvi il click col router interno
function ModuleCard({
  code,
  name,
  description,
  phase,
  ready = false,
  onClick,
}: {
  code: string;
  name: string;
  description: string;
  phase: string;
  ready?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className="relative flex flex-col gap-3 p-5 h-full transition-colors duration-250 cursor-pointer"
      style={{
        background: '#1A1A1A',
        border: `1px solid ${ready ? '#39FF14' : '#2A2A2A'}`,
      }}
      onClick={() => ready && onClick()}
      onMouseEnter={(e) => {
        if (ready) {
          (e.currentTarget as HTMLElement).style.background = '#201F1F';
          (e.currentTarget as HTMLElement).style.boxShadow = '0 0 15px rgba(57,255,20,0.1)';
        } else {
          (e.currentTarget as HTMLElement).style.borderColor = '#6B6B6B';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = '#1A1A1A';
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        if (!ready) {
          (e.currentTarget as HTMLElement).style.borderColor = '#2A2A2A';
        }
      }}
    >
      <div
        className="absolute top-0 left-0 w-2 h-2"
        style={{ background: ready ? '#39FF14' : '#2A2A2A' }}
      />
      <div className="flex items-center justify-between">
        <div>
          <span className="font-data text-[10px] tracking-[0.2em] uppercase text-[#6B6B6B]">
            {code}
          </span>
          <h2 className={`font-display text-sm font-bold tracking-widest mt-0.5 ${ready ? 'text-[#39FF14]' : 'text-[#E8E8E8]'}`}>
            {name}
          </h2>
        </div>
        <span
          className="font-data text-[10px] px-2 py-0.5 uppercase tracking-widest"
          style={{
            background: ready ? 'rgba(57,255,20,0.08)' : 'rgba(107,107,107,0.15)',
            color: ready ? '#39FF14' : '#6B6B6B',
          }}
        >
          {ready ? 'READY' : phase}
        </span>
      </div>
      <p className="text-[12px] leading-relaxed text-[#BACCB0] flex-1">
        {description}
      </p>
      <button
        disabled={!ready}
        className="w-full py-2 mt-4 font-display text-[11px] tracking-widest uppercase transition-all"
        style={{
          background: ready ? 'rgba(57,255,20,0.08)' : 'transparent',
          border: `1px solid ${ready ? '#39FF14' : '#2A2A2A'}`,
          color: ready ? '#39FF14' : '#3A3A3A',
          cursor: ready ? 'pointer' : 'not-allowed',
        }}
      >
        {ready ? 'Launch Module' : 'Workspace richiesto'}
      </button>
    </div>
  );
}
