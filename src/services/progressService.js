import { doc, setDoc, getDoc, collection, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

// ID limpio compatible con APK
const cleanId = (name) => name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

// ID legacy (hash de URL) para retrocompatibilidad
const hashId = (url) => {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const modeFromType = (type) => type === 'series' ? 'PlayerMode.series' : 'PlayerMode.movie';
const typeFromMode = (mode) => {
  if (mode === 'PlayerMode.series') return 'series';
  if (mode === 'PlayerMode.movie') return 'movie';
  return 'movie';
};

export async function saveProgress(itemUrl, itemName, itemLogo, currentTime, duration, type = 'movie') {
  const user = auth.currentUser;
  if (!user || currentTime < 5) return;
  await setDoc(doc(db, 'users', user.uid, 'recent_watch', cleanId(itemName)), {
    lastPosition: Math.round(currentTime),
    logoUrl: itemLogo || '',
    mode: modeFromType(type),
    name: itemName,
    streamUrl: itemUrl,
    timestamp: serverTimestamp(),
    totalDuration: Math.round(duration),
  });
}

export async function getProgress(itemUrl, itemName) {
  const user = auth.currentUser;
  if (!user) return null;

  // Intentar formato APK (recent_watch + cleanId)
  if (itemName) {
    const snap = await getDoc(doc(db, 'users', user.uid, 'recent_watch', cleanId(itemName)));
    if (snap.exists()) {
      const d = snap.data();
      return { currentTime: d.lastPosition, duration: d.totalDuration };
    }
  }

  // Fallback: formato legacy (progress + hashId)
  const snap = await getDoc(doc(db, 'users', user.uid, 'progress', hashId(itemUrl)));
  if (snap.exists()) {
    const d = snap.data();
    return { currentTime: d.currentTime, duration: d.duration };
  }

  return null;
}

export async function getAllProgress(type = null) {
  const user = auth.currentUser;
  if (!user) return [];

  const items = [];

  // Leer de recent_watch (formato APK)
  try {
    const snap = await getDocs(collection(db, 'users', user.uid, 'recent_watch'));
    for (const d of snap.docs) {
      const data = d.data();
      items.push({
        currentTime: data.lastPosition,
        duration: data.totalDuration,
        url: data.streamUrl || '',
        name: data.name || '',
        logo: data.logoUrl || '',
        type: typeFromMode(data.mode),
        _ts: data.timestamp?.seconds ? data.timestamp.seconds * 1000 : 0,
        _key: data.streamUrl || data.name,
      });
    }
  } catch (e) { /* colección puede no existir aún */ }

  // Leer de progress (formato legacy)
  try {
    const q = query(collection(db, 'users', user.uid, 'progress'), orderBy('updatedAt', 'desc'));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data();
      items.push({
        currentTime: data.currentTime,
        duration: data.duration,
        url: data.url || '',
        name: data.name || '',
        logo: data.logo || '',
        type: data.type || 'movie',
        _ts: data.updatedAt || 0,
        _key: data.url || data.name,
      });
    }
  } catch (e) { /* colección puede no existir aún */ }

  // Deduplicar por _key (preferir el más reciente)
  const seen = new Map();
  for (const item of items) {
    const existing = seen.get(item._key);
    if (!existing || item._ts > existing._ts) {
      seen.set(item._key, item);
    }
  }

  let result = [...seen.values()];

  // Filtrar por tipo si se especifica
  if (type) result = result.filter(p => p.type === type);

  // Ordenar por timestamp descendente
  result.sort((a, b) => b._ts - a._ts);

  // Limpiar campos internos
  return result.map(({ _ts, _key, ...rest }) => rest);
}
