import { useState, useEffect } from 'react';
import { Activity, Search, FileEdit, Image as ImageIcon, Disc, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../store/appStore';

interface LibrarianTrack {
  id: number;
  path: string;
  filename: string;
  artist: string | null;
  title: string | null;
  album: string | null;
  year: number | null;
  genre: string | null;
  bitrate: number | null;
  sampleRate: number | null;
  durationSecs: number | null;
  format: string | null;
  hasCover: boolean;
}

interface MetadataUpdatePayload {
  trackId: number;
  artist?: string | null;
  title?: string | null;
  album?: string | null;
  year?: number | null;
  genre?: string | null;
}

interface BulkScrubResult {
  processed: number;
  scrubbed: number;
  failed: number;
}

interface ArtworkExtractResult {
  total: number;
  extracted: number;
  failed: number;
}

const SCRUB_LEVELS = [
  { level: 1, label: 'BROADCAST', desc: 'STRIP URL / DJ JUNK' },
  { level: 2, label: 'EXTENDED',  desc: 'KEEP BPM & KEY'       },
  { level: 3, label: 'DEEP',      desc: 'RE-ENCODE TO UTF-8'   },
];

export function LibrarianModule() {
  const { workspacePath, addLog } = useAppStore();

  const [tracks, setTracks]                   = useState<LibrarianTrack[]>([]);
  const [loading, setLoading]                 = useState(false);
  const [scrubbingLevel, setScrubbingLevel]   = useState(1);
  const [searchQuery, setSearchQuery]         = useState('');
  const [selected, setSelected]               = useState<Set<number>>(new Set());
  const [activeTrackId, setActiveTrackId]     = useState<number | null>(null);

  // Form stato bulk edit
  const [bulkEdit, setBulkEdit] = useState({
    artist: '',
    album: '',
    genre: 'Unknown',
    year: new Date().getFullYear(),
  });

  // Form stato single edit (per traccia attiva)
  const [singleEdit, setSingleEdit] = useState({
    title: '',
    artist: '',
    album: '',
    genre: '',
    year: new Date().getFullYear(),
  });

  const [isSaving, setIsSaving]               = useState(false);
  const [isScrubbing, setIsScrubbing]         = useState(false);
  const [isExtractingArt, setIsExtractingArt] = useState(false);

  // Caricamento dati da SQLite con supporto FTS5
  const loadTracks = async (query?: string) => {
    if (!workspacePath) {
      setTracks([]);
      setSelected(new Set());
      setActiveTrackId(null);
      return;
    }

    setLoading(true);
    try {
      const q = query !== undefined ? query : searchQuery;
      const res = await invoke<LibrarianTrack[]>('get_librarian_tracks', {
        workspacePath,
        searchQuery: q.trim() ? q.trim() : null,
        limit: 250,
        offset: 0,
      });
      setTracks(res);

      if (res.length > 0 && (activeTrackId === null || !res.some(t => t.id === activeTrackId))) {
        selectTrackForEdit(res[0]);
      }
    } catch (err) {
      addLog('error', 'Librarian: errore nel caricamento catalogo', String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTracks();
  }, [workspacePath]);

  const selectTrackForEdit = (t: LibrarianTrack) => {
    setActiveTrackId(t.id);
    setSingleEdit({
      title: t.title || t.filename,
      artist: t.artist || '',
      album: t.album || '',
      genre: t.genre || 'Unknown',
      year: t.year || new Date().getFullYear(),
    });
  };

  const toggleTrack = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

    const tr = tracks.find(t => t.id === id);
    if (tr) {
      selectTrackForEdit(tr);
    }
  };

  const toggleAll = () => {
    if (selected.size === tracks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(tracks.map((t) => t.id)));
    }
  };

  // Salva modifiche della traccia attiva sul file fisico e sul DB
  const handleSaveActiveTrack = async () => {
    if (!activeTrackId) return;
    setIsSaving(true);
    try {
      const payload: MetadataUpdatePayload = {
        trackId: activeTrackId,
        artist: singleEdit.artist.trim() || null,
        title: singleEdit.title.trim() || null,
        album: singleEdit.album.trim() || null,
        year: Number(singleEdit.year) || null,
        genre: singleEdit.genre.trim() || null,
      };

      await invoke('save_track_metadata', { payload });
      addLog('success', `Librarian: tag salvati con successo per traccia #${activeTrackId}.`);
      await loadTracks();
    } catch (err) {
      addLog('error', 'Librarian: errore durante il salvataggio dei tag', String(err));
    } finally {
      setIsSaving(false);
    }
  };

  // Applica bulk edit alle tracce selezionate
  const handleApplyBulk = async () => {
    if (selected.size === 0) {
      addLog('warning', 'Librarian: nessuna traccia selezionata per la modifica massiva.');
      return;
    }
    setIsSaving(true);
    try {
      const count = await invoke<number>('bulk_update_metadata', {
        trackIds: Array.from(selected),
        artist: bulkEdit.artist.trim() || null,
        genre: bulkEdit.genre !== 'Unknown' ? bulkEdit.genre : null,
        year: Number(bulkEdit.year) || null,
        album: bulkEdit.album.trim() || null,
      });

      addLog('success', `Librarian: modifiche massive applicate a ${count} tracce.`);
      await loadTracks();
    } catch (err) {
      addLog('error', 'Librarian: errore durante il bulk update', String(err));
    } finally {
      setIsSaving(false);
    }
  };

  // Esegue lo scrubbing dei tag ID3/FLAC
  const handleScrubTags = async () => {
    if (selected.size === 0) {
      addLog('warning', 'Librarian: seleziona almeno un brano per eseguire lo scrubbing.');
      return;
    }

    setIsScrubbing(true);
    addLog('info', `Librarian: avvio scrubbing LVL ${scrubbingLevel} su ${selected.size} brani...`);
    try {
      const res = await invoke<BulkScrubResult>('scrub_track_tags', {
        trackIds: Array.from(selected),
        level: scrubbingLevel,
      });

      addLog(
        res.failed === 0 ? 'success' : 'warning',
        `Librarian: scrubbing completato. Puliti: ${res.scrubbed}/${res.processed}`,
        res.failed > 0 ? `Falliti: ${res.failed}` : undefined
      );
      await loadTracks();
    } catch (err) {
      addLog('error', 'Librarian: errore nello scrubbing dei tag', String(err));
    } finally {
      setIsScrubbing(false);
    }
  };

  // Estrazione copertine embedded
  const handleExtractArtwork = async () => {
    if (!workspacePath) {
      addLog('warning', 'Librarian: seleziona un workspace nell\'Hub prima di estrarre le copertine.');
      return;
    }

    setIsExtractingArt(true);
    addLog('info', 'Librarian: scansione copertine embedded ID3 / FLAC APIC in corso...');
    try {
      const res = await invoke<ArtworkExtractResult>('extract_embedded_artwork', {
        workspacePath,
      });

      addLog(
        'success',
        `Librarian: estrazione completata. ${res.extracted} copertine estratte e memorizzate in cache locale SQLite.`,
        res.failed > 0 ? `Non leggibili: ${res.failed}` : undefined
      );
      await loadTracks();
    } catch (err) {
      addLog('error', 'Librarian: errore estrazione copertine', String(err));
    } finally {
      setIsExtractingArt(false);
    }
  };

  const activeTrack = tracks.find(t => t.id === activeTrackId);

  return (
    <div className="space-y-5 select-none">

      {/* ── Header Rack Strip ─────────────────────────────────── */}
      <div className="bg-industrial-panel border border-industrial-border p-4 rounded rack-bevel flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-industrial-green/10 border border-industrial-green/30 rounded">
            <Disc className="w-5 h-5 text-industrial-green" />
          </div>
          <div>
            <h2 className="text-xl font-black font-display tracking-tight uppercase text-white flex items-center gap-2">
              STAGE 04 // THE LIBRARIAN <span className="text-industrial-green text-xs font-mono font-normal">// TAG &amp; ARTWORK STUDIO</span>
            </h2>
            <p className="font-mono text-[10px] text-industrial-text-dim uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-industrial-green glow-green-led" />
              FTS5 SQLITE CATALOG // {tracks.length} RECORDS LOADED
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveActiveTrack}
            disabled={isSaving || !activeTrackId}
            className={`px-5 py-2 font-display font-bold text-xs uppercase tracking-wider rounded transition-all active:scale-95 ${
              isSaving || !activeTrackId
                ? 'bg-industrial-border text-industrial-text-dim cursor-not-allowed'
                : 'bg-industrial-green text-black hover:bg-white glow-green-led'
            }`}
          >
            {isSaving ? 'SAVING...' : 'SAVE ACTIVE METADATA'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8">

        {/* ── Left: Data Grid (8 cols) ─────────────────────────── */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-8">

          {/* Scrubbing Intensity */}
          <section className="bg-industrial-panel p-6 border border-industrial-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-white tracking-widest uppercase flex items-center gap-2">
                <Activity className="w-3 h-3 text-industrial-amber" />
                Scrubbing Intensity & Broadcast Cleansing
              </h3>
              <button
                onClick={handleScrubTags}
                disabled={isScrubbing || selected.size === 0}
                className={`px-4 py-1.5 font-mono text-[9px] font-bold uppercase tracking-wider transition-all ${
                  isScrubbing || selected.size === 0
                    ? 'bg-industrial-border/40 text-industrial-text-dim cursor-not-allowed'
                    : 'bg-industrial-amber text-black hover:bg-white'
                }`}
              >
                {isScrubbing ? 'SCRUBBING...' : `SCRUB SELECTED (${selected.size})`}
              </button>
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

          {/* SQLite Query Builder / FTS Search */}
          <section className="bg-industrial-panel p-6 border border-industrial-border">
            <div className="flex items-center justify-between mb-4 border-l-2 border-industrial-amber pl-4">
              <span className="font-mono text-[10px] font-bold text-industrial-amber tracking-widest uppercase">
                SQLITE_FTS5_QUERY_ENGINE
              </span>
              <span className="font-mono text-[9px] text-industrial-text-dim uppercase tracking-tighter">
                Search in: Title, Artist, Album, Genre, Path
              </span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                loadTracks(searchQuery);
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-industrial-text-dim" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black border-b-2 border-industrial-border p-4 pl-12 font-mono text-sm text-white focus:border-industrial-amber focus:outline-none transition-all"
                  placeholder="Digita per cercare nei metadati o premi EXECUTE..."
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="bg-industrial-border px-8 font-bold text-xs uppercase tracking-widest hover:bg-white hover:text-black transition-colors border border-industrial-border/30 flex items-center gap-2"
              >
                {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                EXECUTE
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  loadTracks('');
                }}
                className="bg-industrial-panel px-4 font-mono text-xs uppercase tracking-widest text-industrial-text-dim hover:text-white border border-industrial-border"
                title="Reset ricerca"
              >
                RESET
              </button>
            </form>
          </section>

          {/* Track Table */}
          <div className="bg-black overflow-hidden border border-industrial-border recessed-well">
            {/* Table header */}
            <div className="grid grid-cols-12 bg-industrial-panel p-4 text-[10px] font-mono text-industrial-text-dim uppercase tracking-widest border-b border-industrial-border">
              <div className="col-span-1 flex justify-center">
                <input
                  type="checkbox"
                  checked={tracks.length > 0 && selected.size === tracks.length}
                  onChange={toggleAll}
                  className="w-4 h-4 accent-industrial-amber"
                />
              </div>
              <div className="col-span-4">Track Title</div>
              <div className="col-span-3">Artist / Project</div>
              <div className="col-span-2">Genre</div>
              <div className="col-span-1 text-right">Year</div>
              <div className="col-span-1 text-right">Bitrate</div>
            </div>

            {/* Table rows */}
            <div className="h-[460px] overflow-y-auto custom-scrollbar">
              {loading ? (
                <div className="h-64 flex items-center justify-center font-mono text-xs text-industrial-cyan uppercase">
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                  Interrogazione catalogo SQLite...
                </div>
              ) : tracks.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center font-mono text-xs text-industrial-text-dim uppercase text-center p-8">
                  <Disc className="w-10 h-10 text-industrial-border mb-3" />
                  {!workspacePath ? 'Seleziona una libreria audio nel modulo Hub.' : 'Nessuna traccia trovata con i filtri correnti.'}
                </div>
              ) : (
                tracks.map((track) => {
                  const isChecked = selected.has(track.id);
                  const isActive = track.id === activeTrackId;

                  return (
                    <div
                      key={track.id}
                      onClick={() => toggleTrack(track.id)}
                      className={`grid grid-cols-12 p-3 items-center text-xs font-mono border-b border-industrial-border/20 hover:bg-industrial-panel transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-industrial-amber/10 border-l-4 border-l-industrial-amber text-white'
                          : isChecked
                          ? 'bg-industrial-panel/60 border-l-2 border-l-industrial-cyan'
                          : ''
                      }`}
                    >
                      <div className="col-span-1 flex justify-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleTrack(track.id)}
                          className="w-4 h-4 accent-industrial-amber"
                        />
                      </div>
                      <div className={`col-span-4 font-bold truncate pr-2 ${isActive ? 'text-industrial-amber' : 'text-white'}`}>
                        {track.title || track.filename}
                      </div>
                      <div className="col-span-3 text-industrial-text-dim truncate pr-2">
                        {track.artist || '—'}
                      </div>
                      <div className="col-span-2 truncate">
                        <span className={`px-2 py-0.5 text-[9px] uppercase ${
                          !track.genre || track.genre === 'Unknown'
                            ? 'bg-industrial-red/10 text-industrial-red'
                            : 'bg-industrial-cyan/10 text-industrial-cyan'
                        }`}>
                          {track.genre || 'UNKNOWN'}
                        </span>
                      </div>
                      <div className="col-span-1 text-right text-industrial-text-dim/70 font-mono">
                        {track.year || '—'}
                      </div>
                      <div className="col-span-1 text-right text-industrial-text-dim/70 font-mono">
                        {track.bitrate ? `${Math.round(track.bitrate / 1000)}k` : '—'}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Bulk Editor + Artwork (4 cols) ────────────── */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-8">

          {/* Single / Active Track Editor */}
          <section className="bg-industrial-panel p-6 border-t-4 border-industrial-amber shadow-xl">
            <h3 className="font-bold text-sm uppercase tracking-widest mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileEdit className="w-4 h-4 text-industrial-amber" />
                Active Track Editor
              </span>
              <span className="font-mono text-[9px] text-industrial-text-dim uppercase">
                {activeTrack ? `#${activeTrack.id}` : 'NONE'}
              </span>
            </h3>

            {activeTrack ? (
              <div className="space-y-4">
                <div>
                  <label className="block font-mono text-[9px] text-industrial-text-dim uppercase tracking-widest mb-1">
                    Title
                  </label>
                  <input
                    value={singleEdit.title}
                    onChange={(e) => setSingleEdit((p) => ({ ...p, title: e.target.value }))}
                    className="w-full bg-black border-b border-industrial-border p-2 font-mono text-xs text-white focus:border-industrial-amber focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[9px] text-industrial-text-dim uppercase tracking-widest mb-1">
                    Artist / Author
                  </label>
                  <input
                    value={singleEdit.artist}
                    onChange={(e) => setSingleEdit((p) => ({ ...p, artist: e.target.value }))}
                    className="w-full bg-black border-b border-industrial-border p-2 font-mono text-xs text-white focus:border-industrial-amber focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[9px] text-industrial-text-dim uppercase tracking-widest mb-1">
                    Album / Collection
                  </label>
                  <input
                    value={singleEdit.album}
                    onChange={(e) => setSingleEdit((p) => ({ ...p, album: e.target.value }))}
                    className="w-full bg-black border-b border-industrial-border p-2 font-mono text-xs text-white focus:border-industrial-amber focus:outline-none transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-mono text-[9px] text-industrial-text-dim uppercase tracking-widest mb-1">
                      Genre
                    </label>
                    <input
                      value={singleEdit.genre}
                      onChange={(e) => setSingleEdit((p) => ({ ...p, genre: e.target.value }))}
                      className="w-full bg-black border-b border-industrial-border p-2 font-mono text-xs text-white focus:border-industrial-amber focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[9px] text-industrial-text-dim uppercase tracking-widest mb-1">
                      Year
                    </label>
                    <input
                      type="number"
                      value={singleEdit.year}
                      onChange={(e) => setSingleEdit((p) => ({ ...p, year: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-black border-b border-industrial-border p-2 font-mono text-xs text-white focus:border-industrial-amber focus:outline-none transition-all"
                    />
                  </div>
                </div>
                <button
                  onClick={handleSaveActiveTrack}
                  disabled={isSaving}
                  className="w-full bg-industrial-amber text-black text-[10px] font-bold uppercase tracking-widest p-3 hover:bg-white transition-all active:scale-95 glow-amber"
                >
                  {isSaving ? 'SAVING TAGS...' : 'SAVE TAGS TO FILE'}
                </button>
              </div>
            ) : (
              <p className="font-mono text-xs text-industrial-text-dim py-8 text-center uppercase">
                Seleziona un brano dalla tabella.
              </p>
            )}
          </section>

          {/* Bulk Edit Console */}
          <section className="bg-industrial-panel p-6 border border-industrial-border">
            <h3 className="font-bold text-xs uppercase tracking-widest mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileEdit className="w-4 h-4 text-industrial-cyan" />
                Bulk Editor ({selected.size} Selected)
              </span>
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block font-mono text-[9px] text-industrial-text-dim uppercase tracking-widest mb-1">
                  Overwrite Artist
                </label>
                <input
                  value={bulkEdit.artist}
                  onChange={(e) => setBulkEdit((p) => ({ ...p, artist: e.target.value }))}
                  className="w-full bg-black border-b border-industrial-border p-2 font-mono text-xs text-white focus:border-industrial-amber focus:outline-none transition-all"
                  placeholder="Lascia vuoto per non modificare"
                />
              </div>
              <div>
                <label className="block font-mono text-[9px] text-industrial-text-dim uppercase tracking-widest mb-1">
                  Overwrite Album
                </label>
                <input
                  value={bulkEdit.album}
                  onChange={(e) => setBulkEdit((p) => ({ ...p, album: e.target.value }))}
                  className="w-full bg-black border-b border-industrial-border p-2 font-mono text-xs text-white focus:border-industrial-amber focus:outline-none transition-all"
                  placeholder="Lascia vuoto per non modificare"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-mono text-[9px] text-industrial-text-dim uppercase tracking-widest mb-1">
                    Genre
                  </label>
                  <select
                    value={bulkEdit.genre}
                    onChange={(e) => setBulkEdit((p) => ({ ...p, genre: e.target.value }))}
                    className="w-full bg-black border-b border-industrial-border p-2 font-mono text-xs text-white appearance-none focus:outline-none focus:border-industrial-amber transition-all"
                  >
                    <option value="Unknown">Non modificare</option>
                    <option value="Pop">Pop</option>
                    <option value="Rock">Rock</option>
                    <option value="Jazz">Jazz</option>
                    <option value="Electronic">Electronic</option>
                    <option value="Hip-Hop">Hip-Hop</option>
                    <option value="Classical">Classical</option>
                    <option value="Jingle">Jingle</option>
                    <option value="Podcast">Podcast</option>
                  </select>
                </div>
                <div>
                  <label className="block font-mono text-[9px] text-industrial-text-dim uppercase tracking-widest mb-1">
                    Year
                  </label>
                  <input
                    type="number"
                    value={bulkEdit.year}
                    onChange={(e) => setBulkEdit((p) => ({ ...p, year: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-black border-b border-industrial-border p-2 font-mono text-xs text-white focus:border-industrial-amber focus:outline-none transition-all"
                  />
                </div>
              </div>
              <button
                onClick={handleApplyBulk}
                disabled={isSaving || selected.size === 0}
                className={`w-full text-[10px] font-bold uppercase tracking-widest p-3 transition-all active:scale-95 ${
                  isSaving || selected.size === 0
                    ? 'bg-industrial-border/40 text-industrial-text-dim cursor-not-allowed'
                    : 'bg-industrial-border border border-industrial-border/60 hover:bg-white hover:text-black'
                }`}
              >
                Apply Bulk to Selection ({selected.size})
              </button>
            </div>
          </section>

          {/* Artwork Panel */}
          <section className="bg-industrial-panel p-6 border border-industrial-border">
            <h3 className="font-bold text-xs uppercase tracking-widest mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-industrial-cyan" />
                Embedded Artwork Cache
              </span>
              <span className="font-mono text-[9px] text-industrial-cyan uppercase">
                {activeTrack?.hasCover ? 'HAS_COVER' : 'NO_COVER'}
              </span>
            </h3>
            <div className="relative group mb-6 aspect-video bg-black overflow-hidden flex items-center justify-center border border-industrial-border/20">
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-industrial-bg via-black to-industrial-panel p-6 text-center select-none">
                <ImageIcon className={`w-12 h-12 mb-2 transition-colors ${activeTrack?.hasCover ? 'text-industrial-cyan' : 'text-industrial-text-dim/30'}`} />
                <span className="font-mono text-[9px] text-industrial-text-dim uppercase tracking-widest">
                  {activeTrack?.hasCover ? 'EMBEDDED_COVER_CACHED' : 'NO_LOCAL_COVER'}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              <button
                onClick={handleExtractArtwork}
                disabled={isExtractingArt || !workspacePath}
                className={`w-full text-black font-black text-[10px] uppercase tracking-[0.2em] py-3 transition-all glow-cyan ${
                  isExtractingArt || !workspacePath
                    ? 'bg-industrial-border text-industrial-text-dim cursor-not-allowed'
                    : 'bg-industrial-cyan hover:brightness-110 active:scale-95'
                }`}
              >
                {isExtractingArt ? 'EXTRACTING APIC ARTWORK...' : 'EXTRACT EMBEDDED ARTWORK'}
              </button>
              <p className="font-mono text-[8px] text-center text-industrial-text-dim uppercase tracking-[0.2em]">
                Local APIC / ID3 Extraction (100% Offline Air-Gapped)
              </p>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
