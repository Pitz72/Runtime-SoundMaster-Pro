import { useState } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { HardDrive, Activity, RefreshCw, FolderOpen, ArrowRight, ShieldCheck, Layers } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import type { ScanResult, LibraryStats } from '../../store/appStore';

export function HubModule() {
  const {
    setModule,
    workspacePath,
    setWorkspacePath,
    addLog,
    libraryStats,
    setLibraryStats,
    isScanning,
    setIsScanning,
    scanProgress,
    nonConformItems,
    duplicateGroups,
  } = useAppStore();

  const [lastScanDuration, setLastScanDuration] = useState<number | null>(null);

  const handleSelectWorkspace = async () => {
    if (isScanning) return;
    try {
      addLog('info', 'Opening workspace selection dialog...');
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Seleziona cartella archivio audio (Workspace)',
      });
      if (selected && !Array.isArray(selected)) {
        setWorkspacePath(selected);
        triggerScan(selected);
      }
    } catch (err) {
      addLog('error', 'Workspace selection failed', String(err));
    }
  };

  const triggerScan = async (path: string) => {
    try {
      setIsScanning(true);
      addLog('info', 'Starting rapid library ingestion...', path);
      const startTime = performance.now();
      const result = await invoke<ScanResult>('scan_workspace', { path });
      const duration = (performance.now() - startTime) / 1000;
      setLastScanDuration(duration);

      // Aggiorna le statistiche della libreria
      const stats = await invoke<LibraryStats>('get_library_stats', { workspacePath: path });
      setLibraryStats(stats);

      addLog(
        'success',
        `Scan complete in ${duration.toFixed(2)}s`,
        `${result.total_files.toLocaleString()} audio files indexed into SQLite WAL`
      );
    } catch (err) {
      addLog('error', 'Ingestion scan failed', String(err));
    } finally {
      setIsScanning(false);
    }
  };

  const handleAbortScan = async () => {
    try {
      await invoke('abort_task', { taskName: 'scan' });
      addLog('warning', 'Scan abort requested by operator.');
    } catch (err) {
      addLog('error', 'Failed to request scan abort', String(err));
    }
  };

  // Calcolo metriche di conformità
  const totalTracks = libraryStats?.total_tracks ?? 0;
  const issuesCount = (libraryStats?.non_conform ?? 0) + (libraryStats?.duplicates ?? 0);
  const cleanTracks = Math.max(0, totalTracks - issuesCount);
  const healthPercent = totalTracks > 0 ? Math.round((cleanTracks / totalTracks) * 100) : 100;

  return (
    <div className="space-y-5 select-none">

      {/* ── 1. Top Metrics Strip (Broadcast Rack Gauges) ─────────── */}
      <section className="grid grid-cols-12 gap-4">
        
        {/* Total Vault Index Gauge */}
        <div className="col-span-12 lg:col-span-4 bg-industrial-panel border border-industrial-border p-4 rounded rack-bevel flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-industrial-text-dim font-bold flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-industrial-amber" /> VAULT INDEX VOLUME
            </span>
            <span className={`px-2 py-0.5 font-mono text-[9px] rounded font-bold ${totalTracks > 0 ? 'bg-industrial-amber/15 text-industrial-amber border border-industrial-amber/30' : 'bg-black text-industrial-text-dim'}`}>
              {isScanning ? 'INDEXING...' : totalTracks > 0 ? 'ONLINE' : 'EMPTY'}
            </span>
          </div>

          <div className="my-3 flex items-baseline gap-2">
            <span className="font-mono font-black text-4xl text-white tracking-tight">
              {totalTracks.toLocaleString()}
            </span>
            <span className="font-mono text-xs text-industrial-cyan uppercase font-bold">Tracks</span>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-industrial-text-dim border-t border-industrial-border/60 pt-2">
            <span>Audio stream indexed:</span>
            <span className="text-white font-bold">{totalTracks > 0 ? '100% Parsed' : 'Awaiting Scan'}</span>
          </div>

          <div className="absolute right-[-10px] bottom-[-10px] font-mono text-6xl font-black text-white/5 pointer-events-none select-none">
            01
          </div>
        </div>

        {/* Health Compliance Meter */}
        <div className="col-span-12 lg:col-span-4 bg-industrial-panel border border-industrial-border p-4 rounded rack-bevel flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-industrial-text-dim font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-industrial-green" /> HEALTH COMPLIANCE
            </span>
            <span className="px-2 py-0.5 bg-industrial-green/15 border border-industrial-green/30 text-industrial-green font-mono text-[9px] rounded font-bold">
              {healthPercent}% AUDITED
            </span>
          </div>

          <div className="my-3 flex items-center gap-4">
            <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
              <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
                <path stroke="#1e222d" strokeWidth="3.5" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                <path stroke="#00e676" strokeDasharray={`${healthPercent}, 100`} strokeWidth="3.5" strokeLinecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
              </svg>
              <span className="absolute font-mono text-[10px] font-black text-white">{healthPercent}%</span>
            </div>
            <div className="min-w-0">
              <div className="font-mono text-xs text-white font-bold truncate">
                {cleanTracks.toLocaleString()} Standard Conforming
              </div>
              <div className="font-mono text-[10px] text-industrial-red truncate">
                {issuesCount > 0 ? `${issuesCount.toLocaleString()} Anomalies Detected` : 'Zero anomalies detected'}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-industrial-text-dim border-t border-industrial-border/60 pt-2">
            <span>Airplay Readiness:</span>
            <span className={issuesCount > 0 ? 'text-industrial-amber font-bold' : 'text-industrial-green font-bold'}>
              {issuesCount > 0 ? 'Sanitization Recommended' : 'Optimal Ready'}
            </span>
          </div>
        </div>

        {/* Format Breakdown */}
        <div className="col-span-12 lg:col-span-4 bg-industrial-panel border border-industrial-border p-4 rounded rack-bevel flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-industrial-text-dim font-bold flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-industrial-cyan" /> STORAGE SPECS
            </span>
            <span className="font-mono text-[9px] text-industrial-cyan font-bold">SQLITE WAL</span>
          </div>

          <div className="my-3 space-y-1.5">
            <div className="h-2 w-full bg-black rounded-full overflow-hidden flex">
              <div style={{ width: '60%' }} className="bg-industrial-cyan h-full" title="MP3" />
              <div style={{ width: '25%' }} className="bg-industrial-amber h-full" title="WAV" />
              <div style={{ width: '15%' }} className="bg-industrial-green h-full" title="FLAC / Lossless" />
            </div>
            <div className="grid grid-cols-3 text-center font-mono text-[9px]">
              <span className="text-industrial-cyan">MP3 60%</span>
              <span className="text-industrial-amber">WAV 25%</span>
              <span className="text-industrial-green">FLAC 15%</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-industrial-text-dim border-t border-industrial-border/60 pt-2">
            <span>Chunk Transactions:</span>
            <span className="text-white font-bold">500 Records / Commit</span>
          </div>
        </div>

      </section>

      {/* ── 2. Central Action Console (Ingestion Control Rack) ──── */}
      <section className="bg-industrial-surface border border-industrial-border rounded rack-bevel p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-industrial-border/60 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-industrial-amber/10 border border-industrial-amber/30 rounded">
              <Activity className="w-5 h-5 text-industrial-amber" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-white uppercase tracking-tight">
                INGESTION WORKSPACE CONTROL
              </h2>
              <p className="font-mono text-[10px] text-industrial-text-dim uppercase tracking-widest">
                Rapid Multi-Threaded Scanner // SQLite WAL Atomic Importer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => workspacePath && triggerScan(workspacePath)}
              disabled={isScanning || !workspacePath}
              className={`px-5 py-2.5 font-display font-bold text-xs uppercase tracking-wider rounded transition-all active:scale-95 flex items-center gap-2 ${
                isScanning || !workspacePath
                  ? 'bg-industrial-border text-industrial-text-dim cursor-not-allowed'
                  : 'bg-industrial-amber hover:bg-white text-black glow-amber-led'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              {isScanning ? 'SCANNING...' : workspacePath ? 'RE-SCAN WORKSPACE' : 'SCAN WORKSPACE'}
            </button>

            <button
              onClick={handleSelectWorkspace}
              disabled={isScanning}
              className="px-4 py-2.5 border border-industrial-border hover:border-slate-300 text-slate-300 font-mono text-xs uppercase tracking-wider rounded transition-all flex items-center gap-2"
            >
              <FolderOpen className="w-3.5 h-3.5 text-industrial-cyan" />
              CHANGE DIRECTORY...
            </button>

            {isScanning && (
              <button
                onClick={handleAbortScan}
                className="px-4 py-2.5 border border-industrial-red text-industrial-red hover:bg-industrial-red hover:text-black font-bold text-xs uppercase tracking-widest rounded transition-all animate-pulse flex items-center gap-1.5"
                title="Interrompi scansione"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-industrial-red" />
                ABORT
              </button>
            )}
          </div>
        </div>

        {/* Scan Progress Bar (visibile solo durante isScanning) */}
        {isScanning && scanProgress && (
          <div className="bg-black/60 p-3.5 border border-industrial-amber/40 rounded space-y-2">
            <div className="flex justify-between font-mono text-[9px] uppercase tracking-wider text-industrial-amber">
              <span className="truncate max-w-md font-bold">{scanProgress.current_file || scanProgress.phase}</span>
              <span>
                {scanProgress.total > 0
                  ? `${scanProgress.scanned.toLocaleString()} / ${scanProgress.total.toLocaleString()}`
                  : 'DISCOVERING...'}
              </span>
            </div>
            <div className="h-1.5 bg-industrial-border rounded-full w-full overflow-hidden">
              <motion.div
                className="h-full bg-industrial-amber"
                animate={{
                  width: scanProgress.total > 0
                    ? `${(scanProgress.scanned / scanProgress.total) * 100}%`
                    : '100%',
                }}
                transition={{ ease: 'linear', duration: 0.2 }}
              />
            </div>
          </div>
        )}

        {/* Telemetry info row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-black/50 border border-industrial-border/60 rounded recessed-display text-[10px] font-mono">
          <div>
            <span className="text-industrial-text-dim/70 uppercase block">Active Directory:</span>
            <span className="text-white font-bold truncate block">{workspacePath || 'No folder selected'}</span>
          </div>
          <div>
            <span className="text-industrial-text-dim/70 uppercase block">Scan Speed:</span>
            <span className="text-industrial-cyan font-bold">
              {lastScanDuration ? `${Math.round(totalTracks / lastScanDuration).toLocaleString()} files/sec` : 'Ultra-Fast Rust I/O'}
            </span>
          </div>
          <div>
            <span className="text-industrial-text-dim/70 uppercase block">Concurrency:</span>
            <span className="text-industrial-green font-bold">Zero-Lock WAL Mode</span>
          </div>
          <div>
            <span className="text-industrial-text-dim/70 uppercase block">Safety Mechanism:</span>
            <span className="text-industrial-amber font-bold">Atomic Cancellation Ready</span>
          </div>
        </div>
      </section>

      {/* ── 3. Signal Pipeline Router (Next Action Cards) ────────── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Step 2 Link */}
        <div
          onClick={() => setModule('cleaner')}
          className="bg-industrial-panel border border-industrial-border hover:border-industrial-red p-4 rounded cursor-pointer transition-all hover:bg-industrial-surface flex flex-col justify-between group rack-bevel"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[9px] text-industrial-red font-bold uppercase tracking-wider">PIPELINE STAGE 02</span>
              <span className="w-2 h-2 rounded-full bg-industrial-red" />
            </div>
            <h3 className="font-display font-bold text-white text-base uppercase">THE CLEANER</h3>
            <p className="text-industrial-text-dim text-xs mt-1.5 leading-relaxed">
              Rileva ed elimina rip YouTube, file con flussi video e duplicati audio a 3 stadi (Hash, Metadati, Chromaprint).
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-industrial-border/60 flex items-center justify-between font-mono text-[10px] text-industrial-red">
            <span>{nonConformItems.length > 0 || duplicateGroups.length > 0 ? `${nonConformItems.length + duplicateGroups.length} elementi da verificare` : 'Avvia scansione cleaner'}</span>
            <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Step 3 Link */}
        <div
          onClick={() => setModule('conformer')}
          className="bg-industrial-panel border border-industrial-border hover:border-industrial-cyan p-4 rounded cursor-pointer transition-all hover:bg-industrial-surface flex flex-col justify-between group rack-bevel"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[9px] text-industrial-cyan font-bold uppercase tracking-wider">PIPELINE STAGE 03</span>
              <span className="w-2 h-2 rounded-full bg-industrial-cyan" />
            </div>
            <h3 className="font-display font-bold text-white text-base uppercase">THE CONFORMER</h3>
            <p className="text-industrial-text-dim text-xs mt-1.5 leading-relaxed">
              Standardizzazione radiofonica di massa: normalizzazione Loudness EBU R128 (-23 LUFS / -16 LUFS) e Silent Trim con FFmpeg.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-industrial-border/60 flex items-center justify-between font-mono text-[10px] text-industrial-cyan">
            <span>Preset Radio e Podcast</span>
            <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Step 4 Link */}
        <div
          onClick={() => setModule('librarian')}
          className="bg-industrial-panel border border-industrial-border hover:border-industrial-green p-4 rounded cursor-pointer transition-all hover:bg-industrial-surface flex flex-col justify-between group rack-bevel"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[9px] text-industrial-green font-bold uppercase tracking-wider">PIPELINE STAGE 04</span>
              <span className="w-2 h-2 rounded-full bg-industrial-green" />
            </div>
            <h3 className="font-display font-bold text-white text-base uppercase">THE LIBRARIAN</h3>
            <p className="text-industrial-text-dim text-xs mt-1.5 leading-relaxed">
              Rimozione automatica spam promozionali dai tag ID3, codifica UTF-8, catalogazione FTS5 ed estrazione copertine.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-industrial-border/60 flex items-center justify-between font-mono text-[10px] text-industrial-green">
            <span>Tag &amp; Artwork Studio</span>
            <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

      </section>

    </div>
  );
}
