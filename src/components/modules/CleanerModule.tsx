import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Eraser, Search, AlertTriangle, Video, Skull, FolderOutput,
  Copy, CheckCircle, Music, Cpu, FolderOpen, FolderInput,
} from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import type {
  LibraryStats,
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

// Normalizza un path per confronti di uguaglianza: rimuove separatori finali
// e ignora le maiuscole (i filesystem Windows sono case-insensitive).
// Fix v0.5.13 (criticità 15): il confronto testuale esatto era bypassabile.
// La guardia autoritativa resta comunque nel backend Rust (path canonicalizzati).
function normalizePath(p: string): string {
  return p.replace(/[\\/]+$/, '').toLowerCase();
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

// ── PaginationBar (CRIT-05 Resolved: Prevenzione sovraccarico DOM) ───────────

interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}

function PaginationBar({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  itemLabel = 'elementi',
}: PaginationBarProps) {
  if (totalItems <= pageSize) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between py-2 px-3 bg-black/50 border border-industrial-border text-[9px] font-mono select-none my-1">
      <span className="text-industrial-text-dim uppercase">
        {start}–{end} di {totalItems.toLocaleString()} {itemLabel}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="px-2 py-0.5 border border-industrial-border text-industrial-text-dim hover:text-white disabled:opacity-20 disabled:pointer-events-none uppercase transition-all"
          title="Prima pagina"
        >
          «
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-2 py-0.5 border border-industrial-border text-industrial-text-dim hover:text-white disabled:opacity-20 disabled:pointer-events-none uppercase transition-all"
        >
          PREV
        </button>
        <span className="px-2 py-0.5 text-industrial-amber font-bold">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-2 py-0.5 border border-industrial-border text-industrial-text-dim hover:text-white disabled:opacity-20 disabled:pointer-events-none uppercase transition-all"
        >
          NEXT
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="px-2 py-0.5 border border-industrial-border text-industrial-text-dim hover:text-white disabled:opacity-20 disabled:pointer-events-none uppercase transition-all"
          title="Ultima pagina"
        >
          »
        </button>
      </div>
    </div>
  );
}

// ── CleanerModule ──────────────────────────────────────────────────────────

export function CleanerModule() {
  const {
    addLog, workspacePath, setWorkspacePath, systemStatus,
    isScanning, setIsScanning, scanProgress,
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
  const [ncPage, setNcPage] = useState(1);
  const NC_PAGE_SIZE = 50;

  // ── Duplicates state ──
  const [dupStep, setDupStep] = useState<CleanerStep>(1);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  // overrides: { group_id → keep_id } — per default è best_pick_id
  const [keepOverrides, setKeepOverrides] = useState<Record<string, number>>({});
  const [dupResolveResult, setDupResolveResult] = useState<DuplicateResolveResult | null>(null);
  const [dupPage, setDupPage] = useState(1);
  const DUP_PAGE_SIZE = 40;
  // Fix v0.5.13 (criticità 8): gruppi esclusi dal resolve. Prima il resolve
  // spostava i loser di TUTTI i gruppi, anche quelli mai aperti in review.
  const [excludedGroupIds, setExcludedGroupIds] = useState<Set<string>>(new Set());

  const ffprobePath = systemStatus.ffprobePath;
  const fpcalcPath = systemStatus.fpcalcPath;

  // Path destinazione effettivi
  // Rileva il separatore dal workspace path ricevuto dal dialog di sistema
  // per restare cross-platform (Windows usa \, macOS/Linux usano /)
  const pathSep = workspacePath?.includes('\\') ? '\\' : '/';
  const ncDestPath = customNcDest ?? (workspacePath ? `${workspacePath}${pathSep}_NonConform` : null);
  const dupDestPath = customDupDest ?? (workspacePath ? `${workspacePath}${pathSep}_Duplicates` : null);

  // Calcolo dati paginati per virtualizzazione leggera del DOM (CRIT-05 Resolved)
  const ncTotalPages = Math.max(1, Math.ceil(nonConformItems.length / NC_PAGE_SIZE));
  const paginatedNcItems = nonConformItems.slice((ncPage - 1) * NC_PAGE_SIZE, ncPage * NC_PAGE_SIZE);

  const dupTotalPages = Math.max(1, Math.ceil(duplicateGroups.length / DUP_PAGE_SIZE));
  const paginatedDupGroups = duplicateGroups.slice((dupPage - 1) * DUP_PAGE_SIZE, dupPage * DUP_PAGE_SIZE);

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
        setWorkspacePath(selected);  // resetta anche i risultati detection nello store (v0.5.13)
        setCustomNcDest(null);  // reset destinazioni custom al cambio workspace
        setCustomDupDest(null);
        // Reset step e stato locale di entrambi i flussi (v0.5.13 — criticità 6)
        setNcStep(1); setNcSelectedIds(new Set()); setNcQuarantineResult(null); setNcTotalAnalyzed(0);
        setDupStep(1); setKeepOverrides({}); setDupResolveResult(null);
        setSelectedGroupId(null); setExcludedGroupIds(new Set());
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
        setIsScanning(false);
      }
    } catch (err) {
      setIsScanning(false);
      addLog('error', 'Workspace scan failed', String(err));
    }
  };

  // Valida una destinazione custom contro il workspace corrente.
  // Restituisce il messaggio d'errore, o null se la destinazione è valida.
  // Fix v0.5.13 (criticità 15): confronto normalizzato (case/separatori) e
  // blocco delle cartelle custom DENTRO il workspace (verrebbero re-indicizzate
  // al prossimo scan), eccetto le due cartelle riservate di quarantena.
  const validateDestination = (selected: string): string | null => {
    if (!workspacePath) return null;
    const ws = normalizePath(workspacePath);
    const sel = normalizePath(selected);
    if (sel === ws) {
      return 'Invalid destination: cannot use the source workspace as destination. A subfolder will be created automatically.';
    }
    const sep = workspacePath.includes('\\') ? '\\' : '/';
    if (sel.startsWith(ws + sep) && !/[\\/](_nonconform|_duplicates)$/.test(sel)) {
      return 'Invalid destination: a custom folder inside the source workspace would be re-indexed on the next scan. Choose a folder outside the workspace.';
    }
    return null;
  };

  const handleBrowseNcDest = async () => {
    const selected = await open({ directory: true, multiple: false, title: 'Select Non-Conform destination folder' });
    if (selected && !Array.isArray(selected)) {
      const error = validateDestination(selected);
      if (error) {
        addLog('error', error);
        return;
      }
      setCustomNcDest(selected);
    }
  };

  const handleBrowseDupDest = async () => {
    const selected = await open({ directory: true, multiple: false, title: 'Select Duplicates destination folder' });
    if (selected && !Array.isArray(selected)) {
      const error = validateDestination(selected);
      if (error) {
        addLog('error', error);
        return;
      }
      setCustomDupDest(selected);
    }
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
      // workspacePath limita l'analisi al workspace corrente (fix v0.5.11 — DB multi-workspace)
      const result = await invoke<CleanerResult>('detect_non_conform', { workspacePath, ffprobePath });
      setNcTotalAnalyzed(result.total_analyzed);
      setNonConformItems(result.items);
      setIsCleanerRunning(false);
      setCleanerProgress(null);
      setNcSelectedIds(new Set(result.items.map(i => i.id)));
      setNcPage(1);
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
      // Refresh stats hub — usa l'invoke già importato staticamente
      try {
        const stats = await invoke<LibraryStats>('get_library_stats');
        setLibraryStats(stats);
      } catch { /* non bloccante — le stats vengono aggiornate al prossimo avvio */ }
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
    setNcQuarantineResult(null); setNcTotalAnalyzed(0); setNcPage(1);
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
    setExcludedGroupIds(new Set());
    setDupPage(1);
    addLog('info', 'The Cleaner: starting duplicate analysis...', workspacePath);
    try {
      // workspacePath limita l'analisi al workspace corrente (fix v0.5.11 — DB multi-workspace)
      const result = await invoke<DuplicateDetectResult>('detect_duplicates', {
        workspacePath,
        fpcalcPath: fpcalcPath ?? null,
      });
      setDuplicateGroups(result.groups);
      setIsDuplicateRunning(false);
      setDuplicateProgress(null);
      setDupPage(1);
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

  const toggleGroupExcluded = (groupId: string) => {
    setExcludedGroupIds(prev => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  };

  // Solo i gruppi inclusi (checkbox attiva) entrano nel resolve (v0.5.13)
  const includedGroups = duplicateGroups.filter(g => !excludedGroupIds.has(g.group_id));

  const handleDupResolve = async () => {
    if (!workspacePath || includedGroups.length === 0) return;
    const resolutions: [number, number[]][] = includedGroups.map(g => {
      const keepId = getKeepId(g);
      const loserIds = g.files.filter(f => f.id !== keepId).map(f => f.id);
      return [keepId, loserIds];
    });
    addLog('info', `Resolving ${includedGroups.length} duplicate groups...`);
    try {
      const result = await invoke<DuplicateResolveResult>('resolve_duplicates', {
        workspacePath,
        resolutions,
        quarantinePath: customDupDest ?? null,
      });
      setDupResolveResult(result);
      // Refresh stats hub — usa l'invoke già importato staticamente
      try {
        const stats = await invoke<LibraryStats>('get_library_stats');
        setLibraryStats(stats);
      } catch { /* non bloccante — le stats vengono aggiornate al prossimo avvio */ }
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
    setExcludedGroupIds(new Set()); setDupPage(1);
  };

  // ── Render helpers ─────────────────────────────────────────────────────

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 select-none">

      {/* ── Header Rack Strip ─────────────────────────────────── */}
      <div className="bg-industrial-panel border border-industrial-border p-4 rounded rack-bevel flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-industrial-red/10 border border-industrial-red/30 rounded">
              <Eraser className="w-5 h-5 text-industrial-red" />
            </div>
            <div>
              <h2 className="text-xl font-black font-display tracking-tight uppercase text-white flex items-center gap-2">
                STAGE 02 // THE CLEANER <span className="text-industrial-amber text-xs font-mono font-normal">// SANITIZATION BAY</span>
              </h2>
              <p className="text-[10px] font-mono text-industrial-text-dim uppercase tracking-wider">
                Pattern Matching // FFprobe Video Stream Isolation // Dual-Stage Acoustic Deduplication
              </p>
            </div>
          </div>

          {/* Mode switcher broadcast buttons */}
          <div className="flex items-center gap-1 bg-black p-1 border border-industrial-border rounded">
            <button
              onClick={() => setMode('nonconform')}
              className={`px-4 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded transition-all flex items-center gap-2 ${
                mode === 'nonconform'
                  ? 'bg-industrial-red text-black font-black glow-red-led'
                  : 'text-industrial-text-dim hover:text-white'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${mode === 'nonconform' ? 'bg-black' : 'bg-industrial-red'}`} />
              02-A // Non-Conform
            </button>
            <button
              onClick={() => setMode('duplicates')}
              className={`px-4 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded transition-all flex items-center gap-2 ${
                mode === 'duplicates'
                  ? 'bg-industrial-amber text-black font-black glow-amber-led'
                  : 'text-industrial-text-dim hover:text-white'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${mode === 'duplicates' ? 'bg-black' : 'bg-industrial-amber'}`} />
              02-B // Duplicates
            </button>
          </div>
        </div>

        {/* Step indicator rack */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-industrial-border/60">
          {stepsConfig.map((s) => (
            <div
              key={s.step}
              className={`p-2.5 rounded border transition-all flex items-center justify-between ${
                currentStep === s.step
                  ? 'bg-industrial-surface border-industrial-amber text-white'
                  : currentStep > s.step
                    ? 'bg-industrial-panel/50 border-industrial-green/40 text-industrial-green'
                    : 'bg-black/30 border-industrial-border/40 text-industrial-text-dim/60'
              }`}
            >
              <div>
                <span className="text-[8px] font-mono font-black uppercase tracking-wider block opacity-70">
                  STEP 0{s.step}
                </span>
                <span className="text-xs font-bold font-display uppercase tracking-tight">
                  {s.label}
                </span>
              </div>
              <span className="text-[9px] font-mono uppercase hidden sm:block opacity-60">
                {s.desc}
              </span>
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
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-[9px] font-mono text-industrial-text-dim uppercase tracking-widest">Non-Conform Destination</p>
                        {!customNcDest && workspacePath && (
                          <span className="text-[7px] font-mono font-bold uppercase px-1.5 py-0.5 bg-industrial-amber/10 text-industrial-amber border border-industrial-amber/30">
                            AUTO — subfolder of source
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono truncate text-industrial-red">
                        {ncDestPath ?? '— select a workspace first —'}
                      </p>
                    </div>
                    {workspacePath && (
                      <button
                        onClick={handleBrowseNcDest}
                        className="flex-shrink-0 border border-industrial-border text-industrial-text-dim px-4 py-1.5 text-[9px] font-mono uppercase tracking-widest hover:border-industrial-red hover:text-industrial-red transition-all"
                      >
                        {customNcDest ? 'Change' : 'Override'}
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
                  {!isCleanerRunning && !systemStatus.ffprobeFound && (
                    <p className="max-w-md text-industrial-amber/80 text-[10px] mb-4 font-mono border border-industrial-amber/20 px-4 py-2">
                      FFprobe not found — video stream &amp; corrupt checks skipped. Pattern matching only.
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
                      <button
                        onClick={async () => {
                          try {
                            await invoke('abort_task', { taskName: 'cleaner' });
                            addLog('warning', 'Non-conform analysis abort requested by operator.');
                          } catch (e) {
                            addLog('error', 'Failed to abort cleaner', String(e));
                          }
                        }}
                        className="mt-2 px-6 py-2 border border-industrial-magenta text-industrial-magenta hover:bg-industrial-magenta hover:text-black font-bold text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2"
                      >
                        <span className="w-1.5 h-1.5 bg-industrial-magenta animate-ping rounded-full" />
                        ABORT ANALYSIS
                      </button>
                    </div>
                  )}
                  {/* Progress bar scansione workspace — visibile solo durante isScanning */}
                  {isScanning && scanProgress && (
                    <div className="w-full max-w-md mb-4 space-y-2">
                      <div className="flex justify-between font-mono text-[9px] text-industrial-amber uppercase">
                        <span>Workspace scan in progress — please wait</span>
                        <span>
                          {scanProgress.total > 0
                            ? `${scanProgress.scanned.toLocaleString()} / ${scanProgress.total.toLocaleString()}`
                            : 'Discovering...'}
                        </span>
                      </div>
                      <div className="h-0.5 bg-industrial-border w-full">
                        <motion.div
                          className="h-full bg-industrial-amber"
                          animate={{ width: scanProgress.total > 0 ? `${(scanProgress.scanned / scanProgress.total) * 100}%` : '0%' }}
                          transition={{ ease: 'linear', duration: 0.3 }}
                        />
                      </div>
                      <p className="text-[8px] font-mono text-industrial-text-dim truncate text-center">
                        {scanProgress.current_file || scanProgress.phase}
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
                    <PaginationBar
                      currentPage={ncPage}
                      totalPages={ncTotalPages}
                      totalItems={nonConformItems.length}
                      pageSize={NC_PAGE_SIZE}
                      onPageChange={setNcPage}
                      itemLabel="file non-conformi"
                    />
                    <div className="space-y-1 max-h-[480px] overflow-y-auto pr-1 custom-scrollbar">
                      {paginatedNcItems.map(item => (
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
                    <PaginationBar
                      currentPage={ncPage}
                      totalPages={ncTotalPages}
                      totalItems={nonConformItems.length}
                      pageSize={NC_PAGE_SIZE}
                      onPageChange={setNcPage}
                      itemLabel="file non-conformi"
                    />
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
                    <div className="grid grid-cols-2 gap-6 max-w-sm mx-auto mb-6">
                      <div className="bg-black border border-industrial-border p-6">
                        <p className="text-[10px] font-mono text-industrial-cyan uppercase mb-1">Moved</p>
                        <p className="text-4xl font-black font-mono text-industrial-cyan">{ncQuarantineResult.moved}</p>
                      </div>
                      <div className={`bg-black border p-6 ${ncQuarantineResult.failed > 0 ? 'border-industrial-red' : 'border-industrial-border'}`}>
                        <p className={`text-[10px] font-mono uppercase mb-1 ${ncQuarantineResult.failed > 0 ? 'text-industrial-red' : 'text-industrial-text-dim'}`}>Failed</p>
                        <p className={`text-4xl font-black font-mono ${ncQuarantineResult.failed > 0 ? 'text-industrial-red' : 'text-white'}`}>{ncQuarantineResult.failed}</p>
                      </div>
                    </div>
                    <div className="max-w-lg mx-auto mb-8 p-3 border border-industrial-border/50 bg-black">
                      <p className="text-[9px] font-mono text-industrial-text-dim uppercase tracking-widest mb-1">Files moved to</p>
                      <p className="text-[11px] font-mono text-industrial-cyan truncate">{ncQuarantineResult.quarantine_path}</p>
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
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-[9px] font-mono text-industrial-text-dim uppercase tracking-widest">Duplicates Destination</p>
                        {!customDupDest && workspacePath && (
                          <span className="text-[7px] font-mono font-bold uppercase px-1.5 py-0.5 bg-industrial-amber/10 text-industrial-amber border border-industrial-amber/30">
                            AUTO — subfolder of source
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono truncate text-industrial-cyan">
                        {dupDestPath ?? '— select a workspace first —'}
                      </p>
                    </div>
                    {workspacePath && (
                      <button
                        onClick={handleBrowseDupDest}
                        className="flex-shrink-0 border border-industrial-border text-industrial-text-dim px-4 py-1.5 text-[9px] font-mono uppercase tracking-widest hover:border-industrial-cyan hover:text-industrial-cyan transition-all"
                      >
                        {customDupDest ? 'Change' : 'Override'}
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
                      <button
                        onClick={async () => {
                          try {
                            await invoke('abort_task', { taskName: 'duplicates' });
                            addLog('warning', 'Duplicate scan abort requested by operator.');
                          } catch (e) {
                            addLog('error', 'Failed to abort duplicate scan', String(e));
                          }
                        }}
                        className="mt-2 px-6 py-2 border border-industrial-magenta text-industrial-magenta hover:bg-industrial-magenta hover:text-black font-bold text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2"
                      >
                        <span className="w-1.5 h-1.5 bg-industrial-magenta animate-ping rounded-full" />
                        ABORT SCAN
                      </button>
                    </div>
                  )}

                  {/* Progress bar scansione workspace — visibile solo durante isScanning */}
                  {isScanning && scanProgress && (
                    <div className="w-full max-w-md mb-4 space-y-2">
                      <div className="flex justify-between font-mono text-[9px] text-industrial-amber uppercase">
                        <span>Workspace scan in progress — please wait</span>
                        <span>
                          {scanProgress.total > 0
                            ? `${scanProgress.scanned.toLocaleString()} / ${scanProgress.total.toLocaleString()}`
                            : 'Discovering...'}
                        </span>
                      </div>
                      <div className="h-0.5 bg-industrial-border w-full">
                        <motion.div
                          className="h-full bg-industrial-amber"
                          animate={{ width: scanProgress.total > 0 ? `${(scanProgress.scanned / scanProgress.total) * 100}%` : '0%' }}
                          transition={{ ease: 'linear', duration: 0.3 }}
                        />
                      </div>
                      <p className="text-[8px] font-mono text-industrial-text-dim truncate text-center">
                        {scanProgress.current_file || scanProgress.phase}
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
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-mono text-industrial-text-dim uppercase">{duplicateGroups.length} groups detected</span>
                      <span className="text-[8px] font-mono text-industrial-text-dim/60 uppercase">A group = 2+ files identified as duplicates of each other</span>
                    </div>
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
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[9px] font-mono text-industrial-amber uppercase">
                          {includedGroups.length} of {duplicateGroups.length} groups selected for resolve
                        </span>
                        <button
                          onClick={() => setExcludedGroupIds(
                            excludedGroupIds.size === 0
                              ? new Set(duplicateGroups.map(g => g.group_id))
                              : new Set()
                          )}
                          className="text-[9px] font-mono text-industrial-cyan hover:underline uppercase"
                        >
                          {excludedGroupIds.size === 0 ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      <PaginationBar
                        currentPage={dupPage}
                        totalPages={dupTotalPages}
                        totalItems={duplicateGroups.length}
                        pageSize={DUP_PAGE_SIZE}
                        onPageChange={setDupPage}
                        itemLabel="gruppi duplicati"
                      />
                      <div className="space-y-1 max-h-[440px] overflow-y-auto pr-1 custom-scrollbar">
                        {paginatedDupGroups.map(g => {
                          const included = !excludedGroupIds.has(g.group_id);
                          return (
                            <div
                              key={g.group_id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedGroupId(g.group_id)}
                              onKeyDown={(e) => { if (e.key === 'Enter') setSelectedGroupId(g.group_id); }}
                              className={`w-full p-4 border text-left transition-all cursor-pointer ${
                                selectedGroupId === g.group_id
                                  ? 'border-industrial-amber bg-industrial-amber/5'
                                  : 'border-industrial-border hover:border-industrial-text-dim/50 bg-industrial-panel'
                              } ${included ? '' : 'opacity-40'}`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  {/* Checkbox include/exclude dal resolve (v0.5.13) */}
                                  <span
                                    role="checkbox"
                                    aria-checked={included}
                                    title={included ? 'Included in resolve — click to skip this group' : 'Skipped — click to include in resolve'}
                                    onClick={(e) => { e.stopPropagation(); toggleGroupExcluded(g.group_id); }}
                                    className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center transition-all ${
                                      included ? 'border-industrial-amber bg-industrial-amber' : 'border-industrial-border'
                                    }`}
                                  >
                                    {included && <span className="w-2 h-2 bg-black" />}
                                  </span>
                                  <MatchBadge matchType={g.match_type} score={g.score} />
                                </div>
                                <span className="text-[9px] font-mono text-industrial-text-dim">{g.files.length} files</span>
                              </div>
                              <p className="text-[11px] font-bold text-white truncate uppercase tracking-wider">
                                {g.files[0]?.artist ?? '—'} — {g.files[0]?.title ?? g.files[0]?.filename}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                      <PaginationBar
                        currentPage={dupPage}
                        totalPages={dupTotalPages}
                        totalItems={duplicateGroups.length}
                        pageSize={DUP_PAGE_SIZE}
                        onPageChange={setDupPage}
                        itemLabel="gruppi duplicati"
                      />
                      <button
                        onClick={() => setDupStep(3)}
                        disabled={includedGroups.length === 0}
                        className={`w-full py-4 font-bold text-xs uppercase tracking-widest transition-all active:scale-95 ${
                          includedGroups.length > 0
                            ? 'bg-industrial-amber text-black hover:bg-white'
                            : 'bg-industrial-border text-industrial-text-dim cursor-not-allowed'
                        }`}
                      >
                        Proceed to Resolve ({includedGroups.length} of {duplicateGroups.length} groups)
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
                      Loser files from <span className="text-white font-bold">{includedGroups.length} of {duplicateGroups.length} groups</span> will be moved to{' '}
                      <span className="font-mono text-industrial-cyan">_Duplicates/</span>. Best-pick files remain untouched.
                      {excludedGroupIds.size > 0 && (
                        <span className="block mt-1 text-[10px] font-mono text-industrial-amber uppercase">
                          {excludedGroupIds.size} group{excludedGroupIds.size > 1 ? 's' : ''} skipped by your selection
                        </span>
                      )}
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
                    <div className="grid grid-cols-2 gap-6 max-w-sm mx-auto mb-6">
                      <div className="bg-black border border-industrial-border p-6">
                        <p className="text-[10px] font-mono text-industrial-cyan uppercase mb-1">Moved</p>
                        <p className="text-4xl font-black font-mono text-industrial-cyan">{dupResolveResult.moved}</p>
                      </div>
                      <div className={`bg-black border p-6 ${dupResolveResult.failed > 0 ? 'border-industrial-red' : 'border-industrial-border'}`}>
                        <p className={`text-[10px] font-mono uppercase mb-1 ${dupResolveResult.failed > 0 ? 'text-industrial-red' : 'text-industrial-text-dim'}`}>Failed</p>
                        <p className={`text-4xl font-black font-mono ${dupResolveResult.failed > 0 ? 'text-industrial-red' : 'text-white'}`}>{dupResolveResult.failed}</p>
                      </div>
                    </div>
                    <div className="max-w-lg mx-auto mb-8 p-3 border border-industrial-border/50 bg-black">
                      <p className="text-[9px] font-mono text-industrial-text-dim uppercase tracking-widest mb-1">Files moved to</p>
                      <p className="text-[11px] font-mono text-industrial-cyan truncate">{dupResolveResult.quarantine_path}</p>
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
