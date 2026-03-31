/**
 * TopBar.tsx — Barra superiore persistente
 * Runtime SoundMaster Pro v0.1.0
 */

import { useAppStore } from "../../store/appStore";

const STATUS_COLORS = {
  ok: "#39FF14",
  warn: "#FFB211",
  err: "#FF3131",
};

interface StatusPillProps {
  label: string;
  ok: boolean | null; // null = loading
}

function StatusPill({ label, ok }: StatusPillProps) {
  const color =
    ok === null ? STATUS_COLORS.warn : ok ? STATUS_COLORS.ok : STATUS_COLORS.err;
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="w-1.5 h-1.5 rounded-none"
        style={{
          background: color,
          boxShadow: ok ? `0 0 6px ${color}` : "none",
        }}
      />
      <span className="font-data text-[10px] uppercase tracking-widest" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

export function TopBar() {
  const { systemStatus, workspacePath, logPanelOpen, toggleLogPanel, currentModule, setModule } =
    useAppStore();

  const isHub = currentModule === "hub";
  const shortPath = workspacePath
    ? workspacePath.length > 50
      ? "…" + workspacePath.slice(-48)
      : workspacePath
    : null;

  return (
    <header
      className="flex items-center justify-between px-4 shrink-0"
      style={{
        height: "36px",
        background: "#0D0D0D",
        borderBottom: "1px solid #1E1E1E",
        zIndex: 50,
      }}
    >
      {/* LEFT: Logo + breadcrumb */}
      <div className="flex items-center gap-3">
        {/* Indicatore power */}
        <div
          className="w-2 h-2"
          style={{
            background: "#39FF14",
            boxShadow: "0 0 8px #39FF14",
            animation: "pulse 2s infinite",
          }}
        />

        {/* Logo */}
        <button
          onClick={() => !isHub && setModule("hub")}
          className="font-display text-[11px] tracking-[0.2em] uppercase transition-colors"
          style={{
            color: isHub ? "#E8E8E8" : "#6B6B6B",
            cursor: isHub ? "default" : "pointer",
            background: "none",
            border: "none",
          }}
          onMouseEnter={(e) => {
            if (!isHub) (e.currentTarget as HTMLElement).style.color = "#E8E8E8";
          }}
          onMouseLeave={(e) => {
            if (!isHub) (e.currentTarget as HTMLElement).style.color = "#6B6B6B";
          }}
        >
          Runtime SoundMaster Pro
        </button>

        {/* Breadcrumb modulo attivo */}
        {!isHub && (
          <>
            <span className="font-data text-[10px]" style={{ color: "#2A2A2A" }}>
              /
            </span>
            <span className="font-data text-[10px] uppercase tracking-widest" style={{ color: "#39FF14" }}>
              {currentModule === "cleaner"
                ? "The Cleaner"
                : currentModule === "conformer"
                ? "The Conformer"
                : "The Librarian"}
            </span>
          </>
        )}
      </div>

      {/* CENTER: workspace path */}
      {shortPath && (
        <div
          className="flex items-center gap-2 px-3 py-0.5"
          style={{ background: "#131313", border: "1px solid #1E1E1E" }}
        >
          <span className="font-data text-[9px] uppercase tracking-widest" style={{ color: "#3A3A3A" }}>
            WS
          </span>
          <span className="font-data text-[10px]" style={{ color: "#BACCB0" }}>
            {shortPath}
          </span>
        </div>
      )}

      {/* RIGHT: status + log toggle */}
      <div className="flex items-center gap-4">
        <StatusPill label="DB" ok={systemStatus.initialized ? !!systemStatus.db : null} />
        <StatusPill label="FFmpeg" ok={systemStatus.initialized ? systemStatus.ffmpegFound : null} />
        <StatusPill label="fpcalc" ok={systemStatus.initialized ? systemStatus.fpcalcFound : null} />

        <div style={{ width: "1px", height: "16px", background: "#1E1E1E" }} />

        {/* Log toggle */}
        <button
          onClick={toggleLogPanel}
          className="flex items-center gap-1.5 px-2 py-0.5 transition-all"
          style={{
            background: logPanelOpen ? "rgba(57,255,20,0.08)" : "transparent",
            border: `1px solid ${logPanelOpen ? "#39FF14" : "#1E1E1E"}`,
            color: logPanelOpen ? "#39FF14" : "#6B6B6B",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement;
            if (!logPanelOpen) { el.style.borderColor = "#2A2A2A"; el.style.color = "#BACCB0"; }
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            if (!logPanelOpen) { el.style.borderColor = "#1E1E1E"; el.style.color = "#6B6B6B"; }
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="1" y="1" width="8" height="2" fill="currentColor" />
            <rect x="1" y="4.5" width="6" height="1.5" fill="currentColor" />
            <rect x="1" y="7" width="4" height="1.5" fill="currentColor" />
          </svg>
          <span className="font-data text-[10px] uppercase tracking-widest">Log</span>
        </button>
      </div>
    </header>
  );
}
