import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eraser, Search, Activity } from 'lucide-react';
import { useAppStore } from '../../store/appStore';

type CleanerStep = 1 | 2 | 3;

interface DuplicatePair {
  id: string;
  fileA: string;
  fileB: string;
  score: number;
  scoreType: string;
  size: string;
  date: string;
}

const MOCK_PAIRS: DuplicatePair[] = [
  { id: 'pair-1', fileA: 'Ambience_Forest_Loop.wav',  fileB: 'Forest_Amb_Copy.wav',  score: 98,  scoreType: 'ACOUSTIC', size: '42.5 MB', date: '2026-01-12' },
  { id: 'pair-2', fileA: 'Sword_Clash_04.mp3',        fileB: 'Sword_Hit_Alt.mp3',    score: 92,  scoreType: 'ACOUSTIC', size: '1.2 MB',  date: '2026-02-05' },
  { id: 'pair-3', fileA: 'UI_Click_Modern.wav',       fileB: 'UI_Click_Backup.wav',  score: 100, scoreType: 'BINARY',   size: '0.4 MB',  date: '2026-03-15' },
];

export function CleanerModule() {
  const { addLog } = useAppStore();
  const [step, setStep] = useState<CleanerStep>(1);
  const [pairs] = useState<DuplicatePair[]>(MOCK_PAIRS);
  const [selectedPairId, setSelectedPairId] = useState<string | null>('pair-1');

  const selectedPair = pairs.find((p) => p.id === selectedPairId) ?? null;

  const goToStep = (s: CleanerStep, logMsg: string) => {
    addLog('info', logMsg);
    setStep(s);
  };

  const STEPS = [
    { step: 1 as CleanerStep, label: 'SCAN',    desc: 'Acoustic Fingerprinting' },
    { step: 2 as CleanerStep, label: 'REVIEW',  desc: 'Conflict Analysis'       },
    { step: 3 as CleanerStep, label: 'RESOLVE', desc: 'Binary Resolution'       },
  ];

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
                Sanitization Pipeline v3.0
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-industrial-text-dim uppercase">Status:</span>
            <span className={`text-[10px] font-mono uppercase font-bold ${
              step === 1 ? 'text-industrial-cyan' : 'text-industrial-amber'
            }`}>
              {step === 1 ? 'Awaiting Scan' : step === 2 ? 'Reviewing Conflicts' : 'Resolution Active'}
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
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 border-t-2 border-industrial-amber rounded-full"
            />
            <Search className="w-10 h-10 text-industrial-amber" />
          </div>
          <h3 className="text-3xl font-black uppercase tracking-tighter mb-4">Initialize Deep Scan</h3>
          <p className="max-w-md text-industrial-text-dim text-sm mb-8 leading-relaxed">
            The engine will perform binary matching and acoustic fingerprinting across your library to identify redundant data.
          </p>
          <button
            onClick={() => goToStep(2, 'Initializing library scan...')}
            className="bg-industrial-amber text-black px-12 py-4 font-bold text-xs uppercase tracking-widest hover:bg-white transition-all glow-amber active:scale-95"
          >
            Start Analysis
          </button>
        </motion.div>
      )}

      {/* ── Step 2: Review ───────────────────────────────────── */}
      {step === 2 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-8"
        >
          {/* Conflict List */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-black p-4 border border-industrial-border flex items-center justify-between">
              <span className="text-[10px] font-mono text-industrial-text-dim uppercase">
                Conflicts Detected
              </span>
              <span className="text-xs font-mono font-bold text-industrial-amber">{pairs.length}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToStep(3, 'Bulk resolution: Keeping all Source A files.')}
                  className="text-[9px] font-mono text-industrial-cyan hover:underline uppercase"
                >
                  Resolve All (A)
                </button>
                <span className="text-industrial-border">|</span>
                <button
                  onClick={() => goToStep(3, 'Bulk resolution: Keeping all Source B files.')}
                  className="text-[9px] font-mono text-industrial-amber hover:underline uppercase"
                >
                  Resolve All (B)
                </button>
              </div>
            </div>

            <div className="space-y-2 h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {pairs.map((pair) => (
                <button
                  key={pair.id}
                  onClick={() => setSelectedPairId(pair.id)}
                  className={`w-full p-4 border text-left transition-all group ${
                    selectedPairId === pair.id
                      ? 'border-industrial-amber bg-industrial-amber/5'
                      : 'border-industrial-border hover:border-industrial-text-dim/50 bg-industrial-panel'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-mono text-industrial-cyan uppercase">
                      {pair.score}% Match
                    </span>
                    <span className="text-[8px] font-mono text-industrial-text-dim uppercase">
                      {pair.scoreType}
                    </span>
                  </div>
                  <div className="text-[11px] font-bold text-white truncate mb-1 uppercase tracking-wider">
                    {pair.fileA}
                  </div>
                  <div className="text-[9px] font-mono text-industrial-text-dim truncate uppercase">
                    {pair.fileB}
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => goToStep(3, 'Proceeding to resolution console.')}
              className="w-full bg-industrial-cyan text-black py-4 font-bold text-xs uppercase tracking-widest hover:brightness-110 transition-all glow-cyan"
            >
              Proceed to Resolution
            </button>
          </div>

          {/* Comparison View */}
          <div className="lg:col-span-8 space-y-6">
            {selectedPair ? (
              <>
                {/* Waveform Comparison */}
                <div className="bg-industrial-panel border border-industrial-border p-6">
                  <h3 className="text-xs font-bold text-white tracking-widest uppercase mb-6 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-industrial-amber" />
                    Waveform Comparison
                  </h3>
                  <div className="space-y-8">
                    {/* Source A */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-mono uppercase">
                        <span className="text-industrial-cyan">Source A: {selectedPair.fileA}</span>
                        <span className="text-industrial-text-dim">{selectedPair.size}</span>
                      </div>
                      <div className="h-24 bg-black border border-industrial-border flex items-center justify-center gap-px p-2">
                        {Array.from({ length: 100 }).map((_, i) => (
                          <div
                            key={i}
                            className="w-1 bg-industrial-cyan/40"
                            style={{ height: `${(Math.sin(i * 0.3) * 40 + 50)}%` }}
                          />
                        ))}
                      </div>
                    </div>
                    {/* Source B */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-mono uppercase">
                        <span className="text-industrial-amber">Source B: {selectedPair.fileB}</span>
                        <span className="text-industrial-text-dim">{selectedPair.size}</span>
                      </div>
                      <div className="h-24 bg-black border border-industrial-border flex items-center justify-center gap-px p-2">
                        {Array.from({ length: 100 }).map((_, i) => (
                          <div
                            key={i}
                            className="w-1 bg-industrial-amber/40"
                            style={{ height: `${(Math.sin(i * 0.3 + 0.5) * 40 + 50)}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Metadata Delta */}
                <div className="bg-industrial-panel border border-industrial-border p-6">
                  <h3 className="text-xs font-bold text-white tracking-widest uppercase mb-4">
                    Metadata Delta
                  </h3>
                  <div className="grid grid-cols-2 gap-px bg-industrial-border">
                    <div className="bg-black p-3 text-[10px] font-mono text-industrial-text-dim uppercase">Property</div>
                    <div className="bg-black p-3 text-[10px] font-mono text-industrial-text-dim uppercase">Status</div>
                    <div className="bg-industrial-bg p-3 text-[10px] font-mono uppercase">Sample Rate</div>
                    <div className="bg-industrial-bg p-3 text-[10px] font-mono text-industrial-cyan uppercase">MATCH</div>
                    <div className="bg-industrial-bg p-3 text-[10px] font-mono uppercase">Bit Depth</div>
                    <div className="bg-industrial-bg p-3 text-[10px] font-mono text-industrial-cyan uppercase">MATCH</div>
                    <div className="bg-industrial-bg p-3 text-[10px] font-mono uppercase">Duration</div>
                    <div className="bg-industrial-bg p-3 text-[10px] font-mono text-industrial-amber uppercase">
                      DELTA: 0.2s
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center border-2 border-dashed border-industrial-border text-industrial-text-dim uppercase font-mono text-xs">
                Select a conflict pair to analyze
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Step 3: Resolve ──────────────────────────────────── */}
      {step === 3 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-industrial-panel border border-industrial-border p-12 text-center"
        >
          <h3 className="text-4xl font-black uppercase tracking-tighter mb-8">Resolution Console</h3>
          <div className="max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            <div className="bg-black p-8 border border-industrial-border hover:border-industrial-cyan transition-all">
              <h4 className="text-xl font-bold uppercase mb-4 text-industrial-cyan">Keep Original (A)</h4>
              <p className="text-xs text-industrial-text-dim mb-6 uppercase leading-relaxed">
                Deletes all duplicates and preserves the primary file in the original directory.
              </p>
              <button
                onClick={() => {
                  addLog('success', 'Resolution applied: Kept Source A.');
                  setStep(1);
                }}
                className="w-full py-3 bg-industrial-cyan text-black font-bold text-[10px] uppercase tracking-widest hover:brightness-110 transition-all"
              >
                Execute A
              </button>
            </div>
            <div className="bg-black p-8 border border-industrial-border hover:border-industrial-amber transition-all">
              <h4 className="text-xl font-bold uppercase mb-4 text-industrial-amber">Keep Duplicate (B)</h4>
              <p className="text-xs text-industrial-text-dim mb-6 uppercase leading-relaxed">
                Replaces the original file with the duplicate version, potentially updating metadata.
              </p>
              <button
                onClick={() => {
                  addLog('success', 'Resolution applied: Kept Source B.');
                  setStep(1);
                }}
                className="w-full py-3 bg-industrial-amber text-black font-bold text-[10px] uppercase tracking-widest hover:brightness-110 transition-all"
              >
                Execute B
              </button>
            </div>
          </div>
          <button
            onClick={() => setStep(2)}
            className="text-industrial-text-dim text-[10px] font-mono uppercase hover:text-white transition-all underline underline-offset-4"
          >
            Return to Review
          </button>
        </motion.div>
      )}

    </div>
  );
}
