import { useState, useEffect } from 'react';
import { Terminal, HardDrive } from 'lucide-react';
import { useAppStore } from '../../store/appStore';

export function TopBar() {
  const { systemStatus, workspacePath, toggleLogPanel, appVersion, logs } = useAppStore();
  const [clock, setClock] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const utcString = now.toUTCString().split(' ')[4] + ' UTC';
      setClock(utcString);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const shortPath = workspacePath
    ? workspacePath.length > 48
      ? '…' + workspacePath.slice(-46)
      : workspacePath
    : null;

  const dbOk = systemStatus.initialized ? !!systemStatus.db : null;
  const ffmpegOk = systemStatus.initialized ? systemStatus.ffmpegFound : null;
  const fpcalcOk = systemStatus.initialized ? systemStatus.fpcalcFound : null;

  return (
    <header className="h-12 bg-industrial-panel border-b border-industrial-border flex items-center justify-between px-4 z-40 select-none shrink-0">
      
      {/* Left: Branding & Core Spec */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-industrial-cyan rounded-sm glow-cyan-led animate-pulse" />
          <h1 className="font-display font-black text-sm tracking-widest uppercase text-white">
            SOUNDMASTER <span className="text-industrial-amber">PRO</span>
          </h1>
          <span className="font-mono text-[9px] px-1.5 py-0.5 bg-industrial-bg border border-industrial-border text-industrial-text-dim rounded">
            v{appVersion} // BROADCAST CORE
          </span>
        </div>
      </div>

      {/* Center: Recessed Active Workspace Display */}
      <div className="flex items-center gap-2.5 bg-industrial-bg px-3.5 py-1.5 border border-industrial-border rounded recessed-display max-w-lg">
        <HardDrive className="w-3.5 h-3.5 text-industrial-amber shrink-0" />
        <span className="font-mono text-[9px] text-industrial-amber font-bold tracking-wider uppercase shrink-0">WS:</span>
        <span className="font-mono text-[10px] text-industrial-text truncate">
          {shortPath ?? <span className="text-industrial-text-dim/50 italic">No workspace selected</span>}
        </span>
        {workspacePath && (
          <span className="w-1.5 h-1.5 rounded-full bg-industrial-green glow-green-led shrink-0" />
        )}
      </div>

      {/* Right: Hardware Engine Status, UTC Clock & Telemetry Drawer Trigger */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3.5 text-[9px] font-mono">
          <div className="flex items-center gap-1.5" title="SQLite WAL Engine">
            <span className={`w-2 h-2 rounded-full ${dbOk ? 'bg-industrial-green glow-green-led' : 'bg-industrial-amber'}`} />
            <span className={dbOk ? 'text-slate-300' : 'text-industrial-text-dim'}>DB: {dbOk ? 'OK' : 'BOOT'}</span>
          </div>

          <div className="flex items-center gap-1.5" title="FFmpeg 7.x Engine">
            <span className={`w-2 h-2 rounded-full ${ffmpegOk ? 'bg-industrial-cyan glow-cyan-led' : 'bg-industrial-red glow-red-led'}`} />
            <span className={ffmpegOk ? 'text-slate-300' : 'text-industrial-red'}>FFMPEG: {ffmpegOk ? 'READY' : 'OFF'}</span>
          </div>

          <div className="flex items-center gap-1.5" title="Chromaprint fpcalc Acoustic Fingerprinter">
            <span className={`w-2 h-2 rounded-full ${fpcalcOk ? 'bg-industrial-amber glow-amber-led' : 'bg-industrial-text-dim'}`} />
            <span className={fpcalcOk ? 'text-slate-300' : 'text-industrial-text-dim'}>FPCALC: {fpcalcOk ? 'ACTIVE' : 'OFF'}</span>
          </div>
        </div>

        <div className="h-4 w-px bg-industrial-border" />

        {/* Live Broadcast UTC Clock */}
        <div className="flex items-center gap-1.5 bg-industrial-surface border border-industrial-border px-2.5 py-1 rounded">
          <span className="font-mono text-[11px] font-bold text-industrial-amber">{clock || '00:00:00 UTC'}</span>
          <span className="text-[8px] font-mono text-industrial-text-dim uppercase">AIR</span>
        </div>

        {/* Telemetry Log Toggle */}
        <button
          onClick={toggleLogPanel}
          className="flex items-center gap-1.5 px-2.5 py-1 border border-industrial-border hover:border-industrial-amber hover:text-industrial-amber text-industrial-text-dim transition-colors rounded text-[9px] font-mono uppercase"
          title="Mostra / Nascondi Mission Telemetry"
        >
          <Terminal className="w-3 h-3 text-industrial-cyan" />
          <span>LOG ({logs.length})</span>
        </button>
      </div>

    </header>
  );
}
