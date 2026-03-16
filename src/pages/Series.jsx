import { useState, useEffect, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { useSubscription } from '../hooks/useSubscription';
import SubscriptionWall from '../components/SubscriptionWall';
import { fetchM3U } from '../services/fetchM3U';
import { proxyUrl } from '../services/proxy';
import { saveProgress, getProgress, getAllProgress } from '../services/progressService';
import { addFavorite, removeFavorite, isFavorite } from '../services/favoritesService';

function parseM3USeries(text) {
  const lines = text.split('\n');
  const episodes = [];
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
      if (!isImage) { current.url = line; episodes.push(current); }
      current = null;
    } else if (line.startsWith('#')) {
      continue;
    } else {
      current = null;
    }
  }
  return episodes.filter(e => e.url && e.name);
}

function groupBySeries(episodes) {
  const regex = /^(.*?)\s*(?:[-–]?\s*(?:S\d+\s*E\d+|T\d+\s*E\d+|\d{1,2}x\d{1,2}|Cap\.?\s*\d+|Temp\.?\s*\d+))/i;
  const groups = {};
  for (const ep of episodes) {
    const match = regex.exec(ep.name.trim());
    const seriesName = match ? match[1].trim() : ep.name.trim();
    if (!groups[seriesName]) groups[seriesName] = { name: seriesName, logo: ep.logo, episodes: [] };
    groups[seriesName].episodes.push(ep);
  }
  return Object.values(groups);
}

function ContinueWatching({ onPlay }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    getAllProgress().then(setItems);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-white font-bold text-lg mb-3">▶ Continuar viendo</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {items.map((item, i) => (
          <button key={i} onClick={() => onPlay(item)} className="flex-shrink-0 w-32 text-left group">
            <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/5 border border-white/10 group-hover:border-purple-500/50 mb-1">
              <div className="absolute inset-0 flex items-center justify-center text-3xl">🎭</div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                <div
                  className="h-full bg-purple-500"
                  style={{ width: `${Math.min((item.currentTime / item.duration) * 100, 100)}%` }}
                />
              </div>
            </div>
            <span className="text-white text-xs line-clamp-2 leading-tight">{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FavButton({ item, type }) {
  const [fav, setFav] = useState(false);

  useEffect(() => {
    isFavorite(item.url).then(setFav);
  }, [item.url]);

  const toggle = async (e) => {
    e.stopPropagation(); // no abrir el player
    if (fav) {
      await removeFavorite(item.url);
      setFav(false);
    } else {
      await addFavorite({ ...item, type });
      setFav(true);
    }
  };

  return (
    <button
      onClick={toggle}
      className="absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80 transition-colors"
    >
      <span className="text-lg">{fav ? '❤️' : '🤍'}</span>
    </button>
  );
}

function Player({ episode, onClose }) {
  const [videoEl, setVideoEl] = useState(null);

  useEffect(() => {
    if (!episode || !videoEl) return;

    const PROXY_URL = import.meta.env.DEV
      ? 'http://localhost:3001'
      : 'https://myconnect-web.onrender.com';

    const proxiedUrl = `${PROXY_URL}/api/proxy?url=${encodeURIComponent(episode.url)}&transcode=true`;
    videoEl.src = proxiedUrl;
    videoEl.load();

    // ✅ Cuando el video esté listo, retoma desde donde quedó
    videoEl.onloadedmetadata = async () => {
      const progress = await getProgress(episode.url);
      if (progress && progress.currentTime > 10) {
        // Solo retoma si hay más de 10 segundos guardados
        const remaining = progress.duration - progress.currentTime;
        if (remaining > 30) {
          // Solo retoma si quedan más de 30 segundos
          videoEl.currentTime = progress.currentTime;
        }
      }
      videoEl.play().catch(() => {});
    };

    // ✅ Guarda el progreso cada 5 segundos
    const interval = setInterval(() => {
      if (videoEl.currentTime > 0 && !videoEl.paused) {
        saveProgress(episode.url, episode.name, videoEl.currentTime, videoEl.duration || 0);
      }
    }, 5000);

    // ✅ Guarda al pausar o cerrar
    videoEl.onpause = () => {
      if (videoEl.currentTime > 0) {
        saveProgress(episode.url, episode.name, videoEl.currentTime, videoEl.duration || 0);
      }
    };

    return () => {
      clearInterval(interval);
      if (videoEl.currentTime > 0) {
        saveProgress(episode.url, episode.name, videoEl.currentTime, videoEl.duration || 0);
      }
      videoEl.pause();
      videoEl.src = '';
    };
  }, [episode, videoEl]);

  if (!episode) return null;
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <span className="text-white font-bold truncate pr-4">{episode.name}</span>
        <button onClick={onClose} className="text-white/60 hover:text-white text-2xl px-2 flex-shrink-0">✕</button>
      </div>
      <video ref={setVideoEl} className="flex-1 w-full bg-black" controls autoPlay playsInline />
    </div>
  );
}

function EpisodesModal({ series, onClose, onPlay }) {
  if (!series) return null;
  return (
    <div className="fixed inset-0 bg-black/80 z-40 flex items-end sm:items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-white font-bold text-lg">{series.name}</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-2">
          {series.episodes.map((ep, i) => (
            <button key={i} onClick={() => { onPlay(ep); onClose(); }}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/10 transition-colors text-left">
              <span className="text-purple-400 text-xl">▶</span>
              <span className="text-white text-sm">{ep.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Series() {
  const [seriesList, setSeriesList] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(null);
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [visibleCount, setVisibleCount] = useState(60);
  const { hasAccess, status: subStatus } = useSubscription();

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const m3uUrl = snap.data()?.m3uSerie;
        if (!m3uUrl) { setError('No tienes una lista M3U de series configurada.'); setLoading(false); return; }
        const text = await fetchM3U(m3uUrl);
        const episodes = parseM3USeries(text);
        const grouped = groupBySeries(episodes);
        setSeriesList(grouped);
        setFiltered(grouped);
      } catch (e) {
        console.error(e);
        setError('Error al cargar las series.');
      } finally {
        setLoading(false);
      }
    });
    return unsubAuth;
  }, []);

  useEffect(() => {
    setVisibleCount(60);
    if (!search.trim()) { setFiltered(seriesList); return; }
    setFiltered(seriesList.filter(s => s.name.toLowerCase().includes(search.toLowerCase())));
  }, [search, seriesList]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!hasAccess && subStatus !== 'loading') return <SubscriptionWall status={subStatus} />;
  if (error) return <div className="p-6 text-red-400">{error}</div>;

  const visible = filtered.slice(0, visibleCount);

  return (
  <div className="p-4 max-w-7xl mx-auto">
    <Player episode={playing} onClose={() => setPlaying(null)} />
    <EpisodesModal series={selectedSeries} onClose={() => setSelectedSeries(null)} onPlay={setPlaying} />

    {/* ✅ Continuar viendo */}
    <ContinueWatching onPlay={(item) => {
      // Busca el episodio en todas las series
      for (const serie of seriesList) {
        const ep = serie.episodes.find(e => e.url === item.url);
        if (ep) { setPlaying(ep); break; }
      }
    }} />

    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
      <h1 className="text-xl font-bold text-white">🎭 Series <span className="text-white/30 text-sm font-normal ml-2">{filtered.length} series</span></h1>
      <input type="text" placeholder="Buscar serie..." value={search} onChange={e => setSearch(e.target.value)}
        className="bg-white/10 text-white placeholder-white/40 px-4 py-2 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 w-64" />
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {visible.map((series, i) => (
        <button key={i} onClick={() => setSelectedSeries(series)} className="group flex flex-col gap-2 text-left">
          <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/5 border border-white/10 group-hover:border-purple-500/50 transition-all">
            {series.logo
              ? <img src={proxyUrl(series.logo)} alt={series.name} className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
              : <div className="absolute inset-0 flex items-center justify-center text-4xl">🎭</div>}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 text-white text-3xl transition-opacity">▶</span>
            </div>
            {/* ✅ Botón favorito */}
  <FavButton item={series} type="series" />

            <div className="absolute bottom-2 right-2 bg-purple-600 text-white text-xs px-2 py-0.5 rounded-full">
              {series.episodes.length} ep
            </div>
          </div>
          <span className="text-white text-xs line-clamp-2 leading-tight px-1">{series.name}</span>
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
    {filtered.length === 0 && <p className="text-white/40 text-center mt-12">No se encontraron series</p>}
  </div>
);
}