import { useRef, useEffect } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import type { ModuleId } from '../../store/appStore';
import { TopBar } from './TopBar';
import { LogPanel } from './LogPanel';
import { invoke } from '@tauri-apps/api/core';

interface StageNavItem {
  id: ModuleId;
  stageNum: string;
  label: string;
  sub: string;
  badge?: string;
  badgeColor?: string;
}

export function MainLayout({ children }: { children: React.ReactNode }) {
  const {
    currentModule,
    setModule,
    appVersion,
    isScanning,
    isCleanerRunning,
    isDuplicateRunning,
    nonConformItems,
    duplicateGroups,
    addLog,
  } = useAppStore();

  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [currentModule]);

  const anyTaskRunning = isScanning || isCleanerRunning || isDuplicateRunning;

  const handleGlobalAbort = async () => {
    try {
      if (isScanning) {
        await invoke('abort_task', { taskName: 'scan' });
        addLog('warning', 'Scan aborted via Master Transport bar.');
      }
      if (isCleanerRunning) {
        await invoke('abort_task', { taskName: 'cleaner' });
        addLog('warning', 'Non-conform scan aborted via Master Transport bar.');
      }
      if (isDuplicateRunning) {
        await invoke('abort_task', { taskName: 'duplicates' });
        addLog('warning', 'Duplicates scan aborted via Master Transport bar.');
      }
      await invoke('abort_task', { taskName: 'conformer' });
    } catch (e) {
      addLog('error', 'Global abort command failed', String(e));
    }
  };

  const navStages: StageNavItem[] = [
    {
      id: 'hub',
      stageNum: 'STAGE 01',
      label: 'INGESTION COCKPIT',
      sub: 'Audit & Library Vault',
      badge: isScanning ? 'SCANNING' : 'READY',
      badgeColor: isScanning ? 'bg-industrial-amber text-black animate-pulse' : 'bg-[#1a2234] text-industrial-cyan border border-industrial-cyan/30',
    },
    {
      id: 'cleaner',
      stageNum: 'STAGE 02',
      label: 'THE CLEANER',
      sub: 'Sanitize & Deduplicate',
      badge: nonConformItems.length > 0 || duplicateGroups.length > 0
        ? `${nonConformItems.length + duplicateGroups.length} ISSUES`
        : undefined,
      badgeColor: 'bg-industrial-red/20 text-industrial-red border border-industrial-red/40',
    },
    {
      id: 'conformer',
      stageNum: 'STAGE 03',
      label: 'THE CONFORMER',
      sub: 'EBU R128 Transcoder',
      badge: '-23 LUFS',
      badgeColor: 'bg-industrial-cyan/15 text-industrial-cyan border border-industrial-cyan/30',
    },
    {
      id: 'librarian',
      stageNum: 'STAGE 04',
      label: 'THE LIBRARIAN',
      sub: 'Tag & Artwork Studio',
      badge: 'ID3 SCRUB',
      badgeColor: 'bg-industrial-green/15 text-industrial-green border border-industrial-green/30',
    },
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-industrial-bg text-industrial-text overflow-hidden select-none">
      
      {/* ── 1. Top Master Telemetry Bar ──────────────────────────── */}
      <TopBar />

      {/* ── 2. Middle Body: Signal Chain + Workspace Bay + Telemetry */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Signal Chain Navigator */}
        <aside className="w-64 bg-[#0e1015] border-r border-industrial-border flex flex-col justify-between p-3 select-none shrink-0 z-20">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-industrial-border/60">
              <span className="font-mono text-[9px] uppercase tracking-widest text-industrial-text-dim font-bold">
                SIGNAL CHAIN PIPELINE
              </span>
              <span className="text-[8px] font-mono px-1 py-0.5 bg-industrial-panel text-industrial-cyan rounded border border-industrial-border">
                4 STAGES
              </span>
            </div>

            {navStages.map((stage) => {
              const active = currentModule === stage.id;
              return (
                <button
                  key={stage.id}
                  onClick={() => setModule(stage.id)}
                  className={`w-full text-left p-3 rounded transition-all rack-bevel group border ${
                    active
                      ? 'bg-industrial-surface border-l-4 border-l-industrial-amber border-t-industrial-border-light border-r-industrial-border border-b-industrial-border'
                      : 'bg-industrial-panel/60 border-transparent hover:bg-industrial-surface hover:border-industrial-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-mono text-[9px] font-black uppercase tracking-wider ${active ? 'text-industrial-amber' : 'text-industrial-text-dim group-hover:text-slate-300'}`}>
                      {stage.stageNum}
                    </span>
                    {stage.badge && (
                      <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded font-bold ${stage.badgeColor}`}>
                        {stage.badge}
                      </span>
                    )}
                  </div>
                  <div className={`font-display font-bold text-xs uppercase tracking-tight ${active ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>
                    {stage.label}
                  </div>
                  <div className="text-[9px] font-mono text-industrial-text-dim/70 mt-0.5 truncate">
                    {stage.sub}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Settings & Hardware Diagnostics Tab */}
          <div className="pt-2 border-t border-industrial-border/60">
            <button
              onClick={() => setModule('settings')}
              className={`w-full p-2.5 rounded flex items-center justify-between text-left transition-all border ${
                currentModule === 'settings'
                  ? 'bg-industrial-surface border-industrial-amber text-white font-bold'
                  : 'bg-industrial-panel/50 border-industrial-border/40 text-industrial-text-dim hover:text-white hover:bg-industrial-surface'
              }`}
            >
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-industrial-amber" />
                <span className="font-mono text-[10px] uppercase tracking-wider">
                  SYSTEM &amp; BINARIES
                </span>
              </div>
              <span className="font-mono text-[8px] opacity-60">v{appVersion}</span>
            </button>
          </div>
        </aside>

        {/* Center Main Workstation Bay */}
        <main
          ref={mainRef}
          className="flex-1 bg-industrial-bg p-5 overflow-y-auto custom-scrollbar flex flex-col relative"
        >
          {children}
        </main>

        {/* Right Docked Mission Telemetry Drawer */}
        <LogPanel />

      </div>

      {/* ── 3. Bottom Master Transport & Atomic Control Console ─── */}
      <footer className="h-8 bg-[#0a0b0e] border-t border-industrial-border px-4 flex items-center justify-between text-[9px] font-mono select-none shrink-0 z-40">
        <div className="flex items-center gap-4">
          <span className="text-industrial-text-dim/60 uppercase">CORE ENGINE:</span>
          <span className="text-industrial-green font-bold flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${anyTaskRunning ? 'bg-industrial-amber animate-ping' : 'bg-industrial-green'}`} />
            {anyTaskRunning ? 'PROCESSING PIPELINE WORKLOAD' : 'IDLE // READY FOR DISPATCH'}
          </span>
        </div>

        {/* Abort or Status center */}
        <div className="flex items-center gap-4">
          {anyTaskRunning ? (
            <button
              onClick={handleGlobalAbort}
              className="px-3 py-0.5 bg-industrial-red hover:bg-white text-black font-bold uppercase tracking-widest text-[9px] rounded transition-all animate-pulse flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-black" />
              ABORT RUNNING WORKER
            </button>
          ) : (
            <div className="flex items-center gap-3 text-industrial-text-dim/60">
              <span>SQLITE: WAL ACTIVE</span>
              <span>•</span>
              <span>MEMORY: OPTIMIZED CHUNKS</span>
              <span>•</span>
              <span className="text-industrial-cyan">AIR-GAP CERTIFIED</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-industrial-text-dim/60">
          <span>TAURI 2.0 + RUST</span>
          <span>•</span>
          <span className="text-slate-400">v{appVersion}</span>
        </div>
      </footer>

    </div>
  );
}
