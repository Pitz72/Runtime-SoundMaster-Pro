import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Layers, RefreshCcw, Settings2, FileAudio, CheckCircle2, Zap, AlertCircle, FolderSync } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../../store/appStore';

interface Preset {
  id: string;
  label: string;
  desc: string;
}

const PRESETS: Preset[] = [
  { id: 'PODCAST',       label: 'Podcast Master',   desc: 'Voice-forward, -16 LUFS (128k MP3)' },
  { id: 'RADIO_STD',      label: 'Radio Standard',   desc: 'FM Standard, -23 LUFS (192k MP3)'   },
  { id: 'RADIO_HQ',       label: 'Radio High-End',   desc: 'DAB+ Optimized, -23 LUFS (256k MP3)'},
  { id: 'MASTER',         label: 'Broadcast Master', desc: 'Full Spec 48kHz, -23 LUFS (320k MP3)'},
  { id: 'LOSSLESS_NORM',  label: 'Lossless FLAC',    desc: 'EBU R128 Compliant FLAC (-23 LUFS)' },
];

interface ConformerToggles {
  standardize:   boolean;
  normalization: boolean;
  trimming:      boolean;
}

interface ConformerQueueItem {
  id: number;
  path: string;
  filename: string;
  format: string | null;
  bitrate: number | null;
  sampleRate: number | null;
  durationSecs: number | null;
  conformingStatus: string;
}

interface ConformerProgressPayload {
  currentIndex: number;
  total: number;
  currentFile: string;
  phase: string;
  percentage: number;
}

interface ConformerFileResult {
  id: number;
  filename: string;
  outputPath: string | null;
  success: boolean;
  error: string | null;
}

interface ConformerBatchResult {
  total: number;
  succeeded: number;
  failed: number;
  outputDir: string;
  results: ConformerFileResult[];
}

interface ToggleRowProps {
  label: string;
  sub: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function ToggleRow({ label, sub, checked, onToggle, disabled }: ToggleRowProps) {
  return (
    <div className={`flex items-center justify-between group ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="flex flex-col">
        <span className="text-[11px] font-bold text-white uppercase tracking-wider">{label}</span>
        <span className="text-[9px] text-industrial-text-dim uppercase">{sub}</span>
      </div>
      <button
        onClick={onToggle}
        disabled={disabled}
        className={`w-10 h-5 relative transition-colors duration-200 ${
          checked ? 'bg-industrial-amber' : 'bg-industrial-border'
        }`}
      >
        <motion.div
          animate={{ x: checked ? 22 : 2 }}
          className={`absolute top-1 w-3 h-3 ${checked ? 'bg-black' : 'bg-industrial-text-dim'}`}
        />
      </button>
    </div>
  );
}

function formatDuration(secs: number | null): string {
  if (!secs) return '--:--';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function ConformerModule() {
  const { workspacePath, addLog, systemStatus } = useAppStore();
  const [selectedPreset, setSelectedPreset] = useState('RADIO_STD');
  const [toggles, setToggles] = useState<ConformerToggles>({
    standardize:   true,
    normalization: true,
    trimming:      false,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [queue, setQueue] = useState<ConformerQueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [processedIds, setProcessedIds] = useState<Set<number>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<number>>(new Set());

  // Ricarica la coda dal database per il workspace selezionato
  const fetchQueue = async () => {
    if (!workspacePath) {
      setQueue([]);
      return;
    }
    setLoadingQueue(true);
    try {
      const items = await invoke<ConformerQueueItem[]>('get_conformer_queue', { workspacePath });
      setQueue(items);
    } catch (err) {
      addLog('error', 'Conformer: errore nel caricamento della coda', String(err));
    } finally {
      setLoadingQueue(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [workspacePath]);

  // Listener globale per lo streaming del progresso da Rust
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    let unlisten: (() => void) | null = null;

    listen<ConformerProgressPayload>('conformer-progress', (event) => {
      if (!isMountedRef.current) return;
      const p = event.payload;
      setProgress(Math.round(p.percentage));
      setCurrentFileName(p.currentFile);
      if (p.phase === 'complete') {
        setIsProcessing(false);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      isMountedRef.current = false;
      if (unlisten) unlisten();
    };
  }, []);

  const toggle = (key: keyof ConformerToggles) =>
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));

  const startProcessing = async () => {
    if (isProcessing) return;

    if (!workspacePath) {
      addLog('warning', 'Conformer: seleziona prima una libreria workspace nell\'Hub.');
      return;
    }

    if (!systemStatus.ffmpegFound) {
      addLog('error', 'Conformer: FFmpeg non trovato.', 'FFmpeg è necessario per normalizzazione e transcodifica.');
      return;
    }

    if (queue.length === 0) {
      addLog('warning', 'Conformer: nessun file idoneo in coda per la standardizzazione.');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setCurrentFileName('Inizializzazione batch...');
    addLog('info', `Conformer: avviato batch di ${queue.length} file con preset ${selectedPreset}.`);

    try {
      const result = await invoke<ConformerBatchResult>('conform_batch', {
        workspacePath,
        trackIds: null,
        options: {
          presetId: selectedPreset,
          standardize: toggles.standardize,
          ebuR128: toggles.normalization,
          silentTrim: toggles.trimming,
          outputDir: null,
        },
        ffmpegPath: systemStatus.ffmpegPath,
      });

      const succSet = new Set<number>();
      const failSet = new Set<number>();
      for (const res of result.results) {
        if (res.success) {
          succSet.add(res.id);
        } else {
          failSet.add(res.id);
        }
      }
      setProcessedIds(succSet);
      setFailedIds(failSet);

      addLog(
        result.failed === 0 ? 'success' : 'warning',
        `Conformer: completato. Riusciti: ${result.succeeded}, Falliti: ${result.failed}`,
        `Destinazione: ${result.outputDir}`
      );

      // Ricarica la coda per aggiornare lo status nel catalogo
      await fetchQueue();
    } catch (err) {
      addLog('error', 'Conformer: errore critico durante il batch', String(err));
    } finally {
      setIsProcessing(false);
      setProgress(100);
      setCurrentFileName('');
    }
  };

  const processedCount = processedIds.size;
  const totalCount = queue.length;

  return (
    <div className="flex flex-col md:flex-row gap-6 overflow-hidden">

      {/* ── Left Panel ───────────────────────────────────────── */}
      <div className="w-full md:w-1/3 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">

        {/* Module Identity */}
        <div className="bg-industrial-panel border border-industrial-border p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-industrial-amber/5 -rotate-45 translate-x-12 -translate-y-12" />
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-industrial-amber flex items-center justify-center">
              <Layers className="text-black w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tighter text-white leading-none uppercase">
                Conformer
              </h2>
              <p className="text-[10px] font-mono text-industrial-amber tracking-widest uppercase">
                Audio Alignment & EBU R128 Engine
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-mono border-b border-industrial-border pb-1">
              <span className="text-industrial-text-dim uppercase">Engine Status</span>
              <span className={systemStatus.ffmpegFound ? 'text-industrial-cyan uppercase' : 'text-industrial-red uppercase'}>
                {systemStatus.ffmpegFound ? 'FFmpeg Ready' : 'FFmpeg Missing'}
              </span>
            </div>
            <div className="flex justify-between text-[10px] font-mono border-b border-industrial-border pb-1">
              <span className="text-industrial-text-dim uppercase">Workspace Queue</span>
              <span className="text-white uppercase">{loadingQueue ? 'Caricamento...' : `${totalCount} files`}</span>
            </div>
            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-industrial-text-dim uppercase">Output Preset</span>
              <span className="text-white uppercase">{selectedPreset}</span>
            </div>
          </div>
        </div>

        {/* Radio Presets */}
        <div className="bg-industrial-panel border border-industrial-border p-6">
          <h3 className="text-xs font-bold text-white tracking-widest uppercase flex items-center gap-2 mb-6">
            <RefreshCcw className="w-3 h-3 text-industrial-cyan" />
            Broadcast Presets
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                disabled={isProcessing}
                onClick={() => setSelectedPreset(preset.id)}
                className={`text-left p-3 border transition-all ${
                  selectedPreset === preset.id
                    ? 'border-industrial-cyan bg-industrial-cyan/10'
                    : 'border-industrial-border hover:border-industrial-text-dim/50 bg-black/40'
                } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-white">
                  {preset.label}
                </div>
                <div className="text-[8px] font-mono text-industrial-text-dim uppercase mt-1">
                  {preset.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Workflow Parameters */}
        <div className="bg-industrial-panel border border-industrial-border p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-bold text-white tracking-widest uppercase flex items-center gap-2">
              <Settings2 className="w-3 h-3 text-industrial-amber" />
              Workflow Parameters
            </h3>
            <span className="text-[9px] font-mono text-industrial-text-dim uppercase px-1.5 py-0.5 border border-industrial-border">
              Offline: 100%
            </span>
          </div>
          <div className="space-y-6">
            <ToggleRow
              label="Standardize"
              sub="Match sample rate & bit depth"
              checked={toggles.standardize}
              onToggle={() => toggle('standardize')}
              disabled={isProcessing}
            />
            <ToggleRow
              label="Loudness Normalization"
              sub="Target: EBU R128 (-23 LUFS / -16 Podcast)"
              checked={toggles.normalization}
              onToggle={() => toggle('normalization')}
              disabled={isProcessing}
            />
            <ToggleRow
              label="Silent Trimming"
              sub="Remove silence from start/end"
              checked={toggles.trimming}
              onToggle={() => toggle('trimming')}
              disabled={isProcessing}
            />
          </div>

          <button
            onClick={startProcessing}
            disabled={isProcessing || !workspacePath || queue.length === 0 || !systemStatus.ffmpegFound}
            className={`w-full mt-8 py-4 flex items-center justify-center gap-3 font-black tracking-[0.2em] uppercase transition-all duration-300 ${
              isProcessing || !workspacePath || queue.length === 0 || !systemStatus.ffmpegFound
                ? 'bg-industrial-border text-industrial-text-dim cursor-not-allowed'
                : 'bg-industrial-amber text-black hover:bg-white active:scale-[0.98]'
            }`}
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-industrial-text-dim border-t-white rounded-full animate-spin" />
                Processing Batch ({progress}%)
              </>
            ) : (
              <>
                <Zap className="w-5 h-5 fill-current" />
                Start Batch Processing
              </>
            )}
          </button>

          {isProcessing && (
            <button
              onClick={async () => {
                try {
                  await invoke('abort_task', { taskName: 'conformer' });
                  addLog('warning', 'Conformer batch abort requested by operator.');
                } catch (e) {
                  addLog('error', 'Failed to abort conformer', String(e));
                }
              }}
              className="w-full mt-3 py-3 flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest border border-industrial-magenta text-industrial-magenta hover:bg-industrial-magenta hover:text-black transition-all active:scale-[0.98]"
            >
              <span className="w-2 h-2 bg-industrial-magenta animate-ping rounded-full" />
              ABORT BATCH
            </button>
          )}
        </div>
      </div>

      {/* ── Right Panel: File Queue ───────────────────────────── */}
      <div className="flex-1 bg-industrial-panel border border-industrial-border flex flex-col overflow-hidden">

        {/* Queue header */}
        <div className="p-4 border-b border-industrial-border flex items-center justify-between bg-black/20">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 ${isProcessing ? 'bg-industrial-amber animate-pulse' : 'bg-industrial-cyan'}`} />
            <h3 className="text-xs font-bold text-white tracking-widest uppercase">File Queue</h3>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono">
            <button
              onClick={fetchQueue}
              disabled={isProcessing || loadingQueue}
              className="text-industrial-text-dim hover:text-white flex items-center gap-1 transition-colors"
              title="Aggiorna coda"
            >
              <FolderSync className="w-3 h-3" />
              <span>REFRESH</span>
            </button>
            <span className="text-industrial-text-dim uppercase">
              Total: <span className="text-white">{totalCount}</span>
            </span>
            <span className="text-industrial-text-dim uppercase">
              Processed: <span className="text-industrial-cyan">{processedCount}</span>
            </span>
          </div>
        </div>

        {/* Progress Bar Active */}
        {isProcessing && (
          <div className="bg-industrial-bg border-b border-industrial-border p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3 truncate">
                <FileAudio className="w-4 h-4 text-industrial-amber shrink-0 animate-pulse" />
                <span className="text-xs font-mono text-white truncate">
                  {currentFileName || 'Elaborazione in corso...'}
                </span>
              </div>
              <span className="text-xs font-mono text-industrial-amber shrink-0 font-bold ml-4">
                {progress}%
              </span>
            </div>
            <div className="h-1.5 bg-industrial-border w-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                className="h-full bg-industrial-amber"
              />
            </div>
          </div>
        )}

        {/* Queue list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {queue.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-8">
              <FileAudio className="w-12 h-12 text-industrial-border mb-4" />
              <p className="font-mono text-xs text-white uppercase tracking-widest mb-1">
                {!workspacePath ? 'Nessun Workspace Selezionato' : 'Coda Conformer Vuota'}
              </p>
              <p className="font-mono text-[10px] text-industrial-text-dim uppercase tracking-wider max-w-sm">
                {!workspacePath
                  ? 'Seleziona una libreria audio nel modulo Hub per caricare i brani.'
                  : 'Tutti i file della libreria risultano già conformati o esclusi.'}
              </p>
            </div>
          ) : (
            queue.map((item) => {
              const isProcessed = processedIds.has(item.id);
              const isFailed = failedIds.has(item.id);
              const isCurrent = isProcessing && currentFileName === item.filename;

              return (
                <div
                  key={item.id}
                  className={`border p-3 flex items-center justify-between transition-all duration-200 ${
                    isCurrent
                      ? 'bg-industrial-bg border-l-4 border-industrial-amber border-industrial-border'
                      : isProcessed
                      ? 'bg-industrial-panel border-industrial-border opacity-70'
                      : isFailed
                      ? 'bg-industrial-red/10 border-industrial-red'
                      : 'bg-black/30 border-industrial-border/60 hover:border-industrial-text-dim/50'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    {isProcessed ? (
                      <CheckCircle2 className="w-4 h-4 text-industrial-cyan shrink-0" />
                    ) : isFailed ? (
                      <AlertCircle className="w-4 h-4 text-industrial-red shrink-0" />
                    ) : (
                      <FileAudio className={`w-4 h-4 shrink-0 ${isCurrent ? 'text-industrial-amber' : 'text-industrial-text-dim'}`} />
                    )}
                    <div className="flex flex-col truncate">
                      <span className={`text-[11px] font-bold uppercase tracking-wider truncate ${isCurrent ? 'text-industrial-amber' : 'text-white'}`}>
                        {item.filename}
                      </span>
                      <span className="text-[9px] font-mono text-industrial-text-dim uppercase">
                        {item.sampleRate ? `${(item.sampleRate / 1000).toFixed(1)}kHz` : '--'} / {item.bitrate ? `${Math.round(item.bitrate / 1000)}kbps` : '--'} / {formatDuration(item.durationSecs)}
                      </span>
                    </div>
                  </div>

                  <span className={`text-[9px] font-mono px-2 py-0.5 uppercase shrink-0 ${
                    isCurrent
                      ? 'text-industrial-amber bg-industrial-amber/10 animate-pulse'
                      : isProcessed
                      ? 'text-industrial-cyan bg-industrial-cyan/10'
                      : isFailed
                      ? 'text-industrial-red bg-industrial-red/20'
                      : 'text-industrial-text-dim bg-industrial-panel'
                  }`}>
                    {isCurrent ? 'Active' : isProcessed ? 'Conformed' : isFailed ? 'Failed' : 'Pending'}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Broadcast Loudness Telemetry Monitor */}
        <div className="bg-black/80 border-t border-industrial-border p-3 flex items-center justify-between gap-4 font-mono text-[9px] select-none">
          <div className="flex items-center gap-3">
            <span className="text-industrial-text-dim/60 uppercase">TARGET LEVEL:</span>
            <span className="px-2 py-0.5 bg-industrial-cyan/10 border border-industrial-cyan/30 text-industrial-cyan font-bold rounded">
              {selectedPreset === 'PODCAST' ? '-16.0 LUFS (WEB/PODCAST)' : '-23.0 LUFS (EBU R128)'}
            </span>
            <span className="text-industrial-text-dim/60 uppercase">TRUE PEAK:</span>
            <span className="text-white font-bold">-1.0 dBTP CEILING</span>
          </div>

          {/* LUFS Meter bar representation */}
          <div className="flex items-center gap-2 flex-1 max-w-xs">
            <span className="text-slate-500 text-[8px]">-36</span>
            <div className="h-2 w-full bg-[#12141a] rounded overflow-hidden flex border border-industrial-border">
              <div style={{ width: selectedPreset === 'PODCAST' ? '70%' : '52%' }} className="bg-gradient-to-r from-industrial-green via-industrial-cyan to-industrial-amber h-full transition-all duration-300" />
            </div>
            <span className="text-slate-500 text-[8px]">0 dB</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-industrial-green glow-green-led" />
            <span className="text-industrial-green font-bold uppercase">ITU-R BS.1770-4 COMPLIANT</span>
          </div>
        </div>
      </div>

    </div>
  );
}
