import { useState } from 'react';
import { Settings, CheckCircle2, XCircle, AlertCircle, FolderOpen, Terminal, RotateCcw, Wrench } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

interface BinaryTestResult {
  found: boolean;
  path: string | null;
  version: string | null;
  source: string | null;
}

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
  const { systemStatus, setSystemStatus, workspacePath, setWorkspacePath, addLog, appVersion } = useAppStore();

  const [ffmpegInput, setFfmpegInput] = useState<string>(
    localStorage.getItem('custom_ffmpeg_path') || systemStatus.ffmpegPath || ''
  );
  const [ffprobeInput, setFfprobeInput] = useState<string>(
    localStorage.getItem('custom_ffprobe_path') || systemStatus.ffprobePath || ''
  );
  const [fpcalcInput, setFpcalcInput] = useState<string>(
    localStorage.getItem('custom_fpcalc_path') || systemStatus.fpcalcPath || ''
  );

  const [testingBinary, setTestingBinary] = useState<string | null>(null);

  const handleSelectWorkspace = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: 'Select default workspace' });
      if (selected && !Array.isArray(selected)) {
        setWorkspacePath(selected);
        addLog('success', 'Default workspace updated.', selected);
        addLog('info', 'Detection results were reset. Run a scan from the Hub or Cleaner to index this workspace.');
      }
    } catch (err) {
      addLog('error', 'Workspace selection failed', String(err));
    }
  };

  const handleBrowseBinary = async (setter: (val: string) => void) => {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        title: 'Seleziona eseguibile binario',
        filters: [{ name: 'Eseguibile', extensions: ['exe', ''] }],
      });
      if (selected && !Array.isArray(selected)) {
        setter(selected);
      }
    } catch (err) {
      addLog('error', 'File selection failed', String(err));
    }
  };

  const handleTestAndSaveFfmpeg = async () => {
    if (!ffmpegInput.trim()) return;
    setTestingBinary('ffmpeg');
    try {
      const res = await invoke<BinaryTestResult>('test_custom_ffmpeg', { path: ffmpegInput.trim() });
      if (res.found) {
        localStorage.setItem('custom_ffmpeg_path', res.path || ffmpegInput.trim());
        setSystemStatus({
          ffmpegFound: true,
          ffmpegPath: res.path,
          ffmpegVersion: res.version,
          ffmpegSource: res.source,
        });
        addLog('success', 'Custom FFmpeg validated & applied', res.version || res.path || undefined);
      } else {
        addLog('error', 'FFmpeg verification failed', `Binary at "${ffmpegInput}" is invalid or unresponsive.`);
      }
    } catch (err) {
      addLog('error', 'FFmpeg test error', String(err));
    } finally {
      setTestingBinary(null);
    }
  };

  const handleResetFfmpeg = async () => {
    localStorage.removeItem('custom_ffmpeg_path');
    try {
      const res = await invoke<BinaryTestResult>('detect_ffmpeg_cmd');
      setFfmpegInput(res.path || '');
      setSystemStatus({
        ffmpegFound: res.found,
        ffmpegPath: res.path,
        ffmpegVersion: res.version,
        ffmpegSource: res.source,
      });
      addLog('info', 'FFmpeg path reset to auto-detection');
    } catch (e) {
      addLog('error', 'Reset FFmpeg failed', String(e));
    }
  };

  const handleTestAndSaveFfprobe = async () => {
    if (!ffprobeInput.trim()) return;
    setTestingBinary('ffprobe');
    try {
      const res = await invoke<BinaryTestResult>('test_custom_ffprobe', { path: ffprobeInput.trim() });
      if (res.found) {
        localStorage.setItem('custom_ffprobe_path', res.path || ffprobeInput.trim());
        setSystemStatus({
          ffprobeFound: true,
          ffprobePath: res.path,
          ffprobeVersion: res.version,
          ffprobeSource: res.source,
        });
        addLog('success', 'Custom FFprobe validated & applied', res.version || res.path || undefined);
      } else {
        addLog('error', 'FFprobe verification failed', `Binary at "${ffprobeInput}" is invalid or unresponsive.`);
      }
    } catch (err) {
      addLog('error', 'FFprobe test error', String(err));
    } finally {
      setTestingBinary(null);
    }
  };

  const handleResetFfprobe = async () => {
    localStorage.removeItem('custom_ffprobe_path');
    try {
      const res = await invoke<BinaryTestResult>('detect_ffprobe_cmd');
      setFfprobeInput(res.path || '');
      setSystemStatus({
        ffprobeFound: res.found,
        ffprobePath: res.path,
        ffprobeVersion: res.version,
        ffprobeSource: res.source,
      });
      addLog('info', 'FFprobe path reset to auto-detection');
    } catch (e) {
      addLog('error', 'Reset FFprobe failed', String(e));
    }
  };

  const handleTestAndSaveFpcalc = async () => {
    if (!fpcalcInput.trim()) return;
    setTestingBinary('fpcalc');
    try {
      const res = await invoke<BinaryTestResult>('test_custom_fpcalc', { path: fpcalcInput.trim() });
      if (res.found) {
        localStorage.setItem('custom_fpcalc_path', res.path || fpcalcInput.trim());
        setSystemStatus({
          fpcalcFound: true,
          fpcalcPath: res.path,
          fpcalcVersion: res.version,
          fpcalcSource: res.source,
        });
        addLog('success', 'Custom fpcalc validated & applied', res.version || res.path || undefined);
      } else {
        addLog('error', 'fpcalc verification failed', `Binary at "${fpcalcInput}" is invalid or unresponsive.`);
      }
    } catch (err) {
      addLog('error', 'fpcalc test error', String(err));
    } finally {
      setTestingBinary(null);
    }
  };

  const handleResetFpcalc = async () => {
    localStorage.removeItem('custom_fpcalc_path');
    try {
      const res = await invoke<BinaryTestResult>('detect_fpcalc_cmd');
      setFpcalcInput(res.path || '');
      setSystemStatus({
        fpcalcFound: res.found,
        fpcalcPath: res.path,
        fpcalcVersion: res.version,
        fpcalcSource: res.source,
      });
      addLog('info', 'fpcalc path reset to auto-detection');
    } catch (e) {
      addLog('error', 'Reset fpcalc failed', String(e));
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
            System Configuration — v{appVersion}
          </p>
        </div>
      </div>

      {/* System Dependencies Status */}
      <section className="bg-industrial-panel border border-industrial-border p-6">
        <SectionTitle>System Dependencies Status</SectionTitle>
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
            label="FFprobe"
            value={
              systemStatus.ffprobeFound
                ? `${systemStatus.ffprobeVersion ?? 'detected'} — [${systemStatus.ffprobeSource}]`
                : 'Not found — video/corrupt checks skipped'
            }
            status={systemStatus.initialized ? (systemStatus.ffprobeFound ? 'ok' : 'warn') : 'warn'}
          />
          <InfoRow
            label="fpcalc / Chromaprint"
            value={
              systemStatus.fpcalcFound
                ? `${systemStatus.fpcalcVersion ?? 'detected'} — [${systemStatus.fpcalcSource}]`
                : 'Not found — acoustic duplicate check skipped'
            }
            status={systemStatus.initialized ? (systemStatus.fpcalcFound ? 'ok' : 'warn') : 'warn'}
          />
          <InfoRow
            label="SQLite"
            value={systemStatus.db ?? (systemStatus.initialized ? 'Error' : 'Pending...')}
            status={systemStatus.initialized ? (systemStatus.db ? 'ok' : 'error') : 'warn'}
          />
        </div>
      </section>

      {/* Custom Executable Paths (CRIT-09 Resolved) */}
      <section className="bg-industrial-panel border border-industrial-border p-6 space-y-5">
        <div className="flex items-center justify-between">
          <SectionTitle>Custom Executable Paths</SectionTitle>
          <span className="text-[9px] font-mono text-industrial-cyan uppercase">Air-Gapped &amp; Portable Support</span>
        </div>
        <p className="font-mono text-[10px] text-industrial-text-dim leading-relaxed -mt-2">
          Specifica percorsi personalizzati verso i binari esterni se non sono inclusi nel PATH di sistema o nella cartella di installazione.
        </p>

        {/* FFmpeg Path */}
        <div className="space-y-1.5 border-t border-industrial-border/40 pt-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold text-white uppercase flex items-center gap-1.5">
              <Terminal className="w-3 h-3 text-industrial-amber" /> FFmpeg Path
            </span>
            {localStorage.getItem('custom_ffmpeg_path') && (
              <span className="text-[8px] font-mono text-industrial-amber uppercase">[Custom Override]</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={ffmpegInput}
              onChange={(e) => setFfmpegInput(e.target.value)}
              placeholder="es. C:\ffmpeg\bin\ffmpeg.exe"
              className="flex-1 bg-black border border-industrial-border px-3 py-1.5 font-mono text-[10px] text-industrial-text focus:border-industrial-amber focus:outline-none"
            />
            <button
              onClick={() => handleBrowseBinary(setFfmpegInput)}
              className="px-3 py-1.5 border border-industrial-border text-industrial-text-dim hover:text-white text-[9px] font-mono uppercase"
              title="Sfoglia file"
            >
              Browse
            </button>
            <button
              onClick={handleTestAndSaveFfmpeg}
              disabled={testingBinary === 'ffmpeg'}
              className="px-3 py-1.5 bg-industrial-amber text-black font-bold text-[9px] font-mono uppercase hover:bg-white transition-all disabled:opacity-50"
            >
              {testingBinary === 'ffmpeg' ? 'Testing...' : 'Test & Save'}
            </button>
            <button
              onClick={handleResetFfmpeg}
              className="p-1.5 border border-industrial-border text-industrial-text-dim hover:text-industrial-amber transition-all"
              title="Ripristina rilevamento automatico"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* FFprobe Path */}
        <div className="space-y-1.5 border-t border-industrial-border/40 pt-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold text-white uppercase flex items-center gap-1.5">
              <Terminal className="w-3 h-3 text-industrial-cyan" /> FFprobe Path
            </span>
            {localStorage.getItem('custom_ffprobe_path') && (
              <span className="text-[8px] font-mono text-industrial-amber uppercase">[Custom Override]</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={ffprobeInput}
              onChange={(e) => setFfprobeInput(e.target.value)}
              placeholder="es. C:\ffmpeg\bin\ffprobe.exe"
              className="flex-1 bg-black border border-industrial-border px-3 py-1.5 font-mono text-[10px] text-industrial-text focus:border-industrial-cyan focus:outline-none"
            />
            <button
              onClick={() => handleBrowseBinary(setFfprobeInput)}
              className="px-3 py-1.5 border border-industrial-border text-industrial-text-dim hover:text-white text-[9px] font-mono uppercase"
              title="Sfoglia file"
            >
              Browse
            </button>
            <button
              onClick={handleTestAndSaveFfprobe}
              disabled={testingBinary === 'ffprobe'}
              className="px-3 py-1.5 bg-industrial-cyan text-black font-bold text-[9px] font-mono uppercase hover:bg-white transition-all disabled:opacity-50"
            >
              {testingBinary === 'ffprobe' ? 'Testing...' : 'Test & Save'}
            </button>
            <button
              onClick={handleResetFfprobe}
              className="p-1.5 border border-industrial-border text-industrial-text-dim hover:text-industrial-cyan transition-all"
              title="Ripristina rilevamento automatico"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* fpcalc Path */}
        <div className="space-y-1.5 border-t border-industrial-border/40 pt-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold text-white uppercase flex items-center gap-1.5">
              <Wrench className="w-3 h-3 text-industrial-magenta" /> fpcalc Path
            </span>
            {localStorage.getItem('custom_fpcalc_path') && (
              <span className="text-[8px] font-mono text-industrial-amber uppercase">[Custom Override]</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={fpcalcInput}
              onChange={(e) => setFpcalcInput(e.target.value)}
              placeholder="es. C:\chromaprint\fpcalc.exe"
              className="flex-1 bg-black border border-industrial-border px-3 py-1.5 font-mono text-[10px] text-industrial-text focus:border-industrial-magenta focus:outline-none"
            />
            <button
              onClick={() => handleBrowseBinary(setFpcalcInput)}
              className="px-3 py-1.5 border border-industrial-border text-industrial-text-dim hover:text-white text-[9px] font-mono uppercase"
              title="Sfoglia file"
            >
              Browse
            </button>
            <button
              onClick={handleTestAndSaveFpcalc}
              disabled={testingBinary === 'fpcalc'}
              className="px-3 py-1.5 bg-industrial-magenta text-black font-bold text-[9px] font-mono uppercase hover:bg-white transition-all disabled:opacity-50"
            >
              {testingBinary === 'fpcalc' ? 'Testing...' : 'Test & Save'}
            </button>
            <button
              onClick={handleResetFpcalc}
              className="p-1.5 border border-industrial-border text-industrial-text-dim hover:text-industrial-magenta transition-all"
              title="Ripristina rilevamento automatico"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
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
          Output format is fixed per broadcast spec. Customizable radio presets available in Conformer module.
        </p>
      </section>

      {/* App Info */}
      <section className="bg-industrial-panel border border-industrial-border p-6">
        <SectionTitle>Application</SectionTitle>
        <div className="space-y-0">
          <InfoRow label="Product"    value="Runtime SoundMaster Pro"       status={null} />
          <InfoRow label="Version"    value={appVersion}                     status={null} />
          <InfoRow label="Identifier" value="it.runtimeradio.soundmasterpro" status={null} />
          <InfoRow label="Engine"     value="Tauri v2 + Rust"                status={null} />
          <InfoRow label="UI"         value="React 19 + Tailwind CSS 4"       status={null} />
        </div>
      </section>

    </div>
  );
}
