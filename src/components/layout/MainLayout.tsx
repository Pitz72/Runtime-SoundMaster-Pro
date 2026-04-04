import { useRef, useEffect } from 'react';
import { LayoutGrid, Eraser, Settings2, Library, Settings } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import type { ModuleId } from '../../store/appStore';
import { TopBar } from './TopBar';
import { LogPanel } from './LogPanel';

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

function SidebarItem({ icon: Icon, label, active = false, onClick }: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center px-6 py-3 transition-all duration-200 group ${
        active
          ? 'bg-industrial-border text-industrial-amber border-l-4 border-industrial-amber'
          : 'text-industrial-text-dim hover:text-industrial-text hover:bg-industrial-border/50'
      }`}
    >
      <Icon className={`w-5 h-5 mr-3 ${active ? 'text-industrial-amber' : 'group-hover:text-industrial-amber'}`} />
      <span className="font-sans font-bold tracking-tighter uppercase text-sm">{label}</span>
    </button>
  );
}

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { currentModule, setModule, systemStatus, appVersion } = useAppStore();
  const mainRef = useRef<HTMLElement>(null);

  // Scroll al top del contenuto ad ogni cambio di modulo.
  // Necessario perché <main> è il container scrollabile: senza questo reset
  // la posizione di scroll del modulo precedente persiste nel nuovo.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [currentModule]);

  const navItems: { id: ModuleId; icon: React.ElementType; label: string }[] = [
    { id: 'hub',       icon: LayoutGrid, label: 'Hub'       },
    { id: 'cleaner',   icon: Eraser,     label: 'Cleaner'   },
    { id: 'conformer', icon: Settings2,  label: 'Conformer' },
    { id: 'librarian', icon: Library,    label: 'Librarian' },
    { id: 'settings',  icon: Settings,   label: 'Settings'  },
  ];

  const ffmpegStatus = systemStatus.initialized
    ? systemStatus.ffmpegFound ? 'ACTIVE' : 'NOT FOUND'
    : 'DETECTING';

  return (
    <div className="min-h-screen flex bg-industrial-bg">

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="w-64 fixed left-0 top-0 h-full bg-industrial-panel border-r border-industrial-border flex flex-col py-6 z-50">
        <div className="px-6 mb-10">
          <h1 className="text-xl font-black text-industrial-amber tracking-widest font-sans uppercase">
            SOUNDMASTER
          </h1>
          <p className="font-sans font-bold tracking-tighter uppercase text-[10px] text-industrial-text-dim/50">
            V{appVersion}
          </p>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <SidebarItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={currentModule === item.id}
              onClick={() => setModule(item.id)}
            />
          ))}
        </nav>

        {/* App identifier block */}
        <div className="px-6 mt-auto">
          <div className="p-3 border border-industrial-border/50">
            <p className="font-mono text-[8px] text-industrial-text-dim/40 uppercase tracking-widest leading-none mb-1">
              it.runtimeradio
            </p>
            <p className="font-mono text-[9px] text-industrial-text-dim/60 uppercase tracking-widest">
              soundmasterpro
            </p>
          </div>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <div className="flex-1 ml-64 flex flex-col">

        <TopBar />

        <main ref={mainRef} className="p-8 pb-16 space-y-8 h-[calc(100vh-80px)] overflow-y-auto custom-scrollbar">
          {children}
          <LogPanel />
        </main>

        {/* ── Footer Status Bar ────────────────────────────────── */}
        <footer className="fixed bottom-0 left-64 right-0 h-8 bg-black border-t border-industrial-border flex items-center justify-between px-6 z-50">
          <div className="flex items-center gap-4">
            <span className="font-mono text-[9px] uppercase tracking-widest text-industrial-text-dim/50">
              TAURI V2 | RUST ENGINE:{' '}
              <span className="text-industrial-cyan">
                {systemStatus.initialized ? 'ACTIVE' : 'BOOT'}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-6 font-mono text-[9px] uppercase tracking-widest text-industrial-text-dim/50">
            <span>
              FFmpeg:{' '}
              <span className={systemStatus.ffmpegFound ? 'text-industrial-cyan' : 'text-industrial-red'}>
                {ffmpegStatus}
              </span>
            </span>
            <span>
              DB:{' '}
              <span className={systemStatus.db ? 'text-industrial-cyan' : 'text-industrial-text-dim'}>
                {systemStatus.db ?? 'PENDING'}
              </span>
            </span>
          </div>
        </footer>

      </div>
    </div>
  );
}
