import { useState, useEffect, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { useSubscription } from '../hooks/useSubscription';
import SubscriptionWall from '../components/SubscriptionWall';
import { fetchM3U } from '../services/fetchM3U';
import { proxyUrl } from '../services/proxy';
import { saveProgress, getProgress, getAllProgress } from '../services/progressService';
import { addFavorite, removeFavorite, isFavorite, getAllFavorites } from '../services/favoritesService';

function parseM3UMovies(text) {
  const lines = text.split('\n');
  const movies = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTM3U') || line === '') continue;
    if (line.startsWith('#EXTINF')) {
      const nameMatch = line.match(/,(.+)$/);
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const groupMatch = line.match(/group-title="([^"]+)"/);
      const name = nameMatch ? nameMatch[1].trim() : '';
      if (!name || name.startsWith('http') || name.includes('=')) { current = null; continue; }
      current = { name, logo: logoMatch ? logoMatch[1] : '', group: groupMatch ? groupMatch[1] : 'General', url: '' };
    } else if (current && line.startsWith('http')) {
      const isImage = /\.(jpg|jpeg|png|gif|webp|svg|ico|bmp)(\?.*)?$/i.test(line);
      if (!isImage) { current.url = line; movies.push(current); }
      current = null;
    } else if (line.startsWith('#')) { continue; }
    else { current = null; }
  }
  return movies.filter(m => m.url && m.name);
}

function fmt(s) {
  if (!s || isNaN(s) || s <= 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

function ContinueWatching({ onPlay }) {
  const [items, setItems] = useState([]);
  useEffect(() => { getAllProgress('movie').then(setItems); }, []);
  if (items.length === 0) return null;
  return (
    <div className="mb-6">
      <h2 className="text-white font-bold text-lg mb-3">▶ Continuar viendo</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {items.map((item, i) => (
          <div key={i} onClick={() => onPlay(item)} className="flex-shrink-0 w-32 text-left cursor-pointer group">
            <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/5 border border-white/10 group-hover:border-orange-500/50 mb-1">
              {item.logo
                ? <img src={proxyUrl(item.logo)} alt={item.name} className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                : <div className="absolute inset-0 flex items-center justify-center text-3xl">🎬</div>}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                <div className="h-full bg-orange-500" style={{ width: `${Math.min((item.currentTime / item.duration) * 100, 100)}%` }} />
              </div>
            </div>
            <span className="text-white text-xs line-clamp-2 leading-tight">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FavoritesSection({ onPlay }) {
  const [items, setItems] = useState([]);
  useEffect(() => { getAllFavorites('movie').then(setItems); }, []);
  if (items.length === 0) return null;
  return (
    <div className="mb-6">
      <h2 className="text-white font-bold text-lg mb-3">❤️ Mis favoritos</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {items.map((item, i) => (
          <div key={i} onClick={() => onPlay(item)} className="flex-shrink-0 w-32 text-left cursor-pointer group">
            <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/5 border border-white/10 group-hover:border-orange-500/50 mb-1">
              {item.logo
                ? <img src={proxyUrl(item.logo)} alt={item.name} className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                : <div className="absolute inset-0 flex items-center justify-center text-3xl">🎬</div>}
            </div>
            <span className="text-white text-xs line-clamp-2 leading-tight">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FavButton({ item, type }) {
  const [fav, setFav] = useState(false);
  useEffect(() => { isFavorite(item.url, type).then(setFav); }, [item.url, type]);
  const toggle = async (e) => {
    e.stopPropagation(); e.preventDefault();
    if (fav) { await removeFavorite(item.name, item.url, type); setFav(false); }
    else { await addFavorite({ ...item, type }); setFav(true); }
  };
  return (
    <div onClick={toggle} role="button"
      className="absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80 transition-colors cursor-pointer">
      <span className="text-lg">{fav ? '❤️' : '🤍'}</span>
    </div>
  );
}

function Player({ movie, onClose }) {
  const [videoEl, setVideoEl] = useState(null);
  const [duration, setDuration] = useState(0);
  const [curTime, setCurTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const startTimeRef = useRef(0);
  const durationRef = useRef(0);
  const hideTimerRef = useRef(null);

  const PROXY = import.meta.env.DEV ? 'http://localhost:3001' : 'https://myconnect-web.onrender.com';

  const buildSrc = (start = 0) =>
    `${PROXY}/api/proxy?url=${encodeURIComponent(movie.url)}&transcode=true&start=${start.toFixed(2)}`;

  useEffect(() => {
    if (!movie || !videoEl) return;

    // Fetch duration from probe endpoint
    fetch(`${PROXY}/api/proxy?url=${encodeURIComponent(movie.url)}&probe=true`)
      .then(r => r.json())
      .then(d => {
        const dur = d.duration || 0;
        setDuration(dur);
        durationRef.current = dur;
      })
      .catch(() => {});

    // Restore progress and start video
    const initVideo = async () => {
      const progress = await getProgress(movie.url, movie.name);
      const start = (progress && progress.currentTime > 10 && (progress.duration - progress.currentTime) > 30)
        ? progress.currentTime : 0;
      startTimeRef.current = start;
      setCurTime(start);
      videoEl.src = buildSrc(start);
      videoEl.load();
      videoEl.play().catch(() => {});
    };
    initVideo();

    const onTimeUpdate = () => setCurTime(startTimeRef.current + (videoEl.currentTime || 0));
    const onPlay = () => { setIsPlaying(true); setBuffering(false); };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onCanPlay = () => setBuffering(false);

    videoEl.addEventListener('timeupdate', onTimeUpdate);
    videoEl.addEventListener('play', onPlay);
    videoEl.addEventListener('pause', onPause);
    videoEl.addEventListener('waiting', onWaiting);
    videoEl.addEventListener('canplay', onCanPlay);

    const interval = setInterval(() => {
      const realTime = startTimeRef.current + (videoEl.currentTime || 0);
      if (realTime > 0 && !videoEl.paused)
        saveProgress(movie.url, movie.name, movie.logo || '', realTime, durationRef.current, 'movie');
    }, 5000);

    return () => {
      clearInterval(interval);
      videoEl.removeEventListener('timeupdate', onTimeUpdate);
      videoEl.removeEventListener('play', onPlay);
      videoEl.removeEventListener('pause', onPause);
      videoEl.removeEventListener('waiting', onWaiting);
      videoEl.removeEventListener('canplay', onCanPlay);
      const realTime = startTimeRef.current + (videoEl.currentTime || 0);
      if (realTime > 0) saveProgress(movie.url, movie.name, movie.logo || '', realTime, durationRef.current, 'movie');
      videoEl.pause();
      videoEl.src = '';
    };
  }, [movie, videoEl]);

  const handleSeek = (e) => {
    if (!durationRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTo = ratio * durationRef.current;
    startTimeRef.current = seekTo;
    setCurTime(seekTo);
    setBuffering(true);
    videoEl.src = buildSrc(seekTo);
    videoEl.load();
    videoEl.play().catch(() => {});
  };

  const togglePlay = () => {
    if (!videoEl) return;
    isPlaying ? videoEl.pause() : videoEl.play().catch(() => {});
  };

  const toggleFullscreen = () => {
    const container = videoEl?.closest?.('.player-container');
    if (!container) return;
    document.fullscreenElement ? document.exitFullscreen() : container.requestFullscreen?.();
  };

  const resetHideTimer = () => {
    setShowControls(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  const handleVideoClick = () => {
    if (!showControls) { resetHideTimer(); return; }
    togglePlay();
    resetHideTimer();
  };

  useEffect(() => {
    resetHideTimer();
    return () => clearTimeout(hideTimerRef.current);
  }, [movie]);

  const progress = durationRef.current > 0 ? Math.min((curTime / durationRef.current) * 100, 100) : 0;

  if (!movie) return null;

  return (
    <div className="player-container fixed inset-0 bg-black z-50 flex flex-col" onMouseMove={resetHideTimer}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/90 to-transparent absolute top-0 left-0 right-0 z-10 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <span className="text-white font-bold truncate pr-4 text-sm">{movie.name}</span>
        <button onClick={onClose} className="text-white/60 hover:text-white text-2xl px-2 flex-shrink-0">✕</button>
      </div>

      {/* Video */}
      <video
        ref={setVideoEl}
        className="flex-1 w-full bg-black"
        autoPlay
        playsInline
        onClick={handleVideoClick}
        style={{ maxHeight: '100%' }}
        onDoubleClick={(e) => {
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            e.target.requestFullscreen();
          }
        }}
      />

      {/* Spinner de buffering */}
      {buffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Controles custom */}
      <div className={`bg-gradient-to-t from-black to-transparent px-4 pt-8 pb-4 flex flex-col gap-3 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* Barra de progreso */}
        <div
          className="w-full h-1.5 bg-white/20 rounded-full cursor-pointer relative group hover:h-2.5 transition-all"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-orange-500 rounded-full pointer-events-none transition-none"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${progress}% - 7px)` }}
          />
        </div>

        {/* Botones */}
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="text-white w-8 h-8 flex items-center justify-center text-xl hover:text-orange-400 transition-colors"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          <span className="text-white/70 text-sm tabular-nums select-none">
            {fmt(curTime)}
            {durationRef.current > 0 && <span className="text-white/40"> / {fmt(durationRef.current)}</span>}
          </span>

          <div className="flex-1" />

          <button
            onClick={toggleFullscreen}
            className="text-white/60 hover:text-white text-lg transition-colors"
            title="Pantalla completa"
          >
            ⛶
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Movies() {
  const [movies, setMovies] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [genres, setGenres] = useState([]);
  const [activeGenre, setActiveGenre] = useState('Todos');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(null);
  const [visibleCount, setVisibleCount] = useState(60);
  const { hasAccess, status: subStatus } = useSubscription();

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const m3uUrl = snap.data()?.m3uMovie;
        if (!m3uUrl) { setError('No tienes una lista M3U de películas configurada.'); setLoading(false); return; }
        const text = await fetchM3U(m3uUrl);
        const parsed = parseM3UMovies(text);
        setMovies(parsed); setFiltered(parsed);
        setGenres(['Todos', ...new Set(parsed.map(m => m.group))]);
      } catch (e) { console.error(e); setError('Error al cargar las películas.'); }
      finally { setLoading(false); }
    });
    return unsubAuth;
  }, []);

  useEffect(() => {
    setVisibleCount(60);
    let result = movies;
    if (activeGenre !== 'Todos') result = result.filter(m => m.group === activeGenre);
    if (search.trim()) result = result.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
    setFiltered(result);
  }, [activeGenre, search, movies]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!hasAccess && subStatus !== 'loading') return <SubscriptionWall status={subStatus} />;
  if (error) return <div className="p-6 text-red-400">{error}</div>;

  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Player movie={playing} onClose={() => setPlaying(null)} />
      <ContinueWatching onPlay={(item) => { const m = movies.find(m => m.url === item.url); if (m) setPlaying(m); }} />
      <FavoritesSection onPlay={(item) => { const m = movies.find(m => m.url === item.url); if (m) setPlaying(m); }} />

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-white">🎬 Películas <span className="text-white/30 text-sm font-normal ml-2">{filtered.length} títulos</span></h1>
        <input type="text" placeholder="Buscar película..." value={search} onChange={e => setSearch(e.target.value)}
          className="bg-white/10 text-white placeholder-white/40 px-4 py-2 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 w-64" />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {genres.map(genre => (
          <button key={genre} onClick={() => setActiveGenre(genre)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeGenre === genre ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
            {genre}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {visible.map((movie, i) => (
          <button key={i} onClick={() => setPlaying(movie)} className="group flex flex-col gap-2 text-left">
            <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/5 border border-white/10 group-hover:border-orange-500/50 transition-all">
              {movie.logo
                ? <img src={proxyUrl(movie.logo)} alt={movie.name} className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                : <div className="absolute inset-0 flex items-center justify-center text-4xl">🎬</div>}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                <span className="opacity-0 group-hover:opacity-100 text-white text-3xl transition-opacity">▶</span>
              </div>
              <FavButton item={movie} type="movie" />
            </div>
            <span className="text-white text-xs line-clamp-2 leading-tight px-1">{movie.name}</span>
          </button>
        ))}
        {filtered.length > visibleCount && (
          <div className="col-span-full flex justify-center py-4">
            <button onClick={() => setVisibleCount(v => v + 60)} className="bg-white/10 hover:bg-white/20 text-white px-8 py-3 rounded-xl transition-colors text-sm">
              Cargar más ({filtered.length - visibleCount} restantes)
            </button>
          </div>
        )}
      </div>
      {filtered.length === 0 && <p className="text-white/40 text-center mt-12">No se encontraron películas</p>}
    </div>
  );
}