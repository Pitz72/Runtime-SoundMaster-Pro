import { Terminal } from 'lucide-react';
import { useAppStore } from '../../store/appStore';

function StatusDot({ ok, label }: { ok: boolean | null; label: string }) {
  const color =
    ok === null   ? 'bg-industrial-amber'
    : ok          ? 'bg-industrial-cyan'
    :               'bg-industrial-red';
  const text =
    ok === null   ? 'text-industrial-amber'
    : ok          ? 'text-industrial-cyan'
    :               'text-industrial-red';

  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 ${color} ${ok ? 'animate-pulse' : ''}`} />
      <span className={`font-mono text-[9px] uppercase tracking-widest ${text}`}>{label}</span>
    </div>
  );
}

export function TopBar() {
  const { systemStatus, workspacePath, toggleLogPanel } = useAppStore();

  const shortPath = workspacePath
    ? workspacePath.length > 52
      ? '…' + workspacePath.slice(-50)
      : workspacePath
    : null;

  const ffmpegOk  = systemStatus.initialized ? systemStatus.ffmpegFound  : null;
  const fpcalcOk  = systemStatus.initialized ? systemStatus.fpcalcFound  : null;
  const dbOk      = systemStatus.initialized ? !!systemStatus.db         : null;

  return (
    <header className="h-12 sticky top-0 bg-industrial-bg/80 backdrop-blur-md border-b border-industrial-border flex justify-between items-center px-8 z-40">

      {/* Left: workspace path */}
      <div className="flex items-center gap-3">
        {shortPath ? (
          <>
            <span className="font-mono text-[9px] text-industrial-text-dim/50 uppercase tracking-widest">WS</span>
            <span className="font-mono text-[10px] text-industrial-text truncate max-w-xs">{shortPath}</span>
          </>
        ) : (
          <span className="font-mono text-[9px] text-industrial-text-dim/40 uppercase tracking-widest italic">
            No workspace selected
          </span>
        )}
      </div>

      {/* Right: status pills + log toggle */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4">
          <StatusDot ok={dbOk}     label="DB"     />
          <StatusDot ok={ffmpegOk} label="FFmpeg" />
          <StatusDot ok={fpcalcOk} label="fpcalc" />
        </div>

        <div className="w-px h-4 bg-industrial-border" />

        <button
          onClick={toggleLogPanel}
          className="flex items-center gap-1.5 text-industrial-text-dim hover:text-industrial-amber transition-colors"
        >
          <Terminal className="w-4 h-4" />
          <span className="font-mono text-[9px] uppercase tracking-widest">Log</span>
        </button>
      </div>
    </header>
  );
}
