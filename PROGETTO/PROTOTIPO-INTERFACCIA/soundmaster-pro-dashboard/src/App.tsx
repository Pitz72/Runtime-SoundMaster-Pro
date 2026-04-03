import { 
  LayoutGrid, 
  Eraser, 
  Settings2, 
  Library, 
  Settings, 
  User, 
  Terminal, 
  Bell, 
  CircleUser, 
  RefreshCcw,
  Activity,
  Layers,
  Zap,
  FileAudio,
  CheckCircle2,
  Search,
  FileEdit,
  Image as ImageIcon,
  Check,
  X
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState, useEffect } from 'react';

const SidebarItem = ({ icon: Icon, label, active = false, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center px-6 py-3 transition-all duration-200 group ${
    active 
      ? 'bg-industrial-border text-industrial-amber border-l-4 border-industrial-amber' 
      : 'text-industrial-text-dim hover:text-industrial-text hover:bg-industrial-border/50'
  }`}>
    <Icon className={`w-5 h-5 mr-3 ${active ? 'text-industrial-amber' : 'group-hover:text-industrial-amber'}`} />
    <span className="font-sans font-bold tracking-tighter uppercase text-sm">{label}</span>
  </button>
);

const StatCard = ({ label, value, colorClass = 'border-industrial-amber' }: { label: string, value: string, colorClass?: string }) => (
  <div className={`bg-industrial-panel p-4 border-l-2 ${colorClass}`}>
    <p className="font-mono text-[10px] text-industrial-text-dim uppercase tracking-wider mb-1">{label}</p>
    <p className="text-3xl font-mono font-bold tracking-tight">{value}</p>
  </div>
);

const ModuleCard = ({ title, description, icon: Icon, image }: { title: string, description: string, icon: any, image: string }) => (
  <div className="bg-industrial-panel border border-industrial-border group hover:border-industrial-amber transition-all duration-300">
    <div className="h-40 overflow-hidden relative grayscale group-hover:grayscale-0 transition-all duration-500">
      <img 
        src={image} 
        alt={title} 
        className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700"
        referrerPolicy="no-referrer"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-industrial-panel to-transparent opacity-60"></div>
    </div>
    <div className="p-6">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-2xl font-black font-sans tracking-tighter uppercase">{title}</h3>
        <Icon className="w-6 h-6 text-industrial-amber" />
      </div>
      <p className="text-industrial-text-dim text-sm mb-6 leading-relaxed h-12 overflow-hidden">
        {description}
      </p>
      <button className="w-full border-2 border-industrial-amber text-industrial-amber py-2 font-bold text-xs uppercase tracking-widest hover:bg-industrial-amber hover:text-black transition-all active:scale-95">
        Launch Module
      </button>
    </div>
  </div>
);

const LogEntry = ({ time, type, message }: { time: string, type: string, message: string }) => {
  const typeColors: Record<string, string> = {
    '[SYNC]': 'text-industrial-cyan',
    '[WARN]': 'text-industrial-amber',
    '[INFO]': 'text-industrial-cyan',
    '[ERRO]': 'text-industrial-red',
  };

  return (
    <div className="flex gap-4 p-2 bg-industrial-bg/50 border-l-2 border-transparent hover:border-industrial-cyan hover:bg-industrial-panel transition-all group">
      <span className="text-industrial-text-dim/50 font-mono text-[10px]">{time}</span>
      <span className={`font-mono text-[10px] font-bold ${typeColors[type] || 'text-industrial-text'}`}>{type}</span>
      <span className="text-industrial-text-dim font-mono text-[10px] group-hover:text-industrial-text">{message}</span>
    </div>
  );
};

export default function App() {
  const [currentModule, setCurrentModule] = useState<'hub' | 'cleaner' | 'conformer' | 'librarian' | 'settings'>('hub');
  const [libraryStats, setLibraryStats] = useState({
    totalTracks: 42850,
    duplicates: 124,
    nonConform: 89,
    lastScan: '2026-03-31 14:22'
  });
  
  // Cleaner (Duplicate Finder) State
  const [cleanerStep, setCleanerStep] = useState<1 | 2 | 3>(1); // 1: Scan, 2: Review, 3: Resolve
  const [duplicatePairs, setDuplicatePairs] = useState([
    { id: 'pair-1', fileA: 'Ambience_Forest_Loop.wav', fileB: 'Forest_Amb_Copy.wav', score: 98, size: '42.5 MB', date: '2026-01-12' },
    { id: 'pair-2', fileA: 'Sword_Clash_04.mp3', fileB: 'Sword_Hit_Alt.mp3', score: 92, scoreType: 'ACOUSTIC', size: '1.2 MB', date: '2026-02-05' },
    { id: 'pair-3', fileA: 'UI_Click_Modern.wav', fileB: 'UI_Click_Backup.wav', score: 100, scoreType: 'BINARY', size: '0.4 MB', date: '2026-03-15' },
  ]);
  const [selectedPair, setSelectedPair] = useState<string | null>('pair-1');
  const [uptime, setUptime] = useState('000:00:00');
  const [energy, setEnergy] = useState(85);
  const [logs, setLogs] = useState<{ time: string; type: string; message: string }[]>([
    { time: '19:38:31', type: '[INFO]', message: 'System initialized. Kernel v2.0.4-LTS active.' },
    { time: '19:38:32', type: '[SYNC]', message: 'Library synchronized with central database.' }
  ]);

  // Conformer Module State
  const [selectedPreset, setSelectedPreset] = useState('Podcast');
  const [conformerToggles, setConformerToggles] = useState({
    standardize: true,
    normalization: true,
    trimming: false
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);

  // Librarian Module State
  const [scrubbingLevel, setScrubbingLevel] = useState(1);
  const [librarianSearch, setLibrarianSearch] = useState('');
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set(['track-1', 'track-2']));
  const [tracks] = useState([
    { id: 'track-1', title: 'Neural_Pathways_01.wav', artist: 'Xenon Systems', genre: 'INDUSTRIAL', bpm: 132, bitrate: '24bit' },
    { id: 'track-2', title: 'Cybernetic_Pulse_V2.flac', artist: 'Xenon Systems', genre: 'INDUSTRIAL', bpm: 128, bitrate: '32bit' },
    { id: 'track-3', title: 'Fragmented_Logic_Data_01.mp3', artist: 'Unknown Artist', genre: 'UNCATEGORIZED', bpm: '--', bitrate: '16bit' },
    { id: 'track-4', title: 'Fragmented_Logic_Data_02.mp3', artist: 'Unknown Artist', genre: 'UNCATEGORIZED', bpm: '--', bitrate: '16bit' },
    { id: 'track-5', title: 'Fragmented_Logic_Data_03.mp3', artist: 'Unknown Artist', genre: 'UNCATEGORIZED', bpm: '--', bitrate: '16bit' },
    { id: 'track-6', title: 'Fragmented_Logic_Data_04.mp3', artist: 'Unknown Artist', genre: 'UNCATEGORIZED', bpm: '--', bitrate: '16bit' },
    { id: 'track-7', title: 'Fragmented_Logic_Data_05.mp3', artist: 'Unknown Artist', genre: 'UNCATEGORIZED', bpm: '--', bitrate: '16bit' },
    { id: 'track-8', title: 'Fragmented_Logic_Data_06.mp3', artist: 'Unknown Artist', genre: 'UNCATEGORIZED', bpm: '--', bitrate: '16bit' },
  ]);

  const [bulkEdit, setBulkEdit] = useState({
    titlePattern: '',
    artist: 'Xenon Systems',
    genre: 'Industrial',
    year: 2024
  });

  const toggleTrackSelection = (id: string) => {
    setSelectedTracks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllTracks = () => {
    if (selectedTracks.size === tracks.length) {
      setSelectedTracks(new Set());
    } else {
      setSelectedTracks(new Set(tracks.map(t => t.id)));
    }
  };

  const addLog = (type: string, message: string) => {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setLogs(prev => [{ time, type, message }, ...prev].slice(0, 50));
  };

  const startBatchProcessing = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setProcessingProgress(0);
    
    addLog('[INFO]', 'Batch processing started: 12 files in queue.');
    
    const interval = setInterval(() => {
      setProcessingProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsProcessing(false);
          addLog('[SUCCESS]', 'Batch processing completed successfully.');
          return 100;
        }
        return prev + 2;
      });
    }, 100);
  };

  // Simulate uptime ticking
  useEffect(() => {
    const interval = setInterval(() => {
      setUptime(prev => {
        const [h, m, s] = prev.split(':').map(Number);
        let newS = s + 1;
        let newM = m;
        let newH = h;
        if (newS >= 60) { newS = 0; newM += 1; }
        if (newM >= 60) { newM = 0; newH += 1; }
        return `${newH.toString().padStart(3, '0')}:${newM.toString().padStart(2, '0')}:${newS.toString().padStart(2, '0')}`;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex bg-industrial-bg">
      {/* Sidebar */}
      <aside className="w-64 fixed left-0 top-0 h-full bg-industrial-panel border-r border-industrial-border flex flex-col py-6 z-50">
        <div className="px-6 mb-10">
          <h1 className="text-xl font-black text-industrial-amber tracking-widest font-sans uppercase">SOUNDMASTER</h1>
          <p className="font-sans font-bold tracking-tighter uppercase text-[10px] text-industrial-text-dim/50">V3.4.1 PRO</p>
        </div>

        <nav className="flex-1 space-y-1">
          <SidebarItem 
            icon={LayoutGrid} 
            label="Hub" 
            active={currentModule === 'hub'} 
            onClick={() => setCurrentModule('hub')}
          />
          <SidebarItem 
            icon={Eraser} 
            label="Cleaner" 
            active={currentModule === 'cleaner'} 
            onClick={() => setCurrentModule('cleaner')}
          />
          <SidebarItem 
            icon={Settings2} 
            label="Conformer" 
            active={currentModule === 'conformer'} 
            onClick={() => setCurrentModule('conformer')}
          />
          <SidebarItem 
            icon={Library} 
            label="Librarian" 
            active={currentModule === 'librarian'} 
            onClick={() => setCurrentModule('librarian')}
          />
          <SidebarItem 
            icon={Settings} 
            label="Settings" 
            active={currentModule === 'settings'} 
            onClick={() => setCurrentModule('settings')}
          />
        </nav>

        <div className="px-6 mt-auto">
          <div className="flex items-center gap-3 p-3 bg-industrial-border/30 border border-industrial-border">
            <div className="w-8 h-8 bg-industrial-amber flex items-center justify-center">
              <User className="w-4 h-4 text-black" />
            </div>
            <div className="overflow-hidden">
              <p className="text-[10px] font-mono text-industrial-text-dim/70 leading-none uppercase">Operator</p>
              <p className="text-xs font-bold truncate">SYS_ADMIN_01</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 ml-64 flex flex-col">
        {/* Header */}
        <header className="h-12 sticky top-0 bg-industrial-bg/80 backdrop-blur-md border-b border-industrial-border flex justify-between items-center px-8 z-40">
          <div className="flex items-center gap-8">
            <span className="font-sans font-black text-industrial-amber text-sm tracking-tight">SOUNDMASTER PRO</span>
            <nav className="hidden md:flex items-center gap-6 font-mono text-[10px] tracking-widest uppercase text-industrial-text-dim">
              <a href="#" className="hover:text-industrial-text transition-colors">System Status</a>
              <a href="#" className="hover:text-industrial-text transition-colors">Library Health</a>
            </nav>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative">
              <input 
                type="text" 
                placeholder="CMD_SEARCH..." 
                className="bg-black border-b border-industrial-border focus:border-industrial-amber text-[10px] font-mono h-7 w-40 px-2 outline-none transition-all"
              />
            </div>
            <div className="flex items-center gap-4 text-industrial-amber">
              <Terminal className="w-4 h-4 cursor-pointer hover:brightness-125" />
              <Bell className="w-4 h-4 cursor-pointer hover:brightness-125" />
              <CircleUser className="w-4 h-4 cursor-pointer hover:brightness-125" />
            </div>
          </div>
        </header>

        {/* Dashboard Canvas */}
        <main className="p-8 pb-16 space-y-8 h-[calc(100vh-80px)] overflow-y-auto custom-scrollbar">
          {currentModule === 'hub' && (
            <>
              {/* Hero Section */}
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="lg:col-span-12 bg-industrial-panel relative overflow-hidden p-8 border-l-8 border-industrial-cyan glow-cyan"
                >
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="w-2 h-2 bg-industrial-cyan animate-pulse"></span>
                      <span className="font-mono text-[10px] text-industrial-cyan tracking-[0.2em] uppercase">Kernel v2.0.4-LTS // SQLite WAL ACTIVE</span>
                    </div>
                    <h2 className="text-6xl font-black font-sans tracking-tighter uppercase mb-4 leading-none">
                      COMMAND <span className="text-industrial-cyan">CENTER</span>
                    </h2>
                    <p className="max-w-xl text-industrial-text-dim font-display text-lg leading-tight">
                      Universal Radio Sanitizer. Clean, conform, and organize your library for professional broadcasting.
                    </p>
                  </div>
                  <Activity className="absolute right-[-20px] bottom-[-20px] w-64 h-64 text-industrial-text-dim/5 pointer-events-none" />
                </motion.div>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div onClick={() => setCurrentModule('cleaner')} className="cursor-pointer">
                  <ModuleCard 
                    title="The Cleaner" 
                    description="Duplicate detection and library sanitization pipeline." 
                    icon={Eraser} 
                    image="https://picsum.photos/seed/clean/800/600"
                  />
                </div>
                <div onClick={() => setCurrentModule('conformer')} className="cursor-pointer">
                  <ModuleCard 
                    title="The Conformer" 
                    description="Mass standardization: EBU R128, Silent Trimming, and Radio Presets." 
                    icon={Settings2} 
                    image="https://picsum.photos/seed/conform/800/600"
                  />
                </div>
                <div onClick={() => setCurrentModule('librarian')} className="cursor-pointer">
                  <ModuleCard 
                    title="The Librarian" 
                    description="Metadata scrubbing and SQLite catalog management." 
                    icon={Library} 
                    image="https://picsum.photos/seed/library/800/600"
                  />
                </div>
              </div>

              {/* Library Overview Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-industrial-panel p-6 border border-industrial-border">
                  <p className="font-mono text-[10px] text-industrial-text-dim uppercase mb-1">Total Assets</p>
                  <p className="text-3xl font-black font-mono">{(libraryStats.totalTracks + 450).toLocaleString()}</p>
                </div>
                <div className="bg-industrial-panel p-6 border border-industrial-border border-l-4 border-l-industrial-amber">
                  <p className="font-mono text-[10px] text-industrial-amber uppercase mb-1">Duplicates Detected</p>
                  <p className="text-3xl font-black font-mono text-industrial-amber">{libraryStats.duplicates}</p>
                </div>
                <div className="bg-industrial-panel p-6 border border-industrial-border border-l-4 border-l-industrial-red">
                  <p className="font-mono text-[10px] text-industrial-red uppercase mb-1">Anomalies Detected</p>
                  <p className="text-3xl font-black font-mono text-industrial-red">12</p>
                </div>
                <div className="bg-industrial-panel p-6 border border-industrial-border">
                  <p className="font-mono text-[10px] text-industrial-text-dim uppercase mb-1">System Uptime</p>
                  <p className="text-xl font-bold font-mono mt-2">142:08:45</p>
                </div>
              </div>
            </>
          )}

          {currentModule === 'cleaner' && (
            <div className="space-y-6">
              {/* Cleaner Header & Pipeline Progress */}
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-industrial-amber/10 border border-industrial-amber/30">
                      <Eraser className="w-5 h-5 text-industrial-amber" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black font-sans tracking-tighter uppercase">THE CLEANER</h2>
                      <p className="text-[10px] font-mono text-industrial-text-dim uppercase tracking-widest">Sanitization Pipeline v3.0</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-industrial-text-dim uppercase">Status:</span>
                    <span className={`text-[10px] font-mono uppercase font-bold ${cleanerStep === 1 ? 'text-industrial-cyan' : 'text-industrial-amber'}`}>
                      {cleanerStep === 1 ? 'Awaiting Scan' : cleanerStep === 2 ? 'Reviewing Conflicts' : 'Resolution Active'}
                    </span>
                  </div>
                </div>

                {/* 3-Step Pipeline Indicator */}
                <div className="grid grid-cols-3 gap-px bg-industrial-border">
                  {[
                    { step: 1, label: 'SCAN', desc: 'Acoustic Fingerprinting' },
                    { step: 2, label: 'REVIEW', desc: 'Conflict Analysis' },
                    { step: 3, label: 'RESOLVE', desc: 'Binary Resolution' },
                  ].map((s) => (
                    <div 
                      key={s.step}
                      className={`p-4 flex flex-col items-center justify-center transition-all ${
                        cleanerStep === s.step 
                          ? 'bg-industrial-amber text-black' 
                          : cleanerStep > s.step 
                            ? 'bg-industrial-panel text-industrial-cyan' 
                            : 'bg-industrial-panel text-industrial-text-dim'
                      }`}
                    >
                      <span className="text-[10px] font-mono font-black mb-1">STEP 0{s.step}</span>
                      <span className="text-xs font-black uppercase tracking-widest">{s.label}</span>
                      <span className="text-[8px] font-mono uppercase opacity-60">{s.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 1: Scan */}
              {cleanerStep === 1 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-industrial-panel border border-industrial-border p-12 flex flex-col items-center justify-center text-center"
                >
                  <div className="w-24 h-24 border-2 border-industrial-amber/20 rounded-full flex items-center justify-center mb-8 relative">
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-0 border-t-2 border-industrial-amber rounded-full"
                    />
                    <Search className="w-10 h-10 text-industrial-amber" />
                  </div>
                  <h3 className="text-3xl font-black uppercase tracking-tighter mb-4">Initialize Deep Scan</h3>
                  <p className="max-w-md text-industrial-text-dim text-sm mb-8 leading-relaxed">
                    The engine will perform binary matching and acoustic fingerprinting across 42,850 assets to identify redundant data.
                  </p>
                  <button 
                    onClick={() => {
                      addLog('[INFO]', 'Initializing library scan...');
                      setCleanerStep(2);
                    }}
                    className="bg-industrial-amber text-black px-12 py-4 font-bold text-xs uppercase tracking-widest hover:bg-white transition-all glow-amber active:scale-95"
                  >
                    Start Analysis
                  </button>
                </motion.div>
              )}

              {/* Step 2: Review */}
              {cleanerStep === 2 && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-8"
                >
                  {/* Conflict List */}
                  <div className="lg:col-span-4 space-y-4">
                    <div className="bg-black p-4 border border-industrial-border flex items-center justify-between">
                      <span className="text-[10px] font-mono text-industrial-text-dim uppercase">Conflicts Detected</span>
                      <span className="text-xs font-mono font-bold text-industrial-amber">{duplicatePairs.length}</span>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            addLog('[INFO]', 'Bulk resolution: Keeping all Source A files.');
                            setCleanerStep(3);
                          }}
                          className="text-[9px] font-mono text-industrial-cyan hover:underline uppercase"
                        >
                          Resolve All (A)
                        </button>
                        <span className="text-industrial-border">|</span>
                        <button 
                          onClick={() => {
                            addLog('[INFO]', 'Bulk resolution: Keeping all Source B files.');
                            setCleanerStep(3);
                          }}
                          className="text-[9px] font-mono text-industrial-amber hover:underline uppercase"
                        >
                          Resolve All (B)
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2 h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                      {duplicatePairs.map((pair) => (
                        <button
                          key={pair.id}
                          onClick={() => setSelectedPair(pair.id)}
                          className={`w-full p-4 border text-left transition-all group ${
                            selectedPair === pair.id 
                              ? 'border-industrial-amber bg-industrial-amber/5' 
                              : 'border-industrial-border hover:border-industrial-text-dim/50 bg-industrial-panel'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-mono text-industrial-cyan uppercase">{pair.score}% Match</span>
                            <span className="text-[8px] font-mono text-industrial-text-dim uppercase">{pair.scoreType || 'ACOUSTIC'}</span>
                          </div>
                          <div className="text-[11px] font-bold text-white truncate mb-1 uppercase tracking-wider">{pair.fileA}</div>
                          <div className="text-[9px] font-mono text-industrial-text-dim truncate uppercase">{pair.fileB}</div>
                        </button>
                      ))}
                    </div>
                    <button 
                      onClick={() => setCleanerStep(3)}
                      className="w-full bg-industrial-cyan text-black py-4 font-bold text-xs uppercase tracking-widest hover:brightness-110 transition-all glow-cyan"
                    >
                      Proceed to Resolution
                    </button>
                  </div>

                  {/* Comparison View */}
                  <div className="lg:col-span-8 space-y-6">
                    {selectedPair ? (
                      <>
                        <div className="bg-industrial-panel border border-industrial-border p-6">
                          <h3 className="text-xs font-bold text-white tracking-widest uppercase mb-6 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-industrial-amber" />
                            Waveform Comparison
                          </h3>
                          
                          <div className="space-y-8">
                            {/* File A */}
                            <div className="space-y-2">
                              <div className="flex justify-between text-[10px] font-mono uppercase">
                                <span className="text-industrial-cyan">Source A: {duplicatePairs.find(p => p.id === selectedPair)?.fileA}</span>
                                <span className="text-industrial-text-dim">{duplicatePairs.find(p => p.id === selectedPair)?.size}</span>
                              </div>
                              <div className="h-24 bg-black border border-industrial-border flex items-center justify-center gap-px p-2 relative overflow-hidden">
                                {Array.from({ length: 100 }).map((_, i) => (
                                  <div 
                                    key={i} 
                                    className="w-1 bg-industrial-cyan/40" 
                                    style={{ height: `${Math.random() * 80 + 10}%` }}
                                  />
                                ))}
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-industrial-cyan/10 to-transparent animate-scan" />
                              </div>
                            </div>

                            {/* File B */}
                            <div className="space-y-2">
                              <div className="flex justify-between text-[10px] font-mono uppercase">
                                <span className="text-industrial-amber">Source B: {duplicatePairs.find(p => p.id === selectedPair)?.fileB}</span>
                                <span className="text-industrial-text-dim">{duplicatePairs.find(p => p.id === selectedPair)?.size}</span>
                              </div>
                              <div className="h-24 bg-black border border-industrial-border flex items-center justify-center gap-px p-2 relative overflow-hidden">
                                {Array.from({ length: 100 }).map((_, i) => (
                                  <div 
                                    key={i} 
                                    className="w-1 bg-industrial-amber/40" 
                                    style={{ height: `${Math.random() * 80 + 10}%` }}
                                  />
                                ))}
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-industrial-amber/10 to-transparent animate-scan" />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-industrial-panel border border-industrial-border p-6">
                          <h3 className="text-xs font-bold text-white tracking-widest uppercase mb-4">Metadata Delta</h3>
                          <div className="grid grid-cols-2 gap-px bg-industrial-border">
                            <div className="bg-black p-3 text-[10px] font-mono text-industrial-text-dim uppercase">Property</div>
                            <div className="bg-black p-3 text-[10px] font-mono text-industrial-text-dim uppercase">Status</div>
                            <div className="bg-industrial-bg p-3 text-[10px] font-mono uppercase">Sample Rate</div>
                            <div className="bg-industrial-bg p-3 text-[10px] font-mono text-industrial-cyan uppercase">MATCH</div>
                            <div className="bg-industrial-bg p-3 text-[10px] font-mono uppercase">Bit Depth</div>
                            <div className="bg-industrial-bg p-3 text-[10px] font-mono text-industrial-cyan uppercase">MATCH</div>
                            <div className="bg-industrial-bg p-3 text-[10px] font-mono uppercase">Duration</div>
                            <div className="bg-industrial-bg p-3 text-[10px] font-mono text-industrial-amber uppercase">DELTA: 0.2s</div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="h-full flex items-center justify-center border-2 border-dashed border-industrial-border text-industrial-text-dim uppercase font-mono text-xs">
                        Select a conflict pair to analyze
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Step 3: Resolve */}
              {cleanerStep === 3 && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-industrial-panel border border-industrial-border p-12 text-center"
                >
                  <h3 className="text-4xl font-black uppercase tracking-tighter mb-8">Resolution Console</h3>
                  <div className="max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                    <div className="bg-black p-8 border border-industrial-border hover:border-industrial-cyan transition-all group">
                      <h4 className="text-xl font-bold uppercase mb-4 text-industrial-cyan">Keep Original (A)</h4>
                      <p className="text-xs text-industrial-text-dim mb-6 uppercase leading-relaxed">
                        Deletes all duplicates and preserves the primary file in the original directory.
                      </p>
                      <button 
                        onClick={() => {
                          addLog('[SYNC]', 'Resolution applied: Kept Source A.');
                          setCleanerStep(1);
                        }}
                        className="w-full py-3 bg-industrial-cyan text-black font-bold text-[10px] uppercase tracking-widest hover:brightness-110 transition-all"
                      >
                        Execute A
                      </button>
                    </div>
                    <div className="bg-black p-8 border border-industrial-border hover:border-industrial-amber transition-all group">
                      <h4 className="text-xl font-bold uppercase mb-4 text-industrial-amber">Keep Duplicate (B)</h4>
                      <p className="text-xs text-industrial-text-dim mb-6 uppercase leading-relaxed">
                        Replaces the original file with the duplicate version, potentially updating metadata.
                      </p>
                      <button 
                        onClick={() => {
                          addLog('[SYNC]', 'Resolution applied: Kept Source B.');
                          setCleanerStep(1);
                        }}
                        className="w-full py-3 bg-industrial-amber text-black font-bold text-[10px] uppercase tracking-widest hover:brightness-110 transition-all"
                      >
                        Execute B
                      </button>
                    </div>
                  </div>
                  <button 
                    onClick={() => setCleanerStep(2)}
                    className="text-industrial-text-dim text-[10px] font-mono uppercase hover:text-white transition-all underline underline-offset-4"
                  >
                    Return to Review
                  </button>
                </motion.div>
              )}
            </div>
          )}

          {currentModule === 'conformer' && (
            <div className="flex flex-col md:flex-row gap-6 h-full overflow-hidden">
              {/* Left Panel: Module Identity & Workflow */}
              <div className="w-full md:w-1/3 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
                {/* Module Identity */}
                <div className="bg-industrial-panel border border-industrial-border p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-industrial-amber/5 -rotate-45 translate-x-12 -translate-y-12"></div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-industrial-amber flex items-center justify-center">
                      <Layers className="text-black w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black tracking-tighter text-white leading-none uppercase">Conformer</h2>
                      <p className="text-[10px] font-mono text-industrial-amber tracking-widest uppercase">Audio Alignment Engine v2.4</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-mono border-b border-industrial-border pb-1">
                      <span className="text-industrial-text-dim uppercase">Engine Status</span>
                      <span className="text-industrial-cyan uppercase">Ready</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-mono border-b border-industrial-border pb-1">
                      <span className="text-industrial-text-dim uppercase">Input Buffer</span>
                      <span className="text-white uppercase">128.4 MB</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-industrial-text-dim uppercase">Output Format</span>
                      <span className="text-white uppercase">WAV / 24-bit</span>
                    </div>
                  </div>
                </div>

                {/* Radio Presets */}
                <div className="bg-industrial-panel border border-industrial-border p-6">
                  <h3 className="text-xs font-bold text-white tracking-widest uppercase flex items-center gap-2 mb-6">
                    <RefreshCcw className="w-3 h-3 text-industrial-cyan" />
                    Radio Presets
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: 'Podcast', label: 'Podcast Master', desc: 'Voice-forward, -16 LUFS' },
                      { id: 'RadioSTD', label: 'Radio Standard', desc: 'FM Compression, -14 LUFS' },
                      { id: 'RadioHQ', label: 'Radio High-End', desc: 'DAB+ Optimized, -12 LUFS' },
                      { id: 'TV', label: 'TV Broadcast', desc: 'EBU R128 Compliant' },
                      { id: 'Cinema', label: 'Cinema Mix', desc: 'High Dynamic Range' },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => setSelectedPreset(preset.id)}
                        className={`text-left p-3 border transition-all ${
                          selectedPreset === preset.id 
                            ? 'border-industrial-cyan bg-industrial-cyan/10' 
                            : 'border-industrial-border hover:border-industrial-text-dim/50 bg-black/40'
                        }`}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-wider text-white">{preset.label}</div>
                        <div className="text-[8px] font-mono text-industrial-text-dim uppercase mt-1">{preset.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Workflow Parameters */}
                <div className="bg-industrial-panel border border-industrial-border p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xs font-bold text-white tracking-widest uppercase flex items-center gap-2">
                      <Settings2 className="w-3 h-3 text-industrial-amber" />
                      Workflow Parameters
                    </h3>
                    <span className="text-[9px] font-mono text-industrial-text-dim uppercase px-1.5 py-0.5 border border-industrial-border">Auto-save: ON</span>
                  </div>

                  <div className="space-y-6">
                    {/* Toggle: Standardize */}
                    <div className="flex items-center justify-between group">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-white uppercase tracking-wider">Standardize</span>
                        <span className="text-[9px] text-industrial-text-dim uppercase">Match sample rate & bit depth</span>
                      </div>
                      <button 
                        onClick={() => setConformerToggles(prev => ({ ...prev, standardize: !prev.standardize }))}
                        className={`w-10 h-5 relative transition-colors duration-200 ${conformerToggles.standardize ? 'bg-industrial-amber' : 'bg-industrial-border'}`}
                      >
                        <motion.div 
                          animate={{ x: conformerToggles.standardize ? 22 : 2 }}
                          className={`absolute top-1 w-3 h-3 ${conformerToggles.standardize ? 'bg-black' : 'bg-industrial-text-dim'}`}
                        />
                      </button>
                    </div>

                    {/* Toggle: Normalization */}
                    <div className="flex items-center justify-between group">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-white uppercase tracking-wider">Loudness Normalization</span>
                        <span className="text-[9px] text-industrial-text-dim uppercase">Target: -23 LUFS (EBU R128)</span>
                      </div>
                      <button 
                        onClick={() => setConformerToggles(prev => ({ ...prev, normalization: !prev.normalization }))}
                        className={`w-10 h-5 relative transition-colors duration-200 ${conformerToggles.normalization ? 'bg-industrial-amber' : 'bg-industrial-border'}`}
                      >
                        <motion.div 
                          animate={{ x: conformerToggles.normalization ? 22 : 2 }}
                          className={`absolute top-1 w-3 h-3 ${conformerToggles.normalization ? 'bg-black' : 'bg-industrial-text-dim'}`}
                        />
                      </button>
                    </div>

                    {/* Toggle: Trimming */}
                    <div className="flex items-center justify-between group">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-white uppercase tracking-wider">Silent Trimming</span>
                        <span className="text-[9px] text-industrial-text-dim uppercase">Remove silence from start/end</span>
                      </div>
                      <button 
                        onClick={() => setConformerToggles(prev => ({ ...prev, trimming: !prev.trimming }))}
                        className={`w-10 h-5 relative transition-colors duration-200 ${conformerToggles.trimming ? 'bg-industrial-amber' : 'bg-industrial-border'}`}
                      >
                        <motion.div 
                          animate={{ x: conformerToggles.trimming ? 22 : 2 }}
                          className={`absolute top-1 w-3 h-3 ${conformerToggles.trimming ? 'bg-black' : 'bg-industrial-text-dim'}`}
                        />
                      </button>
                    </div>
                  </div>

                  <button 
                    onClick={startBatchProcessing}
                    disabled={isProcessing}
                    className={`w-full mt-8 py-4 flex items-center justify-center gap-3 font-black tracking-[0.2em] uppercase transition-all duration-300 ${
                      isProcessing 
                      ? 'bg-industrial-border text-industrial-text-dim cursor-not-allowed' 
                      : 'bg-industrial-amber text-black hover:bg-white active:scale-[0.98]'
                    }`}
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-industrial-text-dim border-t-white rounded-full animate-spin"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        <Zap className="w-5 h-5 fill-current" />
                        Start Batch Processing
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Right Panel: File Queue */}
              <div className="flex-1 bg-industrial-panel border border-industrial-border flex flex-col overflow-hidden">
                <div className="p-4 border-b border-industrial-border flex items-center justify-between bg-black/20">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-industrial-amber animate-pulse"></div>
                    <h3 className="text-xs font-bold text-white tracking-widest uppercase">File Queue</h3>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] font-mono">
                    <span className="text-industrial-text-dim uppercase">Total: <span className="text-white">12</span></span>
                    <span className="text-industrial-text-dim uppercase">Processed: <span className="text-industrial-cyan">8</span></span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                  {/* Active Item */}
                  <div className="bg-industrial-bg border-l-4 border-industrial-amber p-4 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <FileAudio className="w-5 h-5 text-industrial-amber" />
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-white uppercase tracking-wider">VOCAL_TRACK_09.wav</span>
                          <span className="text-[9px] text-industrial-text-dim uppercase">48kHz / 24-bit / 03:42</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-industrial-amber bg-industrial-amber/10 px-2 py-0.5 uppercase">Active</span>
                    </div>
                    <div className="h-1 bg-industrial-border w-full relative">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${processingProgress}%` }}
                        className="h-full bg-industrial-amber"
                      />
                    </div>
                    <div className="flex justify-between mt-2 text-[9px] font-mono text-industrial-text-dim uppercase">
                      <span>Processing alignment...</span>
                      <span>{processingProgress}%</span>
                    </div>
                  </div>

                  {/* Waiting Items */}
                  {[10, 11, 12].map((num) => (
                    <div key={num} className="bg-industrial-panel border border-industrial-border p-4 flex items-center justify-between opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-300">
                      <div className="flex items-center gap-3">
                        <FileAudio className="w-5 h-5 text-industrial-text-dim" />
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-white uppercase tracking-wider">VOCAL_TRACK_{num}.wav</span>
                          <span className="text-[9px] text-industrial-text-dim uppercase">Waiting in queue</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-industrial-text-dim uppercase">Pending</span>
                    </div>
                  ))}

                  {/* Completed Items */}
                  {[8, 7, 6, 5].map((num) => (
                    <div key={num} className="bg-industrial-panel border border-industrial-border p-4 flex items-center justify-between opacity-40">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-industrial-cyan" />
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-white uppercase tracking-wider">VOCAL_TRACK_0{num}.wav</span>
                          <span className="text-[9px] text-industrial-cyan uppercase">Conformed successfully</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-industrial-cyan uppercase">Done</span>
                    </div>
                  ))}
                </div>

                {/* Visualizer Bar */}
                <div className="h-12 bg-black border-t border-industrial-border flex items-end justify-center gap-[2px] p-2 overflow-hidden">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ 
                        height: isProcessing ? [4, Math.random() * 32 + 4, 4] : 4 
                      }}
                      transition={{ 
                        repeat: Infinity, 
                        duration: 0.5 + Math.random() * 0.5,
                        ease: "easeInOut"
                      }}
                      className={`w-1.5 ${isProcessing ? 'bg-industrial-amber' : 'bg-industrial-border'}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard label="Tracks Indexed" value={`${libraryStats.totalTracks}`} colorClass="border-industrial-cyan" />
            <StatCard label="Mission Time" value={uptime} />
            <StatCard label="Duplicates" value={`${libraryStats.duplicates}`} colorClass="border-industrial-red" />
            <div className="bg-industrial-border/20 p-4 flex items-center justify-between group cursor-pointer hover:bg-industrial-border/40 transition-colors border border-industrial-border">
              <div>
                <p className="font-mono text-[10px] text-industrial-text-dim uppercase">Last Scan</p>
                <p className="text-xs font-mono font-bold uppercase">{libraryStats.lastScan}</p>
              </div>
              <RefreshCcw className="w-5 h-5 text-industrial-text-dim group-hover:text-industrial-amber transition-transform group-hover:rotate-180 duration-500" />
            </div>
          </div>

          {/* Log Section */}
          <section className="bg-black p-6 border border-industrial-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-mono font-bold text-industrial-text-dim tracking-widest uppercase flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-industrial-cyan"></span>
                Mission Log
              </h3>
              <span className="text-[9px] font-mono text-industrial-text-dim/30 uppercase tracking-tighter">Kernel v2.0.4-LTS</span>
            </div>
            <div className="space-y-px h-48 overflow-y-auto pr-2 custom-scrollbar recessed-well bg-industrial-bg/30 p-2">
              {logs.map((log, i) => (
                <div key={i}>
                  <LogEntry time={log.time} type={log.type} message={log.message} />
                </div>
              ))}
            </div>
          </section>
          {currentModule === 'librarian' && (
            <div className="space-y-8">
              {/* Header & Action Row */}
              <div className="flex justify-between items-end border-b border-industrial-border pb-6">
                <div>
                  <h2 className="text-5xl font-black font-sans tracking-tighter uppercase mb-2 leading-none">Librarian</h2>
                  <p className="font-mono text-[10px] text-industrial-cyan flex items-center gap-2 tracking-widest">
                    <span className="w-2 h-2 bg-industrial-cyan animate-pulse"></span>
                    CATALOG_SYNC: ACTIVE ({tracks.length} RECORDS)
                  </p>
                </div>
                <div className="flex gap-px">
                  <button 
                    onClick={() => addLog('[INFO]', 'Metadata changes saved to database.')}
                    className="bg-industrial-amber text-black px-8 py-4 font-bold text-xs uppercase tracking-widest hover:bg-white active:scale-95 transition-all glow-amber"
                  >
                    SAVE METADATA CHANGES
                  </button>
                  <button 
                    onClick={() => setCurrentModule('hub')}
                    className="bg-industrial-panel text-industrial-text-dim px-6 py-4 font-bold text-xs uppercase tracking-widest hover:bg-industrial-border transition-all"
                  >
                    CANCEL
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-8">
                {/* Left Panel: Data Grid & Search (8 Cols) */}
                <div className="col-span-12 lg:col-span-8 flex flex-col gap-8">
                  {/* Scrubbing Level Selection */}
                  <section className="bg-industrial-panel p-6 border border-industrial-border">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xs font-bold text-white tracking-widest uppercase flex items-center gap-2">
                        <Activity className="w-3 h-3 text-industrial-amber" />
                        Scrubbing Intensity
                      </h3>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { level: 1, label: 'BASIC', desc: 'CORE TAGS' },
                        { level: 2, label: 'EXTENDED', desc: 'BPM / KEY' },
                        { level: 3, label: 'DEEP', desc: 'FULL ID3' },
                      ].map((l) => (
                        <button
                          key={l.level}
                          onClick={() => setScrubbingLevel(l.level)}
                          className={`p-3 border transition-all text-center ${
                            scrubbingLevel === l.level 
                              ? 'border-industrial-amber bg-industrial-amber/10' 
                              : 'border-industrial-border hover:border-industrial-text-dim/50 bg-black/40'
                          }`}
                        >
                          <div className={`text-xs font-black ${scrubbingLevel === l.level ? 'text-industrial-amber' : 'text-white'}`}>LVL {l.level}</div>
                          <div className="text-[8px] font-mono text-industrial-text-dim uppercase mt-1">{l.label}</div>
                          <div className="text-[7px] font-mono text-industrial-text-dim/50 uppercase mt-0.5">{l.desc}</div>
                        </button>
                      ))}
                    </div>
                  </section>

                  {/* Advanced Search Module */}
                  <section className="bg-industrial-panel p-6 border border-industrial-border">
                    <div className="flex items-center justify-between mb-4 border-l-2 border-industrial-amber pl-4">
                      <span className="font-mono text-[10px] font-bold text-industrial-amber tracking-widest uppercase">SQLITE_QUERY_BUILDER</span>
                      <span className="font-mono text-[9px] text-industrial-text-dim uppercase tracking-tighter">Filter by: Artist, Album, BPM, Key</span>
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-industrial-text-dim" />
                        <input 
                          value={librarianSearch}
                          onChange={(e) => setLibrarianSearch(e.target.value)}
                          className="w-full bg-black border-b-2 border-industrial-border p-4 pl-12 font-mono text-sm text-white focus:border-industrial-amber focus:outline-none transition-all" 
                          placeholder="SELECT * FROM tracks WHERE genre='Techno' AND bpm > 128..." 
                          type="text"
                        />
                      </div>
                      <button className="bg-industrial-border px-8 font-bold text-xs uppercase tracking-widest hover:bg-white hover:text-black transition-colors border border-industrial-border/30">
                        EXECUTE
                      </button>
                    </div>
                  </section>

                  {/* Data Table (The "Rack Mount" Style) */}
                  <div className="bg-black overflow-hidden border border-industrial-border recessed-well">
                    <div className="grid grid-cols-12 bg-industrial-panel p-4 text-[10px] font-mono text-industrial-text-dim uppercase tracking-widest border-b border-industrial-border">
                      <div className="col-span-1 flex justify-center">
                        <input 
                          type="checkbox" 
                          checked={selectedTracks.size === tracks.length}
                          onChange={toggleAllTracks}
                          className="w-4 h-4 rounded-none border-industrial-border bg-transparent text-industrial-amber focus:ring-0"
                        />
                      </div>
                      <div className="col-span-4">Track Title</div>
                      <div className="col-span-3">Artist / Project</div>
                      <div className="col-span-2">Genre</div>
                      <div className="col-span-1 text-right">BPM</div>
                      <div className="col-span-1 text-right">Bitrate</div>
                    </div>
                    <div className="h-[500px] overflow-y-auto custom-scrollbar">
                      {tracks.filter(t => t.title.toLowerCase().includes(librarianSearch.toLowerCase())).map((track) => (
                        <div 
                          key={track.id}
                          onClick={() => toggleTrackSelection(track.id)}
                          className={`grid grid-cols-12 p-4 items-center text-xs font-mono border-b border-industrial-border/20 hover:bg-industrial-panel transition-colors cursor-pointer group ${
                            selectedTracks.has(track.id) ? 'bg-industrial-amber/5 border-l-2 border-l-industrial-amber' : ''
                          }`}
                        >
                          <div className="col-span-1 flex justify-center">
                            <input 
                              type="checkbox" 
                              checked={selectedTracks.has(track.id)}
                              onChange={() => {}} // Handled by div click
                              className="w-4 h-4 rounded-none border-industrial-border bg-transparent text-industrial-amber focus:ring-0"
                            />
                          </div>
                          <div className={`col-span-4 font-bold ${selectedTracks.has(track.id) ? 'text-industrial-amber' : 'text-white'}`}>
                            {track.title}
                          </div>
                          <div className="col-span-3 text-industrial-text-dim">{track.artist}</div>
                          <div className="col-span-2">
                            <span className={`px-2 py-0.5 text-[9px] ${track.genre === 'INDUSTRIAL' ? 'bg-industrial-cyan/10 text-industrial-cyan' : 'bg-industrial-border text-industrial-text-dim'}`}>
                              {track.genre}
                            </span>
                          </div>
                          <div className="col-span-1 text-right text-industrial-text-dim/70">{track.bpm}</div>
                          <div className="col-span-1 text-right text-industrial-text-dim/70">{track.bitrate}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Panel: Bulk Edit & Artwork (4 Cols) */}
                <div className="col-span-12 lg:col-span-4 flex flex-col gap-8">
                  {/* Bulk Edit Console */}
                  <section className="bg-industrial-panel p-8 border-t-4 border-industrial-amber shadow-xl">
                    <h3 className="font-bold text-sm uppercase tracking-widest mb-8 flex items-center gap-3">
                      <FileEdit className="w-5 h-5 text-industrial-amber" />
                      Bulk Editor ({selectedTracks.size} Selected)
                    </h3>
                    <div className="space-y-8">
                      <div>
                        <label className="block font-mono text-[10px] text-industrial-text-dim uppercase tracking-widest mb-3">Overwrite Title Pattern</label>
                        <input 
                          value={bulkEdit.titlePattern}
                          onChange={(e) => setBulkEdit(prev => ({ ...prev, titlePattern: e.target.value }))}
                          className="w-full bg-black border-b border-industrial-border p-3 font-mono text-sm text-industrial-amber focus:border-industrial-amber focus:outline-none transition-all" 
                          placeholder="%TRACK% - %ARTIST% [REMASTER]" 
                          type="text"
                        />
                      </div>
                      <div>
                        <label className="block font-mono text-[10px] text-industrial-text-dim uppercase tracking-widest mb-3">Artist Identity</label>
                        <input 
                          value={bulkEdit.artist}
                          onChange={(e) => setBulkEdit(prev => ({ ...prev, artist: e.target.value }))}
                          className="w-full bg-black border-b border-industrial-border p-3 font-mono text-sm text-white focus:border-industrial-amber focus:outline-none transition-all" 
                          type="text"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <label className="block font-mono text-[10px] text-industrial-text-dim uppercase tracking-widest mb-3">Genre</label>
                          <select 
                            value={bulkEdit.genre}
                            onChange={(e) => setBulkEdit(prev => ({ ...prev, genre: e.target.value }))}
                            className="w-full bg-black border-b border-industrial-border p-3 font-mono text-sm text-white appearance-none rounded-none focus:outline-none focus:border-industrial-amber transition-all"
                          >
                            <option>Industrial</option>
                            <option>Techno</option>
                            <option>Ambient</option>
                            <option>Glitch</option>
                          </select>
                        </div>
                        <div>
                          <label className="block font-mono text-[10px] text-industrial-text-dim uppercase tracking-widest mb-3">Year</label>
                          <input 
                            value={bulkEdit.year}
                            onChange={(e) => setBulkEdit(prev => ({ ...prev, year: parseInt(e.target.value) }))}
                            className="w-full bg-black border-b border-industrial-border p-3 font-mono text-sm text-white focus:border-industrial-amber focus:outline-none transition-all" 
                            type="number"
                          />
                        </div>
                      </div>
                      <button 
                        onClick={() => addLog('[SYNC]', `Applied metadata changes to ${selectedTracks.size} tracks.`)}
                        className="w-full bg-industrial-border border border-industrial-border/50 text-[10px] font-bold uppercase tracking-widest p-4 hover:bg-white hover:text-black transition-all active:scale-95"
                      >
                        Apply Changes to Selection
                      </button>
                    </div>
                  </section>

                  {/* Artwork Module */}
                  <section className="bg-industrial-panel p-8 border border-industrial-border">
                    <h3 className="font-bold text-sm uppercase tracking-widest mb-8 flex items-center gap-3">
                      <ImageIcon className="w-5 h-5 text-industrial-cyan" />
                      Artwork Panel
                    </h3>
                    <div className="relative group mb-8 aspect-square bg-black overflow-hidden flex items-center justify-center border border-industrial-border/20">
                      <img 
                        alt="Cover Art" 
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-700 grayscale group-hover:grayscale-0 scale-110 group-hover:scale-100" 
                        src="https://picsum.photos/seed/artwork/800/800"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                        <span className="font-mono text-[10px] text-black bg-industrial-amber px-3 py-1 mb-3 font-bold">REPLACE_SRC</span>
                        <span className="font-mono text-[8px] text-industrial-text-dim uppercase tracking-[0.2em]">1400x1400 .PNG</span>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <button 
                        onClick={() => addLog('[INFO]', 'Scrubbing Discogs API for missing artwork...')}
                        className="w-full bg-industrial-cyan text-black font-black text-[10px] uppercase tracking-[0.2em] py-4 hover:brightness-110 active:scale-95 transition-all glow-cyan"
                      >
                        SCRUB & FETCH MISSING ART
                      </button>
                      <p className="font-mono text-[8px] text-center text-industrial-text-dim uppercase tracking-[0.3em]">Provider: Discogs API (Priority 1)</p>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          )}

          {currentModule === 'settings' && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
              <div className="w-24 h-24 bg-industrial-amber/10 flex items-center justify-center border border-industrial-border">
                <Settings className="w-12 h-12 text-industrial-amber" />
              </div>
              <div>
                <h2 className="text-4xl font-black font-sans tracking-tighter uppercase mb-2">Settings</h2>
                <p className="text-industrial-text-dim font-mono text-xs uppercase tracking-[0.3em]">System Configuration</p>
              </div>
              <p className="max-w-md text-industrial-text-dim text-sm leading-relaxed">
                Global system parameters and operator preferences are currently locked by administrative override. Please contact the system administrator for access.
              </p>
              <button 
                onClick={() => setCurrentModule('hub')}
                className="px-8 py-3 border-2 border-industrial-amber text-industrial-amber font-bold uppercase tracking-widest text-xs hover:bg-industrial-amber hover:text-black transition-all"
              >
                Return to Hub
              </button>
            </div>
          )}
        </main>

        {/* Footer Status Bar */}
        <footer className="fixed bottom-0 left-64 right-0 h-8 bg-black border-t border-industrial-border flex items-center justify-between px-6 z-50">
          <div className="flex items-center gap-4">
            <span className="font-mono text-[9px] uppercase tracking-widest text-industrial-text-dim/50">
              TAURI V2.0.4 | RUST ENGINE: <span className="text-industrial-cyan">ACTIVE</span>
            </span>
          </div>
          <div className="flex items-center gap-6 font-mono text-[9px] uppercase tracking-widest text-industrial-text-dim/50">
            <span>Active Tasks: <span className="text-industrial-amber">0</span></span>
            <span>Hardware Link: <span className="text-industrial-cyan">OK</span></span>
          </div>
        </footer>
      </div>
    </div>
  );
}
