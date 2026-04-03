import { Settings, CheckCircle2, XCircle, AlertCircle, FolderOpen } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { open } from '@tauri-apps/plugin-dialog';

function InfoRow({ label, value, status }: { label: string; value: string; status?: 'ok' | 'error' | 'warn' | null }) {
  const icon =
    status === 'ok'    ? <CheckCircle2 className="w-3.5 h-3.5 text-industrial-cyan" />
    : status === 'error' ? <XCircle      className="w-3.5 h-3.5 text-industrial-red" />
    : status === 'warn'  ? <AlertCircle  className="w-3.5 h-3.5 text-industrial-amber" />
    : null;

  return (
    <div className="flex items-center justify-between py-2 border-b border-industrial-border/40 last:border-0">
      <span className="font-mono text-[10px] text-industrial-text-dim uppercase tracking-widest">{label}</span>
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-mono text-[10px] text-industrial-text truncate max-w-xs">{value}</span>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-mono font-bold text-industrial-amber tracking-[0.2em] uppercase mb-4 flex items-center gap-2">
      <span className="w-3 h-px bg-industrial-amber" />
      {children}
    </h3>
  );
}

export function SettingsModule() {
  const { systemStatus, workspacePath, setWorkspacePath, addLog } = useAppStore();

  const handleSelectWorkspace = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: 'Select default workspace' });
      if (selected && !Array.isArray(selected)) {
        setWorkspacePath(selected);
        addLog('success', 'Default workspace updated.', selected);
      }
    } catch (err) {
      addLog('error', 'Workspace selection failed', String(err));
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">

      {/* Header */}
      <div className="flex items-center gap-3 border-b border-industrial-border pb-6">
        <div className="w-10 h-10 bg-industrial-amber/10 border border-industrial-border flex items-center justify-center">
          <Settings className="w-5 h-5 text-industrial-amber" />
        </div>
        <div>
          <h2 className="text-3xl font-black font-sans tracking-tighter uppercase leading-none">Settings</h2>
          <p className="font-mono text-[10px] text-industrial-text-dim uppercase tracking-widest mt-1">
            System Configuration — v0.2.0
          </p>
        </div>
      </div>

      {/* System Dependencies */}
      <section className="bg-industrial-panel border border-industrial-border p-6">
        <SectionTitle>System Dependencies</SectionTitle>
        <div className="space-y-0">
          <InfoRow
            label="FFmpeg"
            value={
              systemStatus.ffmpegFound
                ? `${systemStatus.ffmpegVersion ?? 'detected'} — [${systemStatus.ffmpegSource}]`
                : 'Not found — required for The Conformer'
            }
            status={systemStatus.initialized ? (systemStatus.ffmpegFound ? 'ok' : 'error') : 'warn'}
          />
          <InfoRow
            label="fpcalc / Chromaprint"
            value={
              systemStatus.fpcalcFound
                ? `${systemStatus.fpcalcVersion ?? 'detected'} — [${systemStatus.fpcalcSource}]`
                : 'Not found — required for The Cleaner'
            }
            status={systemStatus.initialized ? (systemStatus.fpcalcFound ? 'ok' : 'error') : 'warn'}
          />
          <InfoRow
            label="SQLite"
            value={systemStatus.db ?? (systemStatus.initialized ? 'Error' : 'Pending...')}
            status={systemStatus.initialized ? (systemStatus.db ? 'ok' : 'error') : 'warn'}
          />
        </div>
        {(!systemStatus.ffmpegFound || !systemStatus.fpcalcFound) && systemStatus.initialized && (
          <p className="mt-4 font-mono text-[9px] text-industrial-text-dim/60 leading-relaxed">
            Place <span className="text-industrial-amber">ffmpeg</span> and <span className="text-industrial-amber">fpcalc</span> binaries
            in <span className="text-industrial-text">src-tauri/binaries/</span> or ensure they are on the system PATH.
          </p>
        )}
      </section>

      {/* Workspace */}
      <section className="bg-industrial-panel border border-industrial-border p-6">
        <SectionTitle>Default Workspace</SectionTitle>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-black border-b border-industrial-border px-3 py-2 font-mono text-[10px] text-industrial-text truncate">
            {workspacePath ?? <span className="text-industrial-text-dim/50 italic">Not configured</span>}
          </div>
          <button
            onClick={handleSelectWorkspace}
            className="flex items-center gap-2 px-4 py-2 border border-industrial-border hover:border-industrial-amber text-industrial-text-dim hover:text-industrial-amber transition-all text-[10px] font-bold uppercase tracking-widest"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Browse
          </button>
        </div>
      </section>

      {/* Output Format — read-only display of project spec */}
      <section className="bg-industrial-panel border border-industrial-border p-6">
        <SectionTitle>Conformer Output Format (Default)</SectionTitle>
        <div className="space-y-0">
          <InfoRow label="Format"      value="MP3 — CBR"        status={null} />
          <InfoRow label="Bitrate"     value="192 kbps"         status={null} />
          <InfoRow label="Sample Rate" value="44.1 kHz"         status={null} />
          <InfoRow label="Channels"    value="Stereo"           status={null} />
          <InfoRow label="Loudness"    value="EBU R128 / -23 LUFS" status={null} />
        </div>
        <p className="mt-4 font-mono text-[9px] text-industrial-text-dim/50">
          Output format is fixed per project spec. Custom preset support planned for v1.0.
        </p>
      </section>

      {/* App Info */}
      <section className="bg-industrial-panel border border-industrial-border p-6">
        <SectionTitle>Application</SectionTitle>
        <div className="space-y-0">
          <InfoRow label="Product"    value="Runtime SoundMaster Pro"       status={null} />
          <InfoRow label="Version"    value="0.2.0"                          status={null} />
          <InfoRow label="Identifier" value="it.runtimeradio.soundmasterpro" status={null} />
          <InfoRow label="Engine"     value="Tauri v2 + Rust"                status={null} />
          <InfoRow label="UI"         value="React 19 + Tailwind CSS 4"       status={null} />
        </div>
      </section>

    </div>
  );
}
