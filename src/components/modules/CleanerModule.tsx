import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { Eraser, Search, AlertTriangle, Video, Skull, FolderOutput } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import type { CleanerResult, QuarantineResult } from '../../store/appStore';

type CleanerStep = 1 | 2 | 3;

// ── Utilità ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Deriva il path ffprobe da quello di ffmpeg (stessa directory, nome diverso). */
function deriveFfprobePath(ffmpegPath: string | null): string | null {
  if (!ffmpegPath) return null;
  // Su Windows: C:\...\ffmpeg.exe → C:\...\ffprobe.exe
  // Su Unix:    /usr/bin/ffmpeg   → /usr/bin/ffprobe
  const isWin = ffmpegPath.toLowerCase().endsWith('.exe');
  const lastSlash = Math.max(
    ffmpegPath.lastIndexOf('/'),
    ffmpegPath.lastIndexOf('\\')
  );
  const dir = lastSlash >= 0 ? ffmpegPath.slice(0, lastSlash + 1) : '';
  return dir + (isWin ? 'ffprobe.exe' : 'ffprobe');
}

// ── Badge ragione ──────────────────────────────────────────────────────────

interface ReasonBadgeProps {
  reason: string;
}

function ReasonBadge({ reason }: ReasonBadgeProps) {
  if (reason === 'youtube_pattern') {
    return (
      <span className="flex items-center gap-1 text-[8px] font-mono font-bold uppercase px-2 py-0.5 bg-industrial-amber/10 text-industrial-amber border border-industrial-amber/30">
        <AlertTriangle className="w-2.5 h-2.5" />
        YouTube
      </span>
    );
  }
  if (reason === 'video_stream') {
    return (
      <span className="flex items-center gap-1 text-[8px] font-mono font-bold uppercase px-2 py-0.5 bg-industrial-cyan/10 text-industrial-cyan border border-industrial-cyan/30">
        <Video className="w-2.5 h-2.5" />
        Video
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[8px] font-mono font-bold uppercase px-2 py-0.5 bg-industrial-red/10 text-industrial-red border border-industrial-red/30">
      <Skull className="w-2.5 h-2.5" />
      Corrupt
    </span>
  );
}

// ── CleanerModule ──────────────────────────────────────────────────────────

export function CleanerModule() {
  const {
    addLog,
    workspacePath,
    systemStatus,
    isCleanerRunning,
    setIsCleanerRunning,
    cleanerProgress,
    setCleanerProgress,
    nonConformItems,
    setNonConformItems,
  } = useAppStore();

  const [step, setStep] = useState<CleanerStep>(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [quarantineResult, setQuarantineResult] = useState<QuarantineResult | null>(null);
  const [totalAnalyzed, setTotalAnalyzed] = useState(0);

  // ffprobe path derivato da ffmpegPath
  const ffprobePath = useMemo(
    () => deriveFfprobePath(systemStatus.ffmpegPath),
    [systemStatus.ffmpegPath]
  );

  const STEPS = [
    { step: 1 as CleanerStep, label: 'SCAN',      desc: 'Non-Conform Detection'  },
    { step: 2 as CleanerStep, label: 'REVIEW',    desc: 'Conflict Analysis'      },
    { step: 3 as CleanerStep, label: 'QUARANTINE', desc: 'Non-Destructive Move'  },
  ];

  // ── Step 1: avvia analisi ────────────────────────────────────────────────

  const handleStartAnalysis = async () => {
    if (isCleanerRunning) return;
    if (!workspacePath) {
      addLog('warning', 'No workspace selected. Select a workspace from the Hub first.');
      return;
    }

    setIsCleanerRunning(true);
    setCleanerProgress(null);
    setNonConformItems([]);
    setSelectedIds(new Set());

    addLog('info', 'The Cleaner: starting non-conform analysis...', workspacePath);

    try {
      const result = await invoke<CleanerResult>('detect_non_conform', {
        ffprobePath: ffprobePath,
      });

      setTotalAnalyzed(result.total_analyzed);
      setNonConformItems(result.items);
      setIsCleanerRunning(false);
      setCleanerProgress(null);

      // Seleziona tutti di default
      setSelectedIds(new Set(result.items.map((i) => i.id)));

      addLog(
        result.non_conform_found > 0 ? 'warning' : 'success',
        `Analysis complete — ${result.non_conform_found} non-conform files found`,
        `${result.total_analyzed.toLocaleString()} tracks analyzed`
      );

      setStep(2);
    } catch (err) {
      setIsCleanerRunning(false);
      setCleanerProgress(null);
      addLog('error', 'Cleaner analysis failed', String(err));
    }
  };

  // ── Step 2: gestione selezione ───────────────────────────────────────────

  const toggleItem = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === nonConformItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(nonConformItems.map((i) => i.id)));
    }
  };

  // ── Step 3: esegui quarantena ────────────────────────────────────────────

  const handleQuarantine = async () => {
    if (!workspacePath) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    addLog('info', `Quarantining ${ids.length} files to _NonConform/...`);

    try {
      const result = await invoke<QuarantineResult>('quarantine_non_conform', {
        workspacePath,
        trackIds: ids,
      });

      setQuarantineResult(result);
      addLog(
        result.failed > 0 ? 'warning' : 'success',
        `Quarantine complete — ${result.moved} moved, ${result.failed} failed`,
        `Destination: ${workspacePath}\\_NonConform\\`
      );
    } catch (err) {
      addLog('error', 'Quarantine failed', String(err));
    }
  };

  const handleReset = () => {
    setStep(1);
    setNonConformItems([]);
    setSelectedIds(new Set());
    setQuarantineResult(null);
    setTotalAnalyzed(0);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const progressPct =
    cleanerProgress && cleanerProgress.total > 0
      ? (cleanerProgress.analyzed / cleanerProgress.total) * 100
      : 0;

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-industrial-amber/10 border border-industrial-amber/30">
              <Eraser className="w-5 h-5 text-industrial-amber" />
            </div>
            <div>
              <h2 className="text-2xl font-black font-sans tracking-tighter uppercase">THE CLEANER</h2>
              <p className="text-[10px] font-mono text-industrial-text-dim uppercase tracking-widest">
                Non-Conform Detection Pipeline v4.0
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-industrial-text-dim uppercase">Status:</span>
            <span className={`text-[10px] font-mono uppercase font-bold ${
              isCleanerRunning
                ? 'text-industrial-amber'
                : step === 1
                  ? 'text-industrial-cyan'
                  : step === 2
                    ? 'text-industrial-amber'
                    : 'text-industrial-red'
            }`}>
              {isCleanerRunning
                ? 'Analyzing...'
                : step === 1
                  ? 'Awaiting Scan'
                  : step === 2
                    ? `${nonConformItems.length} Issues Found`
                    : 'Quarantine Ready'}
            </span>
          </div>
        </div>

        {/* ── 3-Step Pipeline Indicator ──────────────────────── */}
        <div className="grid grid-cols-3 gap-px bg-industrial-border">
          {STEPS.map((s) => (
            <div
              key={s.step}
              className={`p-4 flex flex-col items-center justify-center transition-all ${
                step === s.step
                  ? 'bg-industrial-amber text-black'
                  : step > s.step
                    ? 'bg-industrial-panel text-industrial-cyan'
                    : 'bg-industrial-panel text-industrial-text-dim'
              }`}
            >
              <span className="text-[10px] font-mono font-black mb-1">STEP 0{s.step}</span>
              <span className="text-xs font-black uppercase tracking-widest">{s.label}</span>
              <span className="text-[8px] font-mono uppercase opacity-60">{s.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Step 1: Scan ─────────────────────────────────────── */}
      {step === 1 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-industrial-panel border border-industrial-border p-12 flex flex-col items-center justify-center text-center"
        >
          <div className="w-24 h-24 border-2 border-industrial-amber/20 rounded-full flex items-center justify-center mb-8 relative">
            <motion.div
              animate={{ rotate: isCleanerRunning ? 360 : 0 }}
              transition={{ duration: 2, repeat: isCleanerRunning ? Infinity : 0, ease: 'linear' }}
              className="absolute inset-0 border-t-2 border-industrial-amber rounded-full"
            />
            <Search className="w-10 h-10 text-industrial-amber" />
          </div>

          <h3 className="text-3xl font-black uppercase tracking-tighter mb-4">
            {isCleanerRunning ? 'Analysis In Progress' : 'Initialize Non-Conform Scan'}
          </h3>

          {!isCleanerRunning && (
            <p className="max-w-md text-industrial-text-dim text-sm mb-2 leading-relaxed">
              The engine will scan all indexed tracks for YouTube video-rips, files with embedded
              video streams, and corrupt or zero-duration audio.
            </p>
          )}

          {!isCleanerRunning && !systemStatus.ffmpegFound && (
            <p className="max-w-md text-industrial-amber text-xs mb-4 font-mono">
              FFmpeg not detected — video stream and corruption checks will be skipped.
              Only filename-based pattern matching will run.
            </p>
          )}

          {/* Progress durante analisi */}
          {isCleanerRunning && cleanerProgress && (
            <div className="w-full max-w-md space-y-3 mb-8">
              <div className="flex justify-between font-mono text-[9px] text-industrial-text-dim uppercase">
                <span className="truncate max-w-xs">
                  {cleanerProgress.current_file || 'Analyzing...'}
                </span>
                <span>
                  {cleanerProgress.total > 0
                    ? `${cleanerProgress.analyzed.toLocaleString()} / ${cleanerProgress.total.toLocaleString()}`
                    : '...'}
                </span>
              </div>
              <div className="h-0.5 bg-industrial-border w-full">
                <motion.div
                  className="h-full bg-industrial-amber"
                  animate={{ width: `${progressPct}%` }}
                  transition={{ ease: 'linear', duration: 0.2 }}
                />
              </div>
              <p className="text-[9px] font-mono text-industrial-cyan uppercase">
                {cleanerProgress.found} non-conform detected so far
              </p>
            </div>
          )}

          {!isCleanerRunning && (
            <button
              onClick={handleStartAnalysis}
              disabled={!workspacePath}
              className={`px-12 py-4 font-bold text-xs uppercase tracking-widest transition-all active:scale-95 ${
                workspacePath
                  ? 'bg-industrial-amber text-black hover:bg-white glow-amber'
                  : 'bg-industrial-border text-industrial-text-dim cursor-not-allowed'
              }`}
            >
              {workspacePath ? 'Start Analysis' : 'No Workspace Selected'}
            </button>
          )}
        </motion.div>
      )}

      {/* ── Step 2: Review ───────────────────────────────────── */}
      {step === 2 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          {/* Toolbar */}
          <div className="bg-black p-4 border border-industrial-border flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-mono text-industrial-text-dim uppercase">
                {nonConformItems.length} issues found
              </span>
              <span className="text-[10px] font-mono text-industrial-text-dim uppercase">
                {totalAnalyzed.toLocaleString()} tracks analyzed
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleAll}
                className="text-[9px] font-mono text-industrial-cyan hover:underline uppercase"
              >
                {selectedIds.size === nonConformItems.length ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-industrial-border">|</span>
              <span className="text-[9px] font-mono text-industrial-amber uppercase">
                {selectedIds.size} selected
              </span>
            </div>
          </div>

          {nonConformItems.length === 0 ? (
            <div className="bg-industrial-panel border border-industrial-border p-16 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-industrial-cyan/10 border border-industrial-cyan/30 flex items-center justify-center mb-4">
                <Search className="w-6 h-6 text-industrial-cyan" />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tighter mb-2 text-industrial-cyan">
                Library Is Clean
              </h3>
              <p className="text-industrial-text-dim text-sm max-w-sm">
                No non-conform files detected in {totalAnalyzed.toLocaleString()} analyzed tracks.
              </p>
              <button
                onClick={handleReset}
                className="mt-8 border border-industrial-border text-industrial-text-dim px-8 py-2 font-bold text-xs uppercase tracking-widest hover:border-industrial-amber hover:text-industrial-amber transition-all"
              >
                Back to Scan
              </button>
            </div>
          ) : (
            <>
              {/* Lista non-conform */}
              <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                {nonConformItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={`w-full p-4 border text-left transition-all ${
                      selectedIds.has(item.id)
                        ? 'border-industrial-amber bg-industrial-amber/5'
                        : 'border-industrial-border hover:border-industrial-text-dim/50 bg-industrial-panel'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Checkbox visuale */}
                        <div className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center transition-all ${
                          selectedIds.has(item.id)
                            ? 'border-industrial-amber bg-industrial-amber'
                            : 'border-industrial-border'
                        }`}>
                          {selectedIds.has(item.id) && (
                            <div className="w-2 h-2 bg-black" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-white truncate uppercase tracking-wider">
                            {item.filename}
                          </p>
                          <p className="text-[9px] font-mono text-industrial-text-dim truncate mt-0.5">
                            {item.reason_detail}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-[9px] font-mono text-industrial-text-dim">
                          {formatBytes(item.file_size_bytes)}
                        </span>
                        <ReasonBadge reason={item.reason} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Azione */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleReset}
                  className="text-industrial-text-dim text-[10px] font-mono uppercase hover:text-white transition-all underline underline-offset-4"
                >
                  Re-scan
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={selectedIds.size === 0}
                  className={`flex items-center gap-2 px-8 py-3 font-bold text-xs uppercase tracking-widest transition-all active:scale-95 ${
                    selectedIds.size > 0
                      ? 'bg-industrial-red text-white hover:brightness-110'
                      : 'bg-industrial-border text-industrial-text-dim cursor-not-allowed'
                  }`}
                >
                  <FolderOutput className="w-4 h-4" />
                  Quarantine {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                </button>
              </div>
            </>
          )}
        </motion.div>
      )}

      {/* ── Step 3: Quarantine ───────────────────────────────── */}
      {step === 3 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-industrial-panel border border-industrial-border p-12"
        >
          {quarantineResult === null ? (
            // Conferma pre-quarantena
            <div className="text-center">
              <div className="w-16 h-16 border-2 border-industrial-red/40 rounded-full flex items-center justify-center mx-auto mb-8">
                <FolderOutput className="w-8 h-8 text-industrial-red" />
              </div>
              <h3 className="text-3xl font-black uppercase tracking-tighter mb-4">
                Quarantine Confirmation
              </h3>
              <p className="max-w-md mx-auto text-industrial-text-dim text-sm mb-2 leading-relaxed">
                <span className="text-white font-bold">{selectedIds.size} files</span> will be moved
                to <span className="font-mono text-industrial-cyan">_NonConform/</span> inside your
                workspace. Files are never deleted — this operation is fully reversible.
              </p>
              {workspacePath && (
                <p className="font-mono text-[10px] text-industrial-text-dim mb-8 truncate max-w-lg mx-auto">
                  {workspacePath}\_NonConform\
                </p>
              )}
              <div className="flex items-center justify-center gap-6">
                <button
                  onClick={() => setStep(2)}
                  className="border border-industrial-border text-industrial-text-dim px-8 py-3 font-bold text-xs uppercase tracking-widest hover:border-white hover:text-white transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleQuarantine}
                  className="bg-industrial-red text-white px-12 py-3 font-bold text-xs uppercase tracking-widest hover:brightness-110 transition-all active:scale-95"
                >
                  Execute Quarantine
                </button>
              </div>
            </div>
          ) : (
            // Risultato quarantena
            <div className="text-center">
              <h3 className="text-3xl font-black uppercase tracking-tighter mb-8">
                Quarantine Complete
              </h3>
              <div className="grid grid-cols-2 gap-6 max-w-sm mx-auto mb-12">
                <div className="bg-black border border-industrial-border p-6">
                  <p className="text-[10px] font-mono text-industrial-cyan uppercase mb-1">Moved</p>
                  <p className="text-4xl font-black font-mono text-industrial-cyan">
                    {quarantineResult.moved}
                  </p>
                </div>
                <div className={`bg-black border p-6 ${
                  quarantineResult.failed > 0
                    ? 'border-industrial-red'
                    : 'border-industrial-border'
                }`}>
                  <p className={`text-[10px] font-mono uppercase mb-1 ${
                    quarantineResult.failed > 0
                      ? 'text-industrial-red'
                      : 'text-industrial-text-dim'
                  }`}>Failed</p>
                  <p className={`text-4xl font-black font-mono ${
                    quarantineResult.failed > 0 ? 'text-industrial-red' : 'text-white'
                  }`}>
                    {quarantineResult.failed}
                  </p>
                </div>
              </div>
              <button
                onClick={handleReset}
                className="bg-industrial-amber text-black px-12 py-4 font-bold text-xs uppercase tracking-widest hover:bg-white transition-all active:scale-95"
              >
                New Analysis
              </button>
            </div>
          )}
        </motion.div>
      )}

    </div>
  );
}
