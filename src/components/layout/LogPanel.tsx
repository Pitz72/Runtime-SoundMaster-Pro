import { useRef, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import type { LogType } from '../../store/appStore';

const TYPE_LABEL: Record<LogType, string> = {
  info:    '[INFO]',
  success: '[SYNC]',
  warning: '[WARN]',
  error:   '[ERRO]',
};

const TYPE_CLASS: Record<LogType, string> = {
  info:    'text-industrial-cyan',
  success: 'text-industrial-cyan',
  warning: 'text-industrial-amber',
  error:   'text-industrial-red',
};

export function LogPanel() {
  const { logs, appVersion } = useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al fondo del log interno quando arrivano nuovi messaggi.
  // block: 'nearest' evita che scrollIntoView propaghi lo scroll al <main>
  // esterno — senza questo, ogni addLog() durante l'init portava la viewport
  // in fondo alla pagina invece che in cima.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [logs]);

  return (
    <section className="bg-black p-6 border border-industrial-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] font-mono font-bold text-industrial-text-dim tracking-widest uppercase flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-industrial-cyan" />
          Mission Log
        </h3>
        <span className="text-[9px] font-mono text-industrial-text-dim/30 uppercase tracking-tighter">
          v{appVersion}
        </span>
      </div>

      <div className="space-y-px h-48 overflow-y-auto pr-2 custom-scrollbar recessed-well bg-industrial-bg/30 p-2">
        {logs.map((log) => (
          <div
            key={log.id}
            className="flex gap-4 p-2 bg-industrial-bg/50 border-l-2 border-transparent hover:border-industrial-cyan hover:bg-industrial-panel transition-all group"
          >
            <span className="text-industrial-text-dim/50 font-mono text-[10px] shrink-0">
              {log.timestamp}
            </span>
            <span className={`font-mono text-[10px] font-bold shrink-0 ${TYPE_CLASS[log.type]}`}>
              {TYPE_LABEL[log.type]}
            </span>
            <span className="text-industrial-text-dim font-mono text-[10px] group-hover:text-industrial-text">
              {log.message}
              {log.detail && (
                <span className="text-industrial-text-dim/50 ml-2">— {log.detail}</span>
              )}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}
