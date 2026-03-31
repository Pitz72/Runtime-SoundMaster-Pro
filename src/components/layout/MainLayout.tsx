/**
 * MainLayout.tsx
 * Runtime SoundMaster Pro v0.1.0
 */

import { TopBar } from "./TopBar";
import { LogPanel } from "./LogPanel";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{
        background: "#0D0D0D",
        fontFamily: "'Space Grotesk', system-ui, sans-serif",
      }}
    >
      <TopBar />

      {/* Area principale scrollabile con layout relativo per i pannelli fluttuanti (LogPanel) */}
      <main className="flex-1 relative overflow-hidden bg-[#0D0D0D]">
        <div className="h-full w-full overflow-y-auto p-4 sm:p-6 pb-20">
            {children}
        </div>
        
        {/* Il LogPanel si sovrappone ai contenuti tramite AnimatePresence */}
        <LogPanel />
      </main>

      {/* Status bar fissa bottom */}
      <footer
        className="flex items-center justify-between px-5 py-1.5 shrink-0"
        style={{ background: "#0D0D0D", borderTop: "1px solid #1A1A1A", zIndex: 60 }}
      >
        <span className="font-data text-[10px]" style={{ color: "#3A3A3A" }}>
          Simone Pizzi — Runtime Radio
        </span>
        <span className="font-data text-[10px]" style={{ color: "#3A3A3A" }}>
          it.runtimeradio.soundmasterpro
        </span>
      </footer>
    </div>
  );
}
