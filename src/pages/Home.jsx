import { useState, useEffect, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { useSubscription } from '../hooks/useSubscription';
import SubscriptionWall from '../components/SubscriptionWall';
import { fetchM3U } from '../services/fetchM3U';
import { proxyUrl } from '../services/proxy';

function parseM3U(text) {
  const lines = text.split('\n');
  const channels = [];
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
      if (!isImage) { current.url = line; channels.push(current); }
      current = null;
    } else if (line.startsWith('#')) {
      continue;
    } else {
      current = null;
    }
  }
  return channels.filter(c => c.url && c.name);
}

function Player({ channel, onClose }) {
  const [videoEl, setVideoEl] = useState(null);

  useEffect(() => {
    if (!channel || !videoEl) return;

    const PROXY_URL = import.meta.env.DEV
      ? 'http://localhost:3001'
      : 'https://myconnect-web.onrender.com';

    const proxiedUrl = `${PROXY_URL}/api/proxy?url=${encodeURIComponent(channel.url)}&live=true`;
    console.log('Reproduciendo canal:', proxiedUrl);
    videoEl.src = proxiedUrl;
    videoEl.load();
    videoEl.play().catch(() => {});

    return () => {
      videoEl.pause();
      videoEl.src = '';
    };
  }, [channel, videoEl]);

  if (!channel) return null;
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <div className="flex items-center gap-3">
          {channel.logo && <img src={proxyUrl(channel.logo)} alt="" className="w-8 h-8 object-contain rounded" />}
          <span className="text-white font-bold">{channel.name}</span>
          <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded-full font-bold animate-pulse">EN VIVO</span>
        </div>
        <button onClick={onClose} className="text-white/60 hover:text-white text-2xl px-2">✕</button>
      </div>
      <video ref={setVideoEl} className="flex-1 w-full bg-black" controls autoPlay playsInline />
    </div>
  );
}

export default function Home() {
  const [channels, setChannels] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState('Todos');
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
        const m3uUrl = snap.data()?.m3uUrl;
        if (!m3uUrl) { setError('No tienes una lista M3U configurada.'); setLoading(false); return; }
        const text = await fetchM3U(m3uUrl);
        const parsed = parseM3U(text);
        setChannels(parsed);
        setFiltered(parsed);
        setGroups(['Todos', ...new Set(parsed.map(c => c.group))]);
      } catch (e) {
        console.error(e);
        setError('Error al cargar los canales.');
      } finally {
        setLoading(false);
      }
    });
    return unsubAuth;
  }, []);

  useEffect(() => {
    setVisibleCount(60);
    let result = channels;
    if (activeGroup !== 'Todos') result = result.filter(c => c.group === activeGroup);
    if (search.trim()) result = result.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
    setFiltered(result);
  }, [activeGroup, search, channels]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!hasAccess && subStatus !== 'loading') return <SubscriptionWall status={subStatus} />;
  if (error) return <div className="p-6 text-red-400">{error}</div>;

  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <Player channel={playing} onClose={() => setPlaying(null)} />
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-white">📺 En Vivo <span className="text-white/30 text-sm font-normal ml-2">{filtered.length} canales</span></h1>
        <input type="text" placeholder="Buscar canal..." value={search} onChange={e => setSearch(e.target.value)}
          className="bg-white/10 text-white placeholder-white/40 px-4 py-2 rounded-xl outline-none focus:ring-2 focus:ring-red-500 w-64" />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {groups.map(group => (
          <button key={group} onClick={() => setActiveGroup(group)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeGroup === group ? 'bg-red-600 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}>
            {group}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {visible.map((channel, i) => (
          <button key={i} onClick={() => setPlaying(channel)}
            className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-red-500/50 rounded-xl p-3 flex flex-col items-center gap-2 transition-all">
            {channel.logo
              ? <img src={proxyUrl(channel.logo)} alt={channel.name} className="w-12 h-12 object-contain rounded-lg" onError={e => { e.target.style.display = 'none'; }} />
              : <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center text-2xl">📺</div>}
            <span className="text-white text-xs text-center line-clamp-2 leading-tight">{channel.name}</span>
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
      {filtered.length === 0 && <p className="text-white/40 text-center mt-12">No se encontraron canales</p>}
    </div>
  );
}