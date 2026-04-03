import { useState } from 'react';
import { Activity, Search, FileEdit, Image as ImageIcon } from 'lucide-react';
import { useAppStore } from '../../store/appStore';

interface Track {
  id: string;
  title: string;
  artist: string;
  genre: string;
  bpm: number | string;
  bitrate: string;
}

const MOCK_TRACKS: Track[] = [
  { id: 't1', title: 'Summer_Hits_2024_Mix.mp3',      artist: 'Various Artists', genre: 'POP',         bpm: 120,  bitrate: '320kbps' },
  { id: 't2', title: 'Late_Night_Jazz_Set.mp3',       artist: 'Unknown Artist',  genre: 'JAZZ',        bpm: 88,   bitrate: '192kbps' },
  { id: 't3', title: 'Track_001_NoTag.mp3',           artist: 'Unknown Artist',  genre: 'UNKNOWN',     bpm: '--', bitrate: '128kbps' },
  { id: 't4', title: 'Track_002_NoTag.mp3',           artist: 'Unknown Artist',  genre: 'UNKNOWN',     bpm: '--', bitrate: '128kbps' },
  { id: 't5', title: 'Track_003_NoTag.mp3',           artist: 'Unknown Artist',  genre: 'UNKNOWN',     bpm: '--', bitrate: '64kbps'  },
  { id: 't6', title: 'Electronic_Promo_Spring.mp3',   artist: 'Various Artists', genre: 'ELECTRONIC',  bpm: 128,  bitrate: '256kbps' },
  { id: 't7', title: 'Classic_Rock_Anthology_07.mp3', artist: 'Unknown Artist',  genre: 'ROCK',        bpm: '--', bitrate: '192kbps' },
  { id: 't8', title: 'Jingle_Station_ID_01.wav',      artist: 'Runtime Radio',   genre: 'JINGLE',      bpm: '--', bitrate: '24bit'   },
];

const SCRUB_LEVELS = [
  { level: 1, label: 'BASIC',    desc: 'CORE TAGS' },
  { level: 2, label: 'EXTENDED', desc: 'BPM / KEY'  },
  { level: 3, label: 'DEEP',     desc: 'FULL ID3'   },
];

export function LibrarianModule() {
  const { addLog, setModule } = useAppStore();

  const [scrubbingLevel, setScrubbingLevel] = useState(1);
  const [searchQuery, setSearchQuery]       = useState('');
  const [selected, setSelected]             = useState<Set<string>>(new Set(['t1', 't2']));
  const [bulkEdit, setBulkEdit]             = useState({
    titlePattern: '',
    artist: '',
    genre: 'Unknown',
    year: new Date().getFullYear(),
  });

  const toggleTrack = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(selected.size === MOCK_TRACKS.length ? new Set() : new Set(MOCK_TRACKS.map((t) => t.id)));

  const visibleTracks = MOCK_TRACKS.filter((t) =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-8">

      {/* ── Header & Action Row ───────────────────────────────── */}
      <div className="flex justify-between items-end border-b border-industrial-border pb-6">
        <div>
          <h2 className="text-5xl font-black font-sans tracking-tighter uppercase mb-2 leading-none">
            Librarian
          </h2>
          <p className="font-mono text-[10px] text-industrial-cyan flex items-center gap-2 tracking-widest">
            <span className="w-2 h-2 bg-industrial-cyan animate-pulse" />
            CATALOG_SYNC: ACTIVE ({MOCK_TRACKS.length} RECORDS)
          </p>
        </div>
        <div className="flex gap-px">
          <button
            onClick={() => addLog('success', `Metadata changes saved to database.`)}
            className="bg-industrial-amber text-black px-8 py-4 font-bold text-xs uppercase tracking-widest hover:bg-white active:scale-95 transition-all glow-amber"
          >
            SAVE METADATA CHANGES
          </button>
          <button
            onClick={() => setModule('hub')}
            className="bg-industrial-panel text-industrial-text-dim px-6 py-4 font-bold text-xs uppercase tracking-widest hover:bg-industrial-border transition-all"
          >
            CANCEL
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8">

        {/* ── Left: Data Grid (8 cols) ─────────────────────────── */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-8">

          {/* Scrubbing Intensity */}
          <section className="bg-industrial-panel p-6 border border-industrial-border">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-bold text-white tracking-widest uppercase flex items-center gap-2">
                <Activity className="w-3 h-3 text-industrial-amber" />
                Scrubbing Intensity
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {SCRUB_LEVELS.map((l) => (
                <button
                  key={l.level}
                  onClick={() => setScrubbingLevel(l.level)}
                  className={`p-3 border transition-all text-center ${
                    scrubbingLevel === l.level
                      ? 'border-industrial-amber bg-industrial-amber/10'
                      : 'border-industrial-border hover:border-industrial-text-dim/50 bg-black/40'
                  }`}
                >
                  <div className={`text-xs font-black ${scrubbingLevel === l.level ? 'text-industrial-amber' : 'text-white'}`}>
                    LVL {l.level}
                  </div>
                  <div className="text-[8px] font-mono text-industrial-text-dim uppercase mt-1">{l.label}</div>
                  <div className="text-[7px] font-mono text-industrial-text-dim/50 uppercase mt-0.5">{l.desc}</div>
                </button>
              ))}
            </div>
          </section>

          {/* SQLite Query Builder */}
          <section className="bg-industrial-panel p-6 border border-industrial-border">
            <div className="flex items-center justify-between mb-4 border-l-2 border-industrial-amber pl-4">
              <span className="font-mono text-[10px] font-bold text-industrial-amber tracking-widest uppercase">
                SQLITE_QUERY_BUILDER
              </span>
              <span className="font-mono text-[9px] text-industrial-text-dim uppercase tracking-tighter">
                Filter by: Artist, Album, BPM, Key
              </span>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-industrial-text-dim" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black border-b-2 border-industrial-border p-4 pl-12 font-mono text-sm text-white focus:border-industrial-amber focus:outline-none transition-all"
                  placeholder="SELECT * FROM tracks WHERE genre='Techno' AND bpm > 128..."
                />
              </div>
              <button className="bg-industrial-border px-8 font-bold text-xs uppercase tracking-widest hover:bg-white hover:text-black transition-colors border border-industrial-border/30">
                EXECUTE
              </button>
            </div>
          </section>

          {/* Track Table */}
          <div className="bg-black overflow-hidden border border-industrial-border recessed-well">
            {/* Table header */}
            <div className="grid grid-cols-12 bg-industrial-panel p-4 text-[10px] font-mono text-industrial-text-dim uppercase tracking-widest border-b border-industrial-border">
              <div className="col-span-1 flex justify-center">
                <input
                  type="checkbox"
                  checked={selected.size === MOCK_TRACKS.length}
                  onChange={toggleAll}
                  className="w-4 h-4 accent-industrial-amber"
                />
              </div>
              <div className="col-span-4">Track Title</div>
              <div className="col-span-3">Artist / Project</div>
              <div className="col-span-2">Genre</div>
              <div className="col-span-1 text-right">BPM</div>
              <div className="col-span-1 text-right">Bitrate</div>
            </div>

            {/* Table rows */}
            <div className="h-[500px] overflow-y-auto custom-scrollbar">
              {visibleTracks.map((track) => (
                <div
                  key={track.id}
                  onClick={() => toggleTrack(track.id)}
                  className={`grid grid-cols-12 p-4 items-center text-xs font-mono border-b border-industrial-border/20 hover:bg-industrial-panel transition-colors cursor-pointer ${
                    selected.has(track.id) ? 'bg-industrial-amber/5 border-l-2 border-l-industrial-amber' : ''
                  }`}
                >
                  <div className="col-span-1 flex justify-center">
                    <input
                      type="checkbox"
                      checked={selected.has(track.id)}
                      onChange={() => {}}
                      className="w-4 h-4 accent-industrial-amber"
                    />
                  </div>
                  <div className={`col-span-4 font-bold ${selected.has(track.id) ? 'text-industrial-amber' : 'text-white'}`}>
                    {track.title}
                  </div>
                  <div className="col-span-3 text-industrial-text-dim">{track.artist}</div>
                  <div className="col-span-2">
                    <span className={`px-2 py-0.5 text-[9px] ${
                      track.genre === 'UNKNOWN'
                        ? 'bg-industrial-red/10 text-industrial-red'
                        : 'bg-industrial-cyan/10 text-industrial-cyan'
                    }`}>
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

        {/* ── Right: Bulk Editor + Artwork (4 cols) ────────────── */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-8">

          {/* Bulk Edit Console */}
          <section className="bg-industrial-panel p-8 border-t-4 border-industrial-amber shadow-xl">
            <h3 className="font-bold text-sm uppercase tracking-widest mb-8 flex items-center gap-3">
              <FileEdit className="w-5 h-5 text-industrial-amber" />
              Bulk Editor ({selected.size} Selected)
            </h3>
            <div className="space-y-8">
              <div>
                <label className="block font-mono text-[10px] text-industrial-text-dim uppercase tracking-widest mb-3">
                  Overwrite Title Pattern
                </label>
                <input
                  value={bulkEdit.titlePattern}
                  onChange={(e) => setBulkEdit((p) => ({ ...p, titlePattern: e.target.value }))}
                  className="w-full bg-black border-b border-industrial-border p-3 font-mono text-sm text-industrial-amber focus:border-industrial-amber focus:outline-none transition-all"
                  placeholder="%TRACK% - %ARTIST% [REMASTER]"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] text-industrial-text-dim uppercase tracking-widest mb-3">
                  Artist Identity
                </label>
                <input
                  value={bulkEdit.artist}
                  onChange={(e) => setBulkEdit((p) => ({ ...p, artist: e.target.value }))}
                  className="w-full bg-black border-b border-industrial-border p-3 font-mono text-sm text-white focus:border-industrial-amber focus:outline-none transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block font-mono text-[10px] text-industrial-text-dim uppercase tracking-widest mb-3">
                    Genre
                  </label>
                  <select
                    value={bulkEdit.genre}
                    onChange={(e) => setBulkEdit((p) => ({ ...p, genre: e.target.value }))}
                    className="w-full bg-black border-b border-industrial-border p-3 font-mono text-sm text-white appearance-none focus:outline-none focus:border-industrial-amber transition-all"
                  >
                    <option>Unknown</option>
                    <option>Pop</option>
                    <option>Rock</option>
                    <option>Jazz</option>
                    <option>Electronic</option>
                    <option>Hip-Hop</option>
                    <option>Classical</option>
                    <option>Jingle</option>
                    <option>Podcast</option>
                  </select>
                </div>
                <div>
                  <label className="block font-mono text-[10px] text-industrial-text-dim uppercase tracking-widest mb-3">
                    Year
                  </label>
                  <input
                    value={bulkEdit.year}
                    onChange={(e) => setBulkEdit((p) => ({ ...p, year: parseInt(e.target.value) }))}
                    className="w-full bg-black border-b border-industrial-border p-3 font-mono text-sm text-white focus:border-industrial-amber focus:outline-none transition-all"
                    type="number"
                  />
                </div>
              </div>
              <button
                onClick={() => addLog('success', `Applied metadata changes to ${selected.size} tracks.`)}
                className="w-full bg-industrial-border border border-industrial-border/50 text-[10px] font-bold uppercase tracking-widest p-4 hover:bg-white hover:text-black transition-all active:scale-95"
              >
                Apply Changes to Selection
              </button>
            </div>
          </section>

          {/* Artwork Panel */}
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
                <span className="font-mono text-[10px] text-black bg-industrial-amber px-3 py-1 mb-3 font-bold">
                  REPLACE_SRC
                </span>
                <span className="font-mono text-[8px] text-industrial-text-dim uppercase tracking-[0.2em]">
                  1400x1400 .PNG
                </span>
              </div>
            </div>
            <div className="space-y-4">
              <button
                onClick={() => addLog('info', 'Scrubbing Discogs API for missing artwork...')}
                className="w-full bg-industrial-cyan text-black font-black text-[10px] uppercase tracking-[0.2em] py-4 hover:brightness-110 active:scale-95 transition-all glow-cyan"
              >
                SCRUB & FETCH MISSING ART
              </button>
              <p className="font-mono text-[8px] text-center text-industrial-text-dim uppercase tracking-[0.3em]">
                Provider: Discogs API (Priority 1)
              </p>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
