import { useState } from 'react';
import { motion } from 'framer-motion';
import { Layers, RefreshCcw, Settings2, FileAudio, CheckCircle2, Zap } from 'lucide-react';
import { useAppStore } from '../../store/appStore';

interface Preset {
  id: string;
  label: string;
  desc: string;
}

const PRESETS: Preset[] = [
  { id: 'Podcast',  label: 'Podcast Master',  desc: 'Voice-forward, -16 LUFS'  },
  { id: 'RadioSTD', label: 'Radio Standard',  desc: 'FM Compression, -14 LUFS' },
  { id: 'RadioHQ',  label: 'Radio High-End',  desc: 'DAB+ Optimized, -12 LUFS' },
  { id: 'TV',       label: 'TV Broadcast',    desc: 'EBU R128 Compliant'       },
  { id: 'Cinema',   label: 'Cinema Mix',      desc: 'High Dynamic Range'       },
];

interface ConformerToggles {
  standardize:   boolean;
  normalization: boolean;
  trimming:      boolean;
}

interface ToggleRowProps {
  label: string;
  sub: string;
  checked: boolean;
  onToggle: () => void;
}

function ToggleRow({ label, sub, checked, onToggle }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between group">
      <div className="flex flex-col">
        <span className="text-[11px] font-bold text-white uppercase tracking-wider">{label}</span>
        <span className="text-[9px] text-industrial-text-dim uppercase">{sub}</span>
      </div>
      <button
        onClick={onToggle}
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

export function ConformerModule() {
  const { addLog } = useAppStore();
  const [selectedPreset, setSelectedPreset] = useState('Podcast');
  const [toggles, setToggles] = useState<ConformerToggles>({
    standardize:   true,
    normalization: true,
    trimming:      false,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggle = (key: keyof ConformerToggles) =>
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));

  const startProcessing = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setProgress(0);
    addLog('info', 'Batch processing started: 12 files in queue.');
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsProcessing(false);
          addLog('success', 'Batch processing completed successfully.');
          return 100;
        }
        return prev + 2;
      });
    }, 100);
  };

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
                Audio Alignment Engine v2.4
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-mono border-b border-industrial-border pb-1">
              <span className="text-industrial-text-dim uppercase">Engine Status</span>
              <span className="text-industrial-cyan uppercase">Ready</span>
            </div>
            <div className="flex justify-between text-[10px] font-mono border-b border-industrial-border pb-1">
              <span className="text-industrial-text-dim uppercase">Input Buffer</span>
              <span className="text-white uppercase">128.4 MB</span>
            </div>
            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-industrial-text-dim uppercase">Output Format</span>
              <span className="text-white uppercase">MP3 / 192kbps CBR</span>
            </div>
          </div>
        </div>

        {/* Radio Presets */}
        <div className="bg-industrial-panel border border-industrial-border p-6">
          <h3 className="text-xs font-bold text-white tracking-widest uppercase flex items-center gap-2 mb-6">
            <RefreshCcw className="w-3 h-3 text-industrial-cyan" />
            Radio Presets
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setSelectedPreset(preset.id)}
                className={`text-left p-3 border transition-all ${
                  selectedPreset === preset.id
                    ? 'border-industrial-cyan bg-industrial-cyan/10'
                    : 'border-industrial-border hover:border-industrial-text-dim/50 bg-black/40'
                }`}
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
              Auto-save: ON
            </span>
          </div>
          <div className="space-y-6">
            <ToggleRow
              label="Standardize"
              sub="Match sample rate & bit depth"
              checked={toggles.standardize}
              onToggle={() => toggle('standardize')}
            />
            <ToggleRow
              label="Loudness Normalization"
              sub="Target: -23 LUFS (EBU R128)"
              checked={toggles.normalization}
              onToggle={() => toggle('normalization')}
            />
            <ToggleRow
              label="Silent Trimming"
              sub="Remove silence from start/end"
              checked={toggles.trimming}
              onToggle={() => toggle('trimming')}
            />
          </div>

          <button
            onClick={startProcessing}
            disabled={isProcessing}
            className={`w-full mt-8 py-4 flex items-center justify-center gap-3 font-black tracking-[0.2em] uppercase transition-all duration-300 ${
              isProcessing
                ? 'bg-industrial-border text-industrial-text-dim cursor-not-allowed'
                : 'bg-industrial-amber text-black hover:bg-white active:scale-[0.98]'
            }`}
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-industrial-text-dim border-t-white rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Zap className="w-5 h-5 fill-current" />
                Start Batch Processing
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Right Panel: File Queue ───────────────────────────── */}
      <div className="flex-1 bg-industrial-panel border border-industrial-border flex flex-col overflow-hidden">

        {/* Queue header */}
        <div className="p-4 border-b border-industrial-border flex items-center justify-between bg-black/20">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-industrial-amber animate-pulse" />
            <h3 className="text-xs font-bold text-white tracking-widest uppercase">File Queue</h3>
          </div>
          <div className="flex items-center gap-4 text-[10px] font-mono">
            <span className="text-industrial-text-dim uppercase">
              Total: <span className="text-white">12</span>
            </span>
            <span className="text-industrial-text-dim uppercase">
              Processed: <span className="text-industrial-cyan">8</span>
            </span>
          </div>
        </div>

        {/* Queue list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">

          {/* Active item */}
          <div className="bg-industrial-bg border-l-4 border-industrial-amber p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <FileAudio className="w-5 h-5 text-industrial-amber" />
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                    VOCAL_TRACK_09.wav
                  </span>
                  <span className="text-[9px] text-industrial-text-dim uppercase">
                    48kHz / 24-bit / 03:42
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-mono text-industrial-amber bg-industrial-amber/10 px-2 py-0.5 uppercase">
                Active
              </span>
            </div>
            <div className="h-1 bg-industrial-border w-full">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                className="h-full bg-industrial-amber"
              />
            </div>
            <div className="flex justify-between mt-2 text-[9px] font-mono text-industrial-text-dim uppercase">
              <span>Processing alignment...</span>
              <span>{progress}%</span>
            </div>
          </div>

          {/* Pending items */}
          {[10, 11, 12].map((num) => (
            <div
              key={num}
              className="bg-industrial-panel border border-industrial-border p-4 flex items-center justify-between opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-300"
            >
              <div className="flex items-center gap-3">
                <FileAudio className="w-5 h-5 text-industrial-text-dim" />
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                    VOCAL_TRACK_{num}.wav
                  </span>
                  <span className="text-[9px] text-industrial-text-dim uppercase">Waiting in queue</span>
                </div>
              </div>
              <span className="text-[10px] font-mono text-industrial-text-dim uppercase">Pending</span>
            </div>
          ))}

          {/* Completed items */}
          {[8, 7, 6, 5].map((num) => (
            <div
              key={num}
              className="bg-industrial-panel border border-industrial-border p-4 flex items-center justify-between opacity-40"
            >
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-industrial-cyan" />
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                    VOCAL_TRACK_0{num}.wav
                  </span>
                  <span className="text-[9px] text-industrial-cyan uppercase">Conformed successfully</span>
                </div>
              </div>
              <span className="text-[10px] font-mono text-industrial-cyan uppercase">Done</span>
            </div>
          ))}
        </div>

        {/* Visualizer bar */}
        <div className="h-12 bg-black border-t border-industrial-border flex items-end justify-center gap-[2px] p-2 overflow-hidden">
          {Array.from({ length: 40 }).map((_, i) => (
            <motion.div
              key={i}
              animate={{
                height: isProcessing ? [4, 20 + (i % 7) * 5, 4] : 4,
              }}
              transition={{
                repeat: Infinity,
                duration: 0.4 + (i % 5) * 0.1,
                ease: 'easeInOut',
                delay: i * 0.02,
              }}
              className={`w-1.5 ${isProcessing ? 'bg-industrial-amber' : 'bg-industrial-border'}`}
            />
          ))}
        </div>
      </div>

    </div>
  );
}
