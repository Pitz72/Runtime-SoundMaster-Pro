import { useRef, useEffect, useState } from 'react';
import { Terminal, X, Download } from 'lucide-react';
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
  success: 'text-industrial-green font-bold',
  warning: 'text-industrial-amber font-bold',
  error:   'text-industrial-red font-bold',
};

const TYPE_BORDER: Record<LogType, string> = {
  info:    'border-industrial-cyan/50',
  success: 'border-industrial-green',
  warning: 'border-industrial-amber',
  error:   'border-industrial-red',
};

export function LogPanel() {
  const { logs, logPanelOpen, toggleLogPanel, appVersion } = useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [filterType, setFilterType] = useState<LogType | 'all'>('all');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [logs]);

  if (!logPanelOpen) return null;

  const filteredLogs = filterType === 'all'
    ? logs
    : logs.filter((l) => l.type === filterType);

  const handleExportLogs = () => {
    const text = logs
      .map((l) => `[${l.timestamp}] ${TYPE_LABEL[l.type]} ${l.message}${l.detail ? ` — ${l.detail}` : ''}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `soundmaster-pro-telemetry-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className="w-80 h-full bg-[#0d0e13] border-l border-industrial-border flex flex-col z-30 select-none shrink-0 transition-all">
      
      {/* Telemetry Header */}
      <div className="h-10 px-3 border-b border-industrial-border flex items-center justify-between bg-industrial-panel">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-industrial-cyan" />
          <span className="font-mono text-[10px] text-white font-bold uppercase tracking-wider">
            MISSION TELEMETRY
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[8px] text-industrial-text-dim/60">
            {logs.length}/1000 EVT
          </span>
          <button
            onClick={toggleLogPanel}
            className="p-1 text-industrial-text-dim hover:text-white rounded"
            title="Chiudi Telemetria"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="px-2.5 py-1.5 border-b border-industrial-border/60 bg-industrial-surface/50 flex items-center justify-between text-[8px] font-mono">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilterType('all')}
            className={`px-1.5 py-0.5 rounded uppercase ${filterType === 'all' ? 'bg-industrial-border text-white font-bold' : 'text-industrial-text-dim hover:text-slate-200'}`}
          >
            ALL
          </button>
          <button
            onClick={() => setFilterType('error')}
            className={`px-1.5 py-0.5 rounded uppercase ${filterType === 'error' ? 'bg-industrial-red/20 text-industrial-red font-bold' : 'text-industrial-text-dim hover:text-industrial-red'}`}
          >
            ERRO
          </button>
          <button
            onClick={() => setFilterType('warning')}
            className={`px-1.5 py-0.5 rounded uppercase ${filterType === 'warning' ? 'bg-industrial-amber/20 text-industrial-amber font-bold' : 'text-industrial-text-dim hover:text-industrial-amber'}`}
          >
            WARN
          </button>
          <button
            onClick={() => setFilterType('success')}
            className={`px-1.5 py-0.5 rounded uppercase ${filterType === 'success' ? 'bg-industrial-green/20 text-industrial-green font-bold' : 'text-industrial-text-dim hover:text-industrial-green'}`}
          >
            SYNC
          </button>
        </div>
        <button
          onClick={handleExportLogs}
          className="text-industrial-cyan hover:text-white flex items-center gap-1 uppercase transition-colors"
          title="Esporta log su file"
        >
          <Download className="w-2.5 h-2.5" />
          <span>EXPORT</span>
        </button>
      </div>

      {/* Telemetry Stream */}
      <div className="flex-1 p-2 font-mono text-[9px] space-y-1 overflow-y-auto recessed-display custom-scrollbar text-slate-300">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-industrial-text-dim/40 italic">
            Nessun evento registrato
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className={`p-1.5 bg-[#14161f] border-l-2 ${TYPE_BORDER[log.type]} rounded-r flex flex-col gap-0.5 hover:bg-industrial-panel transition-all`}
            >
              <div className="flex items-center justify-between text-[8px]">
                <span className="text-industrial-text-dim/60">{log.timestamp}</span>
                <span className={TYPE_CLASS[log.type]}>{TYPE_LABEL[log.type]}</span>
              </div>
              <p className="text-slate-200 leading-snug break-words">
                {log.message}
              </p>
              {log.detail && (
                <span className="text-[8px] text-industrial-text-dim leading-snug font-mono break-all opacity-80">
                  {log.detail}
                </span>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Telemetry Footer */}
      <div className="p-2 border-t border-industrial-border bg-industrial-panel flex items-center justify-between text-[8px] font-mono text-industrial-text-dim/50 uppercase">
        <span>RUNTIME AIR-GAP LOG</span>
        <span>v{appVersion}</span>
      </div>

    </aside>
  );
}
