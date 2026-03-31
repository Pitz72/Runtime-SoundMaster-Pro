import "./index.css";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// --- Tipi per i comandi Tauri ---
interface FfmpegInfo {
  found: boolean;
  path: string | null;
  version: string | null;
  source: string | null;
}

interface FpcalcInfo {
  found: boolean;
  path: string | null;
  version: string | null;
  source: string | null;
}

interface SystemStatus {
  db: string | null;
  ffmpeg: FfmpegInfo | null;
  fpcalc: FpcalcInfo | null;
  loading: boolean;
}

// --- Icone SVG inline (nessuna dipendenza di libreria per ora) ---
const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <circle cx="6" cy="6" r="5" fill="#39FF14" fillOpacity="0.15" stroke="#39FF14" strokeWidth="1"/>
    <path d="M3.5 6l1.8 1.8 3.2-3.2" stroke="#39FF14" strokeWidth="1.2" strokeLinecap="square"/>
  </svg>
);

const IconError = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <circle cx="6" cy="6" r="5" fill="#FF3131" fillOpacity="0.15" stroke="#FF3131" strokeWidth="1"/>
    <path d="M4 4l4 4M8 4l-4 4" stroke="#FF3131" strokeWidth="1.2" strokeLinecap="square"/>
  </svg>
);

const IconWarning = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M6 1L11 10H1L6 1z" fill="#FFB211" fillOpacity="0.15" stroke="#FFB211" strokeWidth="1"/>
    <path d="M6 5v2.5M6 8.5v.5" stroke="#FFB211" strokeWidth="1.2" strokeLinecap="square"/>
  </svg>
);

// --- Componente StatusRow ---
function StatusRow({ label, value, ok }: { label: string; value: string | null; ok: boolean | null }) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-b-[#2A2A2A]">
      <span className="mt-0.5 shrink-0">
        {ok === null ? <IconWarning /> : ok ? <IconCheck /> : <IconError />}
      </span>
      <div className="flex-1 min-w-0">
        <span
          className="text-[#6B6B6B] font-data text-[11px] uppercase tracking-widest"
        >
          {label}
        </span>
        <p
          className="font-data text-[11px] mt-0.5 truncate"
          style={{ color: ok === null ? '#FFB211' : ok ? '#BACCB0' : '#FF3131' }}
        >
          {value ?? '—'}
        </p>
      </div>
    </div>
  );
}

// --- Componente ModuleCard ---
function ModuleCard({
  code,
  name,
  description,
  phase,
  ready = false,
}: {
  code: string;
  name: string;
  description: string;
  phase: string;
  ready?: boolean;
}) {
  return (
    <div
      className="relative flex flex-col gap-3 p-5"
      style={{
        background: '#1A1A1A',
        border: `1px solid ${ready ? '#39FF14' : '#2A2A2A'}`,
        transition: 'border-color 250ms ease',
      }}
      onMouseEnter={(e) => {
        if (!ready) (e.currentTarget as HTMLElement).style.borderColor = '#39FF14';
      }}
      onMouseLeave={(e) => {
        if (!ready) (e.currentTarget as HTMLElement).style.borderColor = '#2A2A2A';
      }}
    >
      {/* Indicatore angolo */}
      <div
        className="absolute top-0 left-0 w-2 h-2"
        style={{ background: ready ? '#39FF14' : '#2A2A2A' }}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="font-data text-[10px] tracking-[0.2em] uppercase" style={{ color: '#6B6B6B' }}>
            {code}
          </span>
          <h2
            className="font-display text-sm font-bold tracking-widest mt-0.5"
            style={{ color: ready ? '#39FF14' : '#E8E8E8' }}
          >
            {name}
          </h2>
        </div>
        <span
          className="font-data text-[10px] px-2 py-0.5 uppercase tracking-widest"
          style={{
            background: ready ? 'rgba(57,255,20,0.08)' : 'rgba(107,107,107,0.15)',
            color: ready ? '#39FF14' : '#6B6B6B',
          }}
        >
          {ready ? 'READY' : phase}
        </span>
      </div>

      {/* Descrizione */}
      <p className="text-[12px] leading-relaxed" style={{ color: '#BACCB0' }}>
        {description}
      </p>

      {/* Pulsante placeholder */}
      <button
        disabled={!ready}
        className="w-full py-2 font-display text-[11px] tracking-widest uppercase transition-all"
        style={{
          background: ready ? 'rgba(57,255,20,0.08)' : 'transparent',
          border: `1px solid ${ready ? '#39FF14' : '#2A2A2A'}`,
          color: ready ? '#39FF14' : '#3A3A3A',
          cursor: ready ? 'pointer' : 'not-allowed',
        }}
      >
        {ready ? 'launch' : 'in development'}
      </button>
    </div>
  );
}

// --- App principale ---
export default function App() {
  const [status, setStatus] = useState<SystemStatus>({
    db: null,
    ffmpeg: null,
    fpcalc: null,
    loading: true,
  });

  useEffect(() => {
    const init = async () => {
      try {
        const [db, ffmpeg, fpcalc] = await Promise.all([
          invoke<string>("db_status"),
          invoke<FfmpegInfo>("detect_ffmpeg_cmd"),
          invoke<FpcalcInfo>("detect_fpcalc_cmd"),
        ]);
        setStatus({ db, ffmpeg, fpcalc, loading: false });
      } catch (err) {
        setStatus((s) => ({ ...s, loading: false }));
        console.error("Init error:", err);
      }
    };
    init();
  }, []);

  const ffmpegOk = status.ffmpeg?.found ?? null;
  const fpcalcOk = status.fpcalc?.found ?? null;
  const dbOk = status.db !== null;

  return (
    <div
      className="flex flex-col h-screen"
      style={{ background: '#0D0D0D', fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
    >
      {/* ================================================================
          TOPBAR — Barra di stato superiore
          ================================================================ */}
      <header
        className="flex items-center justify-between px-5 py-2 shrink-0"
        style={{ background: '#131313', borderBottom: '1px solid #1A1A1A' }}
      >
        {/* Logo / Titolo */}
        <div className="flex items-center gap-3">
          <div
            className="w-2 h-2 rounded-none animate-pulse"
            style={{ background: '#39FF14', boxShadow: '0 0 8px #39FF14' }}
          />
          <span className="font-display text-xs tracking-[0.25em] uppercase" style={{ color: '#E8E8E8' }}>
            Runtime SoundMaster Pro
          </span>
          <span className="font-data text-[10px]" style={{ color: '#3A3A3A' }}>v0.1.0-phase0</span>
        </div>

        {/* Stato sistema */}
        <div className="flex items-center gap-4">
          {[
            { label: 'DB', ok: status.loading ? null : dbOk },
            { label: 'FFMPEG', ok: status.loading ? null : ffmpegOk },
            { label: 'FPCALC', ok: status.loading ? null : fpcalcOk },
          ].map(({ label, ok }) => (
            <div key={label} className="flex items-center gap-1.5">
              {ok === null ? <IconWarning /> : ok ? <IconCheck /> : <IconError />}
              <span
                className="font-data text-[10px] uppercase tracking-widest"
                style={{ color: ok === null ? '#FFB211' : ok ? '#39FF14' : '#FF3131' }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </header>

      {/* ================================================================
          MAIN — Contenuto Hub
          ================================================================ */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto flex flex-col gap-8">

          {/* Hero */}
          <section className="flex flex-col gap-1">
            <p
              className="font-data text-[10px] tracking-[0.3em] uppercase"
              style={{ color: '#39FF14' }}
            >
              Command Center — Phase 0 / Setup Complete
            </p>
            <h1 className="font-display text-2xl font-bold tracking-widest uppercase" style={{ color: '#E8E8E8' }}>
              The Hub
            </h1>
            <p className="text-sm mt-1" style={{ color: '#BACCB0' }}>
              Seleziona un modulo per avviare l'elaborazione della tua libreria musicale.
            </p>
          </section>

          {/* Module Grid */}
          <section className="grid grid-cols-1 gap-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <ModuleCard
              code="MOD-A"
              name="The Cleaner"
              description="Deduplicatore intelligente. Quarantena Non-Conformi. Acoustic fingerprinting. Auto-Pick Gold."
              phase="Fase 2"
            />
            <ModuleCard
              code="MOD-B"
              name="The Conformer"
              description="Standardizzatore universale. 6 preset audio. EBU R128. Silent Trimming. Conversione FFmpeg."
              phase="Fase 3"
            />
            <ModuleCard
              code="MOD-C"
              name="The Librarian"
              description="Gestione metadati ID3. Cover Art massiva. Catalogo SQLite FTS5 per 500k+ brani."
              phase="Fase 4"
            />
          </section>

          {/* Diagnostica sistema */}
          <section
            className="p-4"
            style={{ background: '#131313', border: '1px solid #1A1A1A' }}
          >
            <p
              className="font-data text-[10px] tracking-[0.25em] uppercase mb-3"
              style={{ color: '#6B6B6B' }}
            >
              System Diagnostics
            </p>
            <div className="flex flex-col gap-0">
              <StatusRow
                label="SQLite Database"
                value={status.loading ? 'Initializing...' : (status.db ?? 'ERROR')}
                ok={status.loading ? null : dbOk}
              />
              <StatusRow
                label="FFmpeg Engine"
                value={
                  status.loading
                    ? 'Detecting...'
                    : status.ffmpeg?.found
                    ? `${status.ffmpeg.version} [${status.ffmpeg.source}]`
                    : 'Not found — install FFmpeg or add to PATH'
                }
                ok={status.loading ? null : ffmpegOk}
              />
              <StatusRow
                label="fpcalc / Chromaprint"
                value={
                  status.loading
                    ? 'Detecting...'
                    : status.fpcalc?.found
                    ? `${status.fpcalc.version} [${status.fpcalc.source}]`
                    : 'Not found — required for acoustic fingerprinting'
                }
                ok={status.loading ? null : fpcalcOk}
              />
            </div>
          </section>

        </div>
      </main>

      {/* ================================================================
          FOOTER — Status bar in basso
          ================================================================ */}
      <footer
        className="flex items-center justify-between px-5 py-1.5 shrink-0"
        style={{ background: '#0D0D0D', borderTop: '1px solid #1A1A1A' }}
      >
        <span className="font-data text-[10px]" style={{ color: '#3A3A3A' }}>
          Simone Pizzi — Runtime Radio
        </span>
        <span className="font-data text-[10px]" style={{ color: '#3A3A3A' }}>
          it.runtimeradio.soundmasterpro
        </span>
      </footer>
    </div>
  );
}
