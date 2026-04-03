import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Activity, Eraser, Settings2, Library } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import type { ModuleId, ScanResult } from '../../store/appStore';

// ── ModuleCard ────────────────────────────────────────────────────────────────
// Banner CSS offline: gradient + icona centrata. Nessuna dipendenza da rete.

interface ModuleCardProps {
  title: string;
  description: string;
  icon: React.ElementType;
  accentClass: string; // colore del gradient banner
  onClick: () => void;
}

function ModuleCard({ title, description, icon: Icon, accentClass, onClick }: ModuleCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-industrial-panel border border-industrial-border group hover:border-industrial-amber transition-all duration-300 cursor-pointer"
    >
      {/* Banner CSS — nessuna risorsa esterna */}
      <div className={`h-40 relative overflow-hidden flex items-center justify-center ${accentClass}`}>
        <Icon className="w-20 h-20 text-white/5 group-hover:text-white/10 transition-colors duration-500 transform group-hover:scale-110 transition-transform duration-700" />
        <div className="absolute inset-0 bg-gradient-to-t from-industrial-panel/80 to-transparent" />
        <Icon className="absolute bottom-4 right-4 w-6 h-6 text-industrial-amber/30 group-hover:text-industrial-amber transition-colors duration-300" />
      </div>
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-2xl font-black font-sans tracking-tighter uppercase">{title}</h3>
          <Icon className="w-6 h-6 text-industrial-amber" />
        </div>
        <p className="text-industrial-text-dim text-sm mb-6 leading-relaxed h-12 overflow-hidden">
          {description}
        </p>
        <button className="w-full border-2 border-industrial-amber text-industrial-amber py-2 font-bold text-xs uppercase tracking-widest hover:bg-industrial-amber hover:text-black transition-all active:scale-95">
          Launch Module
        </button>
      </div>
    </div>
  );
}

// ── HubModule ─────────────────────────────────────────────────────────────────

const MODULES: { id: ModuleId; title: string; description: string; icon: React.ElementType; accentClass: string }[] = [
  {
    id: 'cleaner',
    title: 'The Cleaner',
    description: 'Acoustic fingerprinting, binary matching and library sanitization pipeline.',
    icon: Eraser,
    accentClass: 'bg-gradient-to-br from-industrial-panel via-industrial-border/30 to-industrial-cyan/10',
  },
  {
    id: 'conformer',
    title: 'The Conformer',
    description: 'Mass standardization: EBU R128, silent trimming and radio output presets.',
    icon: Settings2,
    accentClass: 'bg-gradient-to-br from-industrial-panel via-industrial-border/30 to-industrial-amber/10',
  },
  {
    id: 'librarian',
    title: 'The Librarian',
    description: 'ID3 metadata scrubbing, artwork embedding and SQLite catalog for 500k+ tracks.',
    icon: Library,
    accentClass: 'bg-gradient-to-br from-industrial-panel via-industrial-border/30 to-industrial-red/10',
  },
];

export function HubModule() {
  const {
    setModule,
    workspacePath,
    setWorkspacePath,
    addLog,
    libraryStats,
    isScanning,
    setIsScanning,
    scanProgress,
  } = useAppStore();
  const [uptime, setUptime] = useState('000:00:00');

  // Uptime ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setUptime((prev) => {
        const [h, m, s] = prev.split(':').map(Number);
        let ns = s + 1, nm = m, nh = h;
        if (ns >= 60) { ns = 0; nm += 1; }
        if (nm >= 60) { nm = 0; nh += 1; }
        return `${nh.toString().padStart(3, '0')}:${nm.toString().padStart(2, '0')}:${ns.toString().padStart(2, '0')}`;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectWorkspace = async () => {
    if (isScanning) return;
    try {
      addLog('info', 'Opening workspace selection dialog...');
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select your audio library folder',
      });
      if (selected && !Array.isArray(selected)) {
        setWorkspacePath(selected);
        // Avvia la scansione subito dopo la selezione
        setIsScanning(true);
        addLog('info', 'Starting library scan...', selected);
        const result = await invoke<ScanResult>('scan_workspace', { path: selected });
        addLog(
          'success',
          `Scan finished in ${result.duration_secs.toFixed(1)}s`,
          `${result.total_files.toLocaleString()} files indexed`
        );
      } else {
        addLog('warning', 'Workspace selection cancelled.');
      }
    } catch (err) {
      setIsScanning(false);
      addLog('error', 'Workspace scan failed', String(err));
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-12 bg-industrial-panel relative overflow-hidden p-8 border-l-8 border-industrial-cyan glow-cyan"
        >
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 bg-industrial-cyan animate-pulse" />
              <span className="font-mono text-[10px] text-industrial-cyan tracking-[0.2em] uppercase">
                Kernel v2.0.4-LTS // SQLite WAL ACTIVE
              </span>
            </div>
            <h2 className="text-6xl font-black font-sans tracking-tighter uppercase mb-4 leading-none">
              COMMAND <span className="text-industrial-cyan">CENTER</span>
            </h2>
            <p className="max-w-xl text-industrial-text-dim font-display text-lg leading-tight">
              Universal Radio Sanitizer. Clean, conform, and organize your library for professional broadcasting.
            </p>

            {/* Workspace selector + stato scan */}
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleSelectWorkspace}
                  disabled={isScanning}
                  className={`px-5 py-2 border font-bold text-xs uppercase tracking-widest transition-all active:scale-95 ${
                    isScanning
                      ? 'border-industrial-border text-industrial-text-dim cursor-not-allowed'
                      : 'border-industrial-amber text-industrial-amber hover:bg-industrial-amber hover:text-black'
                  }`}
                >
                  {isScanning ? 'Scanning...' : workspacePath ? 'Rescan / Change' : 'Select Workspace...'}
                </button>
                {workspacePath && !isScanning && (
                  <span className="font-mono text-[10px] text-industrial-cyan truncate max-w-sm">
                    {workspacePath}
                  </span>
                )}
              </div>

              {/* Barra di progresso scansione — visibile solo durante isScanning */}
              {isScanning && scanProgress && (
                <div className="space-y-1 max-w-lg">
                  <div className="flex justify-between font-mono text-[9px] text-industrial-text-dim uppercase">
                    <span className="truncate max-w-xs">{scanProgress.current_file || scanProgress.phase}</span>
                    <span>
                      {scanProgress.total > 0
                        ? `${scanProgress.scanned.toLocaleString()} / ${scanProgress.total.toLocaleString()}`
                        : 'Discovering...'}
                    </span>
                  </div>
                  <div className="h-0.5 bg-industrial-border w-full">
                    <motion.div
                      className="h-full bg-industrial-amber"
                      animate={{
                        width: scanProgress.total > 0
                          ? `${(scanProgress.scanned / scanProgress.total) * 100}%`
                          : '100%',
                      }}
                      transition={{ ease: 'linear', duration: 0.3 }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <Activity className="absolute right-[-20px] bottom-[-20px] w-64 h-64 text-industrial-text-dim/5 pointer-events-none" />
        </motion.div>
      </section>

      {/* ── Module Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {MODULES.map((mod) => (
          <ModuleCard
            key={mod.id}
            title={mod.title}
            description={mod.description}
            icon={mod.icon}
            accentClass={mod.accentClass}
            onClick={() => setModule(mod.id)}
          />
        ))}
      </div>

      {/* ── Stats Grid ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-industrial-panel p-6 border border-industrial-border">
          <p className="font-mono text-[10px] text-industrial-text-dim uppercase mb-1">Total Assets</p>
          <p className="text-3xl font-black font-mono">
            {libraryStats !== null ? libraryStats.total_tracks.toLocaleString() : '—'}
          </p>
        </div>
        <div className="bg-industrial-panel p-6 border border-industrial-border border-l-4 border-l-industrial-amber">
          <p className="font-mono text-[10px] text-industrial-amber uppercase mb-1">Duplicates Detected</p>
          <p className="text-3xl font-black font-mono text-industrial-amber">
            {libraryStats !== null ? libraryStats.duplicates.toLocaleString() : '—'}
          </p>
        </div>
        <div className="bg-industrial-panel p-6 border border-industrial-border border-l-4 border-l-industrial-red">
          <p className="font-mono text-[10px] text-industrial-red uppercase mb-1">Anomalies Detected</p>
          <p className="text-3xl font-black font-mono text-industrial-red">
            {libraryStats !== null ? libraryStats.non_conform.toLocaleString() : '—'}
          </p>
        </div>
        <div className="bg-industrial-panel p-6 border border-industrial-border">
          <p className="font-mono text-[10px] text-industrial-text-dim uppercase mb-1">System Uptime</p>
          <p className="text-xl font-bold font-mono mt-2">{uptime}</p>
        </div>
      </div>
    </div>
  );
}
