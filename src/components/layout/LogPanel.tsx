/**
 * LogPanel.tsx
 * Runtime SoundMaster Pro v0.1.0
 * 
 * Pannello console a comparsa dal basso per visualizzare i log di sistema.
 */

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "../../store/appStore";

export function LogPanel() {
  const { logs, logPanelOpen, toggleLogPanel } = useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll all'ultimo log solo quando il pannello è aperto
  useEffect(() => {
    if (logPanelOpen && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, logPanelOpen]);

  return (
    <AnimatePresence>
      {logPanelOpen && (
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="absolute bottom-0 left-0 right-0 z-40 flex flex-col"
          style={{
            height: "40vh",
            background: "#0A0A0A",
            borderTop: "1px solid #2A2A2A",
            boxShadow: "0 -10px 30px rgba(0,0,0,0.5)",
          }}
        >
          {/* Header del pannello log */}
          <div className="flex items-center justify-between px-4 py-2 shrink-0 bg-[#131313] border-b border-[#1A1A1A]">
            <span className="font-data text-[10px] uppercase tracking-widest text-[#BACCB0]">
              System Log
            </span>
            <button
              onClick={toggleLogPanel}
              className="text-[#6B6B6B] hover:text-[#E8E8E8] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
              </svg>
            </button>
          </div>

          {/* Area contenuto log */}
          <div className="flex-1 overflow-y-auto p-4 font-data text-[11px] leading-relaxed">
            {logs.length === 0 ? (
              <div className="text-[#6B6B6B] italic">Nessun log disponibile...</div>
            ) : (
              logs.map((log) => {
                let color = "#BACCB0"; // info
                if (log.type === "success") color = "#39FF14";
                else if (log.type === "warning") color = "#FFB211";
                else if (log.type === "error") color = "#FF3131";

                return (
                  <div key={log.id} className="mb-1 flex gap-3 hover:bg-[#131313] px-1 py-0.5 -mx-1 transition-colors">
                    <span className="text-[#6B6B6B] shrink-0">[{log.timestamp}]</span>
                    <div className="flex flex-col">
                      <span style={{ color }}>{log.message}</span>
                      {log.detail && (
                        <span className="text-[#6B6B6B] ml-2 mt-0.5 border-l border-[#2A2A2A] pl-2">
                          {log.detail}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
