import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Eraser, Search, AlertTriangle, Video, Skull, FolderOutput,
  Copy, CheckCircle, Music, Cpu, FolderOpen, FolderInput,
} from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import type {
  CleanerResult, QuarantineResult, ScanResult,
  DuplicateDetectResult, DuplicateGroup, DuplicateResolveResult,
} from '../../store/appStore';

// ── Tipi locali ────────────────────────────────────────────────────────────

type CleanerMode = 'nonconform' | 'duplicates';
type CleanerStep = 1 | 2 | 3;

// ── Utilità ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(secs: number | null): string {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function deriveFfprobePath(ffmpegPath: string | null): string | null {
  if (!ffmpegPath) return null;
  const isWin = ffmpegPath.toLowerCase().endsWith('.exe');
  const lastSlash = Math.max(ffmpegPath.lastIndexOf('/'), ffmpegPath.lastIndexOf('\\'));
  const dir = lastSlash >= 0 ? ffmpegPath.slice(0, lastSlash + 1) : '';
  return dir + (isWin ? 'ffprobe.exe' : 'ffprobe');
}

// ── Badge ragione non-conform ──────────────────────────────────────────────

function ReasonBadge({ reason }: { reason: string }) {
  if (reason === 'youtube_pattern') {
    return (
      <span className="flex items-center gap-1 text-[8px] font-mono font-bold uppercase px-2 py-0.5 bg-industrial-amber/10 text-industrial-amber border border-industrial-amber/30">
        <AlertTriangle className="w-2.5 h-2.5" />YouTube
      </span>
    );
  }
  if (reason === 'video_stream') {
    return (
      <span className="flex items-center gap-1 text-[8px] font-mono font-bold uppercase px-2 py-0.5 bg-industrial-cyan/10 text-industrial-cyan border border-industrial-cyan/30">
        <Video className="w-2.5 h-2.5" />Video
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[8px] font-mono font-bold uppercase px-2 py-0.5 bg-industrial-red/10 text-industrial-red border border-industrial-red/30">
      <Skull className="w-2.5 h-2.5" />Corrupt
    </span>
  );
}

// ── Badge tipo match duplicato ─────────────────────────────────────────────

function MatchBadge({ matchType, score }: { matchType: string; score: number }) {
  if (matchType === 'binary_hash') {
    return (
      <span className="flex items-center gap-1 text-[8px] font-mono font-bold uppercase px-2 py-0.5 bg-industrial-red/10 text-industrial-red border border-industrial-red/30">
        <Copy className="w-2.5 h-2.5" />BINARY {score}%
      </span>
    );
  }
  if (matchType === 'acoustic') {
    return (
      <span className="flex items-center gap-1 text-[8px] font-mono font-bold uppercase px-2 py-0.5 bg-industrial-cyan/10 text-industrial-cyan border border-industrial-cyan/30">
        <Music className="w-2.5 h-2.5" />ACOUSTIC {score}%
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[8px] font-mono font-bold uppercase px-2 py-0.5 bg-industrial-amber/10 text-industrial-amber border border-industrial-amber/30">
      <Cpu className="w-2.5 h-2.5" />METADATA {score}%
    </span>
  );
}

// ── ProgressBar condivisa ──────────────────────────────────────────────────

function ProgressBar({ processed, total, label }: { processed: number; total: number; label: string }) {
  const pct = total > 0 ? (processed / total) * 100 : 0;
  return (
    <div className="w-full max-w-md space-y-2">
      <div className="flex justify-between font-mono text-[9px] text-industrial-text-dim uppercase">
        <span className="truncate max-w-xs">{label}</span>
        <span>{total > 0 ? `${processed.toLocaleString()} / ${total.toLocaleString()}` : '...'}</span>
      </div>
      <div className="h-0.5 bg-industrial-border w-full">
        <motion.div
          className="h-full bg-industrial-amber"
          animate={{ width: `${pct}%` }}
          transition={{ ease: 'linear', duration: 0.2 }}
        />
      </div>
    </div>
  );
}

// ── CleanerModule ──────────────────────────────────────────────────────────

export function CleanerModule() {
  const {
    addLog, workspacePath, setWorkspacePath, systemStatus,
    isScanning, setIsScanning,
    isCleanerRunning, setIsCleanerRunning, cleanerProgress, setCleanerProgress,
    nonConformItems, setNonConformItems,
    isDuplicateRunning, setIsDuplicateRunning, duplicateProgress, setDuplicateProgress,
    duplicateGroups, setDuplicateGroups,
    setLibraryStats,
  } = useAppStore();

  const [mode, setMode] = useState<CleanerMode>('nonconform');

  // Destinazioni quarantena — default derivato da workspace, sovrascrivibile
  const [customNcDest, setCustomNcDest] = useState<string | null>(null);
  const [customDupDest, setCustomDupDest] = useState<string | null>(null);

  // ── Non-Conform state ──
  const [ncStep, setNcStep] = useState<CleanerStep>(1);
  const [ncSelectedIds, setNcSelectedIds] = useState<Set<number>>(new Set());
  const [ncQuarantineResult, setNcQuarantineResult] = useState<QuarantineResult | null>(null);
  const [ncTotalAnalyzed, setNcTotalAnalyzed] = useState(0);

  // ── Duplicates state ──
  const [dupStep, setDupStep] = useState<CleanerStep>(1);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  // overrides: { group_id → keep_id } — per default è best_pick_id
  const [keepOverrides, setKeepOverrides] = useState<Record<string, number>>({});
  const [dupResolveResult, setDupResolveResult] = useState<DuplicateResolveResult | null>(null);

  const ffprobePath = useMemo(() => deriveFfprobePath(systemStatus.ffmpegPath), [systemStatus.ffmpegPath]);
  const fpcalcPath = systemStatus.fpcalcPath;

  // Path destinazione effettivi
  const ncDestPath = customNcDest ?? (workspacePath ? `${workspacePath}\\_NonConform` : null);
  const dupDestPath = customDupDest ?? (workspacePath ? `${workspacePath}\\_Duplicates` : null);

  // ── Workspace select + scan ────────────────────────────────────────────
  const handleSelectWorkspace = async () => {
    if (isScanning) return;
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select your audio library folder',
      });
      if (selected && !Array.isArray(selected)) {
        setWorkspacePath(selected);
        setCustomNcDest(null);  // reset destinazioni custom al cambio workspace
        setCustomDupDest(null);
        setIsScanning(true);
        addLog('info', 'Starting library scan...', selected);
        const result = await invoke<ScanResult>('scan_workspace', { path: selected });
        addLog(
          'success',
          `Scan finished in ${result.duration_secs.toFixed(1)}s`,
          `${result.total_files.toLocaleString()} files indexed`
        );
        const stats = await invoke('get_library_stats');
        setLibraryStats(stats as any);
      }
    } catch (err) {
      setIsScanning(false);
      addLog('error', 'Workspace scan failed', String(err));
    }
  };

  const handleBrowseNcDest = async () => {
    const selected = await open({ directory: true, multiple: false, title: 'Select Non-Conform destination folder' });
    if (selected && !Array.isArray(selected)) setCustomNcDest(selected);
  };

  const handleBrowseDupDest = async () => {
    const selected = await open({ directory: true, multiple: false, title: 'Select Duplicates destination folder' });
    if (selected && !Array.isArray(selected)) setCustomDupDest(selected);
  };

  const selectedGroup = duplicateGroups.find(g => g.group_id === selectedGroupId) ?? null;

  const STEPS_NC = [
    { step: 1 as CleanerStep, label: 'SCAN',       desc: 'Pattern Detection'    },
    { step: 2 as CleanerStep, label: 'REVIEW',     desc: 'Conflict Analysis'    },
    { step: 3 as CleanerStep, label: 'QUARANTINE', desc: 'Non-Destructive Move' },
  ];
  const STEPS_DUP = [
    { step: 1 as CleanerStep, label: 'SCAN',    desc: 'Fingerprinting'   },
    { step: 2 as CleanerStep, label: 'REVIEW',  desc: 'Duplicate Groups' },
    { step: 3 as CleanerStep, label: 'RESOLVE', desc: 'Best-Pick Move'   },
  ];

  const currentStep = mode === 'nonconform' ? ncStep : dupStep;
  const stepsConfig = mode === 'nonconform' ? STEPS_NC : STEPS_DUP;

  // ── Non-Conform handlers ───────────────────────────────────────────────

  const handleNcStart = async () => {
    if (isCleanerRunning || !workspacePath) return;
    setIsCleanerRunning(true);
    setCleanerProgress(null);
    setNonConformItems([]);
    setNcSelectedIds(new Set());
    setNcQuarantineResult(null);
    addLog('info', 'The Cleaner: starting non-conform analysis...', workspacePath);
    try {
      const result = await invoke<CleanerResult>('detect_non_conform', { ffprobePath });
      setNcTotalAnalyzed(result.total_analyzed);
      setNonConformItems(result.items);
      setIsCleanerRunning(false);
      setCleanerProgress(null);
      setNcSelectedIds(new Set(result.items.map(i => i.id)));
      addLog(
        result.non_conform_found > 0 ? 'warning' : 'success',
        `Analysis complete — ${result.non_conform_found} non-conform files found`,
        `${result.total_analyzed.toLocaleString()} tracks analyzed`
      );
      setNcStep(2);
    } catch (err) {
      setIsCleanerRunning(false);
      setCleanerProgress(null);
      addLog('error', 'Cleaner analysis failed', String(err));
    }
  };

  const toggleNcItem = (id: number) => {
    setNcSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleNcAll = () => {
    setNcSelectedIds(ncSelectedIds.size === nonConformItems.length
      ? new Set()
      : new Set(nonConformItems.map(i => i.id)));
  };

  const handleNcQuarantine = async () => {
    if (!workspacePath) return;
    const ids = Array.from(ncSelectedIds);
    if (ids.length === 0) return;
    addLog('info', `Quarantining ${ids.length} files to _NonConform/...`);
    try {
      const result = await invoke<QuarantineResult>('quarantine_non_conform', {
        workspacePath,
        trackIds: ids,
        quarantinePath: customNcDest ?? null,
      });
      setNcQuarantineResult(result);
      // Refresh stats hub
      const { invoke: inv } = await import('@tauri-apps/api/core');
      try {
        const stats = await inv('get_library_stats');
        setLibraryStats(stats as any);
      } catch { /* non bloccante */ }
      addLog(
        result.failed > 0 ? 'warning' : 'success',
        `Quarantine complete — ${result.moved} moved, ${result.failed} failed`
      );
    } catch (err) {
      addLog('error', 'Quarantine failed', String(err));
    }
  };

  const handleNcReset = () => {
    setNcStep(1); setNonConformItems([]); setNcSelectedIds(new Set());
    setNcQuarantineResult(null); setNcTotalAnalyzed(0);
  };

  // ── Duplicate handlers ─────────────────────────────────────────────────

  const handleDupStart = async () => {
    if (isDuplicateRunning || !workspacePath) return;
    setIsDuplicateRunning(true);
    setDuplicateProgress(null);
    setDuplicateGroups([]);
    setKeepOverrides({});
    setDupResolveResult(null);
    setSelectedGroupId(null);
    addLog('info', 'The Cleaner: starting duplicate analysis...', workspacePath);
    try {
      const result = await invoke<DuplicateDetectResult>('detect_duplicates', {
        fpcalcPath: fpcalcPath ?? null,
      });
      setDuplicateGroups(result.groups);
      setIsDuplicateRunning(false);
      setDuplicateProgress(null);
      if (result.groups.length > 0) setSelectedGroupId(result.groups[0].group_id);
      addLog(
        result.groups_found > 0 ? 'warning' : 'success',
        `Duplicate analysis complete — ${result.groups_found} groups found`,
        `${result.total_processed.toLocaleString()} tracks processed`
      );
      setDupStep(2);
    } catch (err) {
      setIsDuplicateRunning(false);
      setDuplicateProgress(null);
      addLog('error', 'Duplicate analysis failed', String(err));
    }
  };

  const getKeepId = (group: DuplicateGroup): number =>
    keepOverrides[group.group_id] ?? group.best_pick_id;

  const setKeepId = (groupId: string, fileId: number) => {
    setKeepOverrides(prev => ({ ...prev, [groupId]: fileId }));
  };

  const handleDupResolve = async () => {
    if (!workspacePath || duplicateGroups.length === 0) return;
    const resolutions: [number, number[]][] = duplicateGroups.map(g => {
      const keepId = getKeepId(g);
      const loserIds = g.files.filter(f => f.id !== keepId).map(f => f.id);
      return [keepId, loserIds];
    });
    addLog('info', `Resolving ${duplicateGroups.length} duplicate groups...`);
    try {
      const result = await invoke<DuplicateResolveResult>('resolve_duplicates', {
        workspacePath,
        resolutions,
        quarantinePath: customDupDest ?? null,
      });
      setDupResolveResult(result);
      const { invoke: inv } = await import('@tauri-apps/api/core');
      try {
        const stats = await inv('get_library_stats');
        setLibraryStats(stats as any);
      } catch { /* non bloccante */ }
      addLog(
        result.failed > 0 ? 'warning' : 'success',
        `Resolve complete — ${result.moved} moved, ${result.failed} failed`
      );
    } catch (err) {
      addLog('error', 'Resolve failed', String(err));
    }
  };

  const handleDupReset = () => {
    setDupStep(1); setDuplicateGroups([]); setKeepOverrides({});
    setDupResolveResult(null); setSelectedGroupId(null);
  };

  // ── Render helpers ─────────────────────────────────────────────────────

  // ── Render ─────────────────────────────────────────────────────────────

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
                Sanitization Pipeline v5.0
              </p>
            </div>
          </div>

          {/* Mode switcher */}
          <div className="flex items-center gap-px bg-industrial-border p-px">
            <button
              onClick={() => setMode('nonconform')}
              className={`px-5 py-2 text-[10px] font-mono font-bold uppercase tracking-widest transition-all ${
                mode === 'nonconform'
                  ? 'bg-industrial-amber text-black'
                  : 'bg-industrial-panel text-industrial-text-dim hover:text-white'
              }`}
            >
              Non-Conform
            </button>
            <button
              onClick={() => setMode('duplicates')}
              className={`px-5 py-2 text-[10px] font-mono font-bold uppercase tracking-widest transition-all ${
                mode === 'duplicates'
                  ? 'bg-industrial-amber text-black'
                  : 'bg-industrial-panel text-industrial-text-dim hover:text-white'
              }`}
            >
              Duplicates
            </button>
          </div>
        </div>

        {/* Step indicator */}
        <div className="grid grid-cols-3 gap-px bg-industrial-border">
          {stepsConfig.map((s) => (
            <div
              key={s.step}
              className={`p-4 flex flex-col items-center justify-center transition-all ${
                currentStep === s.step
                  ? 'bg-industrial-amber text-black'
                  : currentStep > s.step
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

      {/* ── CONTENT: mode switcher ──────────────────────────── */}
      <AnimatePresence mode="wait">

        {/* ═══════════════════════════════════════════════════
            NON-CONFORM MODE
        ════════════════════════════════════════════════════ */}
        {mode === 'nonconform' && (
          <motion.div key="nonconform" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

            {/* Step 1 */}
            {ncStep === 1 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Config paths */}
                <div className="bg-industrial-panel border border-industrial-border divide-y divide-industrial-border">
                  {/* Workspace source */}
                  <div className="p-4 flex items-center gap-4">
                    <FolderOpen className="w-4 h-4 text-industrial-amber flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-mono text-industrial-text-dim uppercase tracking-widest mb-0.5">Source Workspace</p>
                      <p className={`text-[11px] font-mono truncate ${workspacePath ? 'text-white' : 'text-industrial-text-dim italic'}`}>
                        {workspacePath ?? 'No workspace selected'}
                      </p>
                    </div>
                    <button
                      onClick={handleSelectWorkspace}
                      disabled={isScanning}
                      className="flex-shrink-0 border border-industrial-amber text-industrial-amber px-4 py-1.5 text-[9px] font-mono font-bold uppercase tracking-widest hover:bg-industrial-amber hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isScanning ? 'Scanning...' : 'Browse'}
                    </button>
                  </div>
                  {/* NonConform destination */}
                  <div className="p-4 flex items-center gap-4">
                    <FolderInput className="w-4 h-4 text-industrial-red flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-mono text-industrial-text-dim uppercase tracking-widest mb-0.5">Non-Conform Destination</p>
                      <p className="text-[11px] font-mono truncate text-industrial-red">
                        {ncDestPath ?? '— select a workspace first —'}
                      </p>
                    </div>
                    {workspacePath && (
                      <button
                        onClick={handleBrowseNcDest}
                        className="flex-shrink-0 border border-industrial-border text-industrial-text-dim px-4 py-1.5 text-[9px] font-mono uppercase tracking-widest hover:border-industrial-red hover:text-industrial-red transition-all"
                      >
                        Change
                      </button>
                    )}
                  </div>
                </div>

                {/* Scan panel */}
                <div className="bg-industrial-panel border border-industrial-border p-10 flex flex-col items-center text-center">
                  <div className="w-20 h-20 border-2 border-industrial-amber/20 rounded-full flex items-center justify-center mb-6 relative">
                    <motion.div
                      animate={{ rotate: isCleanerRunning ? 360 : 0 }}
                      transition={{ duration: 2, repeat: isCleanerRunning ? Infinity : 0, ease: 'linear' }}
                      className="absolute inset-0 border-t-2 border-industrial-amber rounded-full"
                    />
                    <Search className="w-9 h-9 text-industrial-amber" />
                  </div>
                  <h3 className="text-2xl font-black uppercase tracking-tighter mb-3">
                    {isCleanerRunning ? 'Analysis In Progress' : 'Non-Conform Detection'}
                  </h3>
                  {!isCleanerRunning && (
                    <p className="max-w-lg text-industrial-text-dim text-sm mb-3 leading-relaxed">
                      Scans all indexed tracks for <span className="text-industrial-amber">YouTube video-rips</span>, embedded video streams, and corrupt files.
                      Switch to <span className="text-industrial-cyan font-bold">DUPLICATES</span> mode to detect acoustic and binary duplicates.
                    </p>
                  )}
                  {!isCleanerRunning && !systemStatus.ffmpegFound && (
                    <p className="max-w-md text-industrial-amber/80 text-[10px] mb-4 font-mono border border-industrial-amber/20 px-4 py-2">
                      FFmpeg not found — video stream &amp; corrupt checks skipped. Pattern matching only.
                    </p>
                  )}
                  {isCleanerRunning && cleanerProgress && (
                    <div className="mb-6 flex flex-col items-center gap-3 w-full max-w-md">
                      <ProgressBar
                        processed={cleanerProgress.analyzed}
                        total={cleanerProgress.total}
                        label={cleanerProgress.current_file || 'Analyzing...'}
                      />
                      <p className="text-[9px] font-mono text-industrial-cyan uppercase">
                        {cleanerProgress.found} non-conform detected so far
                      </p>
                    </div>
                  )}
                  {!isCleanerRunning && (
                    <button
                      onClick={handleNcStart}
                      disabled={!workspacePath || isScanning}
                      className={`px-12 py-4 font-bold text-xs uppercase tracking-widest transition-all active:scale-95 ${
                        workspacePath && !isScanning
                          ? 'bg-industrial-amber text-black hover:bg-white glow-amber'
                          : 'bg-industrial-border text-industrial-text-dim cursor-not-allowed'
                      }`}
                    >
                      {!workspacePath ? 'Select a Workspace First' : isScanning ? 'Scanning workspace...' : 'Start Non-Conform Analysis'}
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* Step 2 */}
            {ncStep === 2 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="bg-black p-4 border border-industrial-border flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-mono text-industrial-text-dim uppercase">{nonConformItems.length} issues</span>
                    <span className="text-[10px] font-mono text-industrial-text-dim uppercase">{ncTotalAnalyzed.toLocaleString()} analyzed</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={toggleNcAll} className="text-[9px] font-mono text-industrial-cyan hover:underline uppercase">
                      {ncSelectedIds.size === nonConformItems.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <span className="text-industrial-border">|</span>
                    <span className="text-[9px] font-mono text-industrial-amber uppercase">{ncSelectedIds.size} selected</span>
                  </div>
                </div>
                {nonConformItems.length === 0 ? (
                  <div className="bg-industrial-panel border border-industrial-border p-16 flex flex-col items-center text-center">
                    <CheckCircle className="w-12 h-12 text-industrial-cyan mb-4" />
                    <h3 className="text-xl font-black uppercase tracking-tighter mb-2 text-industrial-cyan">Library Is Clean</h3>
                    <p className="text-industrial-text-dim text-sm max-w-sm">No non-conform files in {ncTotalAnalyzed.toLocaleString()} tracks.</p>
                    <button onClick={handleNcReset} className="mt-8 border border-industrial-border text-industrial-text-dim px-8 py-2 font-bold text-xs uppercase tracking-widest hover:border-industrial-amber hover:text-industrial-amber transition-all">
                      Back to Scan
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1 max-h-[480px] overflow-y-auto pr-1 custom-scrollbar">
                      {nonConformItems.map(item => (
                        <button
                          key={item.id}
                          onClick={() => toggleNcItem(item.id)}
                          className={`w-full p-4 border text-left transition-all ${
                            ncSelectedIds.has(item.id)
                              ? 'border-industrial-amber bg-industrial-amber/5'
                              : 'border-industrial-border hover:border-industrial-text-dim/50 bg-industrial-panel'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center transition-all ${ncSelectedIds.has(item.id) ? 'border-industrial-amber bg-industrial-amber' : 'border-industrial-border'}`}>
                                {ncSelectedIds.has(item.id) && <div className="w-2 h-2 bg-black" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[11px] font-bold text-white truncate uppercase tracking-wider">{item.filename}</p>
                                <p className="text-[9px] font-mono text-industrial-text-dim truncate mt-0.5">{item.reason_detail}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span className="text-[9px] font-mono text-industrial-text-dim">{formatBytes(item.file_size_bytes)}</span>
                              <ReasonBadge reason={item.reason} />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <button onClick={handleNcReset} className="text-industrial-text-dim text-[10px] font-mono uppercase hover:text-white transition-all underline underline-offset-4">Re-scan</button>
                      <button
                        onClick={() => setNcStep(3)}
                        disabled={ncSelectedIds.size === 0}
                        className={`flex items-center gap-2 px-8 py-3 font-bold text-xs uppercase tracking-widest transition-all active:scale-95 ${ncSelectedIds.size > 0 ? 'bg-industrial-red text-white hover:brightness-110' : 'bg-industrial-border text-industrial-text-dim cursor-not-allowed'}`}
                      >
                        <FolderOutput className="w-4 h-4" />
                        Quarantine {ncSelectedIds.size > 0 ? `(${ncSelectedIds.size})` : ''}
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {/* Step 3 */}
            {ncStep === 3 && (
              <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="bg-industrial-panel border border-industrial-border p-12">
                {ncQuarantineResult === null ? (
                  <div className="text-center">
                    <div className="w-16 h-16 border-2 border-industrial-red/40 rounded-full flex items-center justify-center mx-auto mb-8">
                      <FolderOutput className="w-8 h-8 text-industrial-red" />
                    </div>
                    <h3 className="text-3xl font-black uppercase tracking-tighter mb-4">Quarantine Confirmation</h3>
                    <p className="max-w-md mx-auto text-industrial-text-dim text-sm mb-2 leading-relaxed">
                      <span className="text-white font-bold">{ncSelectedIds.size} files</span> will be moved to{' '}
                      <span className="font-mono text-industrial-cyan">_NonConform/</span>. Non-destructive — fully reversible.
                    </p>
                    {ncDestPath && (
                      <p className="font-mono text-[10px] text-industrial-text-dim mb-8 truncate max-w-lg mx-auto">{ncDestPath}</p>
                    )}
                    <div className="flex items-center justify-center gap-6">
                      <button onClick={() => setNcStep(2)} className="border border-industrial-border text-industrial-text-dim px-8 py-3 font-bold text-xs uppercase tracking-widest hover:border-white hover:text-white transition-all">Cancel</button>
                      <button onClick={handleNcQuarantine} className="bg-industrial-red text-white px-12 py-3 font-bold text-xs uppercase tracking-widest hover:brightness-110 transition-all active:scale-95">Execute Quarantine</button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <h3 className="text-3xl font-black uppercase tracking-tighter mb-8">Quarantine Complete</h3>
                    <div className="grid grid-cols-2 gap-6 max-w-sm mx-auto mb-12">
                      <div className="bg-black border border-industrial-border p-6">
                        <p className="text-[10px] font-mono text-industrial-cyan uppercase mb-1">Moved</p>
                        <p className="text-4xl font-black font-mono text-industrial-cyan">{ncQuarantineResult.moved}</p>
                      </div>
                      <div className={`bg-black border p-6 ${ncQuarantineResult.failed > 0 ? 'border-industrial-red' : 'border-industrial-border'}`}>
                        <p className={`text-[10px] font-mono uppercase mb-1 ${ncQuarantineResult.failed > 0 ? 'text-industrial-red' : 'text-industrial-text-dim'}`}>Failed</p>
                        <p className={`text-4xl font-black font-mono ${ncQuarantineResult.failed > 0 ? 'text-industrial-red' : 'text-white'}`}>{ncQuarantineResult.failed}</p>
                      </div>
                    </div>
                    <button onClick={handleNcReset} className="bg-industrial-amber text-black px-12 py-4 font-bold text-xs uppercase tracking-widest hover:bg-white transition-all active:scale-95">New Analysis</button>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════
            DUPLICATES MODE
        ════════════════════════════════════════════════════ */}
        {mode === 'duplicates' && (
          <motion.div key="duplicates" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

            {/* Step 1 */}
            {dupStep === 1 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Config paths */}
                <div className="bg-industrial-panel border border-industrial-border divide-y divide-industrial-border">
                  {/* Workspace source */}
                  <div className="p-4 flex items-center gap-4">
                    <FolderOpen className="w-4 h-4 text-industrial-amber flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-mono text-industrial-text-dim uppercase tracking-widest mb-0.5">Source Workspace</p>
                      <p className={`text-[11px] font-mono truncate ${workspacePath ? 'text-white' : 'text-industrial-text-dim italic'}`}>
                        {workspacePath ?? 'No workspace selected'}
                      </p>
                    </div>
                    <button
                      onClick={handleSelectWorkspace}
                      disabled={isScanning}
                      className="flex-shrink-0 border border-industrial-amber text-industrial-amber px-4 py-1.5 text-[9px] font-mono font-bold uppercase tracking-widest hover:bg-industrial-amber hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isScanning ? 'Scanning...' : 'Browse'}
                    </button>
                  </div>
                  {/* Duplicates destination */}
                  <div className="p-4 flex items-center gap-4">
                    <FolderInput className="w-4 h-4 text-industrial-cyan flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-mono text-industrial-text-dim uppercase tracking-widest mb-0.5">Duplicates Destination</p>
                      <p className="text-[11px] font-mono truncate text-industrial-cyan">
                        {dupDestPath ?? '— select a workspace first —'}
                      </p>
                    </div>
                    {workspacePath && (
                      <button
                        onClick={handleBrowseDupDest}
                        className="flex-shrink-0 border border-industrial-border text-industrial-text-dim px-4 py-1.5 text-[9px] font-mono uppercase tracking-widest hover:border-industrial-cyan hover:text-industrial-cyan transition-all"
                      >
                        Change
                      </button>
                    )}
                  </div>
                </div>

                {/* Scan panel */}
                <div className="bg-industrial-panel border border-industrial-border p-10 flex flex-col items-center text-center">
                  <div className="w-20 h-20 border-2 border-industrial-amber/20 rounded-full flex items-center justify-center mb-6 relative">
                    <motion.div
                      animate={{ rotate: isDuplicateRunning ? 360 : 0 }}
                      transition={{ duration: 2, repeat: isDuplicateRunning ? Infinity : 0, ease: 'linear' }}
                      className="absolute inset-0 border-t-2 border-industrial-amber rounded-full"
                    />
                    <Copy className="w-9 h-9 text-industrial-amber" />
                  </div>
                  <h3 className="text-2xl font-black uppercase tracking-tighter mb-3">
                    {isDuplicateRunning ? 'Analyzing Library...' : 'Duplicate Detection'}
                  </h3>

                  {!isDuplicateRunning && (
                    <div className="max-w-lg space-y-3 mb-6">
                      <p className="text-industrial-text-dim text-sm leading-relaxed">
                        Three-phase detection: <span className="text-white">binary hash</span> → <span className="text-white">metadata matching</span> → <span className="text-white">acoustic fingerprinting</span>.
                        Switch to <span className="text-industrial-amber font-bold">NON-CONFORM</span> mode to detect YouTube video-rips.
                      </p>
                      <div className="flex items-center justify-center gap-3 flex-wrap">
                        <span className="text-[9px] font-mono uppercase px-2 py-1 border border-industrial-cyan/40 text-industrial-cyan">
                          SHA-256: always active
                        </span>
                        <span className="text-[9px] font-mono uppercase px-2 py-1 border border-industrial-cyan/40 text-industrial-cyan">
                          Metadata: always active
                        </span>
                        <span className={`text-[9px] font-mono uppercase px-2 py-1 border ${systemStatus.fpcalcFound ? 'border-industrial-cyan/40 text-industrial-cyan' : 'border-industrial-border text-industrial-text-dim'}`}>
                          Acoustic: {systemStatus.fpcalcFound ? 'active' : 'fpcalc not found — skipped'}
                        </span>
                      </div>
                    </div>
                  )}

                  {isDuplicateRunning && duplicateProgress && (
                    <div className="mb-6 flex flex-col items-center gap-3 w-full max-w-md">
                      <div className="text-[9px] font-mono text-industrial-amber uppercase">
                        Phase: {duplicateProgress.phase.toUpperCase()}
                      </div>
                      <ProgressBar
                        processed={duplicateProgress.processed}
                        total={duplicateProgress.total}
                        label={duplicateProgress.current_file || 'Processing...'}
                      />
                      <p className="text-[9px] font-mono text-industrial-cyan uppercase">
                        {duplicateProgress.groups_found} groups detected so far
                      </p>
                    </div>
                  )}

                  {!isDuplicateRunning && (
                    <button
                      onClick={handleDupStart}
                      disabled={!workspacePath || isScanning}
                      className={`px-12 py-4 font-bold text-xs uppercase tracking-widest transition-all active:scale-95 ${
                        workspacePath && !isScanning
                          ? 'bg-industrial-amber text-black hover:bg-white glow-amber'
                          : 'bg-industrial-border text-industrial-text-dim cursor-not-allowed'
                      }`}
                    >
                      {!workspacePath ? 'Select a Workspace First' : isScanning ? 'Scanning workspace...' : 'Start Duplicate Scan'}
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* Step 2 */}
            {dupStep === 2 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Left: group list */}
                <div className="lg:col-span-4 space-y-3">
                  <div className="bg-black p-4 border border-industrial-border flex items-center justify-between">
                    <span className="text-[10px] font-mono text-industrial-text-dim uppercase">{duplicateGroups.length} groups</span>
                    <button onClick={handleDupReset} className="text-[9px] font-mono text-industrial-text-dim hover:text-white uppercase underline underline-offset-4">Re-scan</button>
                  </div>

                  {duplicateGroups.length === 0 ? (
                    <div className="bg-industrial-panel border border-industrial-border p-12 flex flex-col items-center text-center">
                      <CheckCircle className="w-10 h-10 text-industrial-cyan mb-4" />
                      <h3 className="text-lg font-black uppercase tracking-tighter text-industrial-cyan mb-2">No Duplicates Found</h3>
                      <p className="text-industrial-text-dim text-xs">All tracks appear to be unique.</p>
                      <button onClick={handleDupReset} className="mt-6 border border-industrial-border text-industrial-text-dim px-6 py-2 font-bold text-xs uppercase tracking-widest hover:border-industrial-amber hover:text-industrial-amber transition-all">Back</button>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1 max-h-[440px] overflow-y-auto pr-1 custom-scrollbar">
                        {duplicateGroups.map(g => (
                          <button
                            key={g.group_id}
                            onClick={() => setSelectedGroupId(g.group_id)}
                            className={`w-full p-4 border text-left transition-all ${
                              selectedGroupId === g.group_id
                                ? 'border-industrial-amber bg-industrial-amber/5'
                                : 'border-industrial-border hover:border-industrial-text-dim/50 bg-industrial-panel'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <MatchBadge matchType={g.match_type} score={g.score} />
                              <span className="text-[9px] font-mono text-industrial-text-dim">{g.files.length} files</span>
                            </div>
                            <p className="text-[11px] font-bold text-white truncate uppercase tracking-wider">
                              {g.files[0]?.artist ?? '—'} — {g.files[0]?.title ?? g.files[0]?.filename}
                            </p>
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setDupStep(3)}
                        className="w-full bg-industrial-amber text-black py-4 font-bold text-xs uppercase tracking-widest hover:bg-white transition-all active:scale-95"
                      >
                        Proceed to Resolve ({duplicateGroups.length} groups)
                      </button>
                    </>
                  )}
                </div>

                {/* Right: group detail */}
                <div className="lg:col-span-8">
                  {selectedGroup ? (
                    <div className="bg-industrial-panel border border-industrial-border p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-widest">Group Detail</h3>
                        <MatchBadge matchType={selectedGroup.match_type} score={selectedGroup.score} />
                      </div>
                      <div className="space-y-2">
                        {selectedGroup.files.map(file => {
                          const keepId = getKeepId(selectedGroup);
                          const isKept = file.id === keepId;
                          return (
                            <div
                              key={file.id}
                              className={`p-4 border transition-all ${isKept ? 'border-industrial-cyan bg-industrial-cyan/5' : 'border-industrial-border bg-black'}`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-bold truncate uppercase tracking-wider">{file.filename}</p>
                                  <div className="flex items-center gap-4 mt-1 flex-wrap">
                                    <span className="text-[9px] font-mono text-industrial-text-dim">{file.format?.toUpperCase() ?? '—'}</span>
                                    <span className="text-[9px] font-mono text-industrial-text-dim">{file.bitrate ? `${file.bitrate} kbps` : '—'}</span>
                                    <span className="text-[9px] font-mono text-industrial-text-dim">{formatDuration(file.duration_secs)}</span>
                                    <span className="text-[9px] font-mono text-industrial-text-dim">{formatBytes(file.file_size_bytes)}</span>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  {isKept ? (
                                    <span className="text-[8px] font-mono font-bold uppercase px-2 py-0.5 bg-industrial-cyan/20 text-industrial-cyan border border-industrial-cyan/40">
                                      KEEP
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => setKeepId(selectedGroup.group_id, file.id)}
                                      className="text-[8px] font-mono uppercase px-2 py-0.5 border border-industrial-border text-industrial-text-dim hover:border-industrial-cyan hover:text-industrial-cyan transition-all"
                                    >
                                      Set as Keep
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full min-h-[200px] flex items-center justify-center border-2 border-dashed border-industrial-border text-industrial-text-dim font-mono text-xs uppercase">
                      Select a group to review
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Step 3 */}
            {dupStep === 3 && (
              <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="bg-industrial-panel border border-industrial-border p-12">
                {dupResolveResult === null ? (
                  <div className="text-center">
                    <div className="w-16 h-16 border-2 border-industrial-amber/40 rounded-full flex items-center justify-center mx-auto mb-8">
                      <FolderOutput className="w-8 h-8 text-industrial-amber" />
                    </div>
                    <h3 className="text-3xl font-black uppercase tracking-tighter mb-4">Resolve Confirmation</h3>
                    <p className="max-w-md mx-auto text-industrial-text-dim text-sm mb-2 leading-relaxed">
                      Loser files from <span className="text-white font-bold">{duplicateGroups.length} groups</span> will be moved to{' '}
                      <span className="font-mono text-industrial-cyan">_Duplicates/</span>. Best-pick files remain untouched.
                    </p>
                    {dupDestPath && (
                      <p className="font-mono text-[10px] text-industrial-text-dim mb-8 truncate max-w-lg mx-auto">{dupDestPath}</p>
                    )}
                    <div className="flex items-center justify-center gap-6">
                      <button onClick={() => setDupStep(2)} className="border border-industrial-border text-industrial-text-dim px-8 py-3 font-bold text-xs uppercase tracking-widest hover:border-white hover:text-white transition-all">
                        Back to Review
                      </button>
                      <button onClick={handleDupResolve} className="bg-industrial-amber text-black px-12 py-3 font-bold text-xs uppercase tracking-widest hover:bg-white transition-all active:scale-95">
                        Execute Resolve
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <h3 className="text-3xl font-black uppercase tracking-tighter mb-8">Resolve Complete</h3>
                    <div className="grid grid-cols-2 gap-6 max-w-sm mx-auto mb-12">
                      <div className="bg-black border border-industrial-border p-6">
                        <p className="text-[10px] font-mono text-industrial-cyan uppercase mb-1">Moved</p>
                        <p className="text-4xl font-black font-mono text-industrial-cyan">{dupResolveResult.moved}</p>
                      </div>
                      <div className={`bg-black border p-6 ${dupResolveResult.failed > 0 ? 'border-industrial-red' : 'border-industrial-border'}`}>
                        <p className={`text-[10px] font-mono uppercase mb-1 ${dupResolveResult.failed > 0 ? 'text-industrial-red' : 'text-industrial-text-dim'}`}>Failed</p>
                        <p className={`text-4xl font-black font-mono ${dupResolveResult.failed > 0 ? 'text-industrial-red' : 'text-white'}`}>{dupResolveResult.failed}</p>
                      </div>
                    </div>
                    <button onClick={handleDupReset} className="bg-industrial-amber text-black px-12 py-4 font-bold text-xs uppercase tracking-widest hover:bg-white transition-all active:scale-95">
                      New Analysis
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
