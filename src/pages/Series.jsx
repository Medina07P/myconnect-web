import { useState, useEffect, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { useSubscription } from '../hooks/useSubscription';
import SubscriptionWall from '../components/SubscriptionWall';
import { fetchM3U } from '../services/fetchM3U';
import Hls from 'hls.js';

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

function Player({ episode, onClose }) {
  const videoRef = useRef(null);

  useEffect(() => {
  if (!episode || !videoRef.current) return;
  const video = videoRef.current;
  // ✅ transcode=true → ffmpeg convierte H.265 → H.264 al vuelo
  const proxiedUrl = `/api/proxy?url=${encodeURIComponent(episode.url)}&transcode=true`;
  video.src = proxiedUrl;
  video.load();
  video.play().catch(() => {});

  return () => {
    video.pause();
    video.src = '';
  };
}, [episode]);

  if (!episode) return null;
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <span className="text-white font-bold truncate pr-4">{episode.name}</span>
        <button onClick={onClose} className="text-white/60 hover:text-white text-2xl px-2">✕</button>
      </div>
      <video ref={videoRef}
  className="flex-1 w-full bg-black"
  controls
  autoPlay
  playsInline
  onError={() => console.warn('Codec no soportado por el navegador')} />
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
                ? <img src={series.logo} alt={series.name} className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                : <div className="absolute inset-0 flex items-center justify-center text-4xl">🎭</div>}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                <span className="opacity-0 group-hover:opacity-100 text-white text-3xl transition-opacity">▶</span>
              </div>
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