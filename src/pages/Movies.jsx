import { useState, useEffect, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { useSubscription } from '../hooks/useSubscription';
import SubscriptionWall from '../components/SubscriptionWall';
import { fetchM3U } from '../services/fetchM3U';
import { proxyUrl } from '../services/proxy';

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
    } else if (line.startsWith('#')) {
      continue;
    } else {
      current = null;
    }
  }
  return movies.filter(m => m.url && m.name);
}

function Player({ movie, onClose }) {
  const [videoEl, setVideoEl] = useState(null);

  useEffect(() => {
    if (!movie || !videoEl) return;

    const PROXY_URL = import.meta.env.DEV
      ? 'http://localhost:3001'
      : 'https://myconnect-web-production.up.railway.app';

    const proxiedUrl = `${PROXY_URL}/api/proxy?url=${encodeURIComponent(movie.url)}&transcode=true`;
    console.log('Reproduciendo:', proxiedUrl);
    videoEl.src = proxiedUrl;
    videoEl.load();
    videoEl.play().catch(() => {});

    return () => {
      videoEl.pause();
      videoEl.src = '';
    };
  }, [movie, videoEl]);

  if (!movie) return null;

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <span className="text-white font-bold truncate pr-4">{movie.name}</span>
        <button onClick={onClose} className="text-white/60 hover:text-white text-2xl px-2 flex-shrink-0">✕</button>
      </div>
      <video
        ref={setVideoEl}
        className="flex-1 w-full bg-black"
        controls
        autoPlay
        playsInline
      />
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
        setMovies(parsed);
        setFiltered(parsed);
        setGenres(['Todos', ...new Set(parsed.map(m => m.group))]);
      } catch (e) {
        console.error(e);
        setError('Error al cargar las películas.');
      } finally {
        setLoading(false);
      }
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
          
          <button key={i} onClick={() => {
  console.log('Click en película:', movie.name);
  setPlaying(movie);
}} className="group flex flex-col gap-2 text-left">
          
            <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/5 border border-white/10 group-hover:border-orange-500/50 transition-all">
              {movie.logo
                ? <img src={proxyUrl(movie.logo)} alt={movie.name} className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                : <div className="absolute inset-0 flex items-center justify-center text-4xl">🎬</div>}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                <span className="opacity-0 group-hover:opacity-100 text-white text-3xl transition-opacity">▶</span>
              </div>
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