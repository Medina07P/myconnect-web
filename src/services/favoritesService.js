import { doc, setDoc, deleteDoc, getDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

// ID limpio compatible con APK (nombre sin caracteres especiales, en minúscula)
const cleanId = (name) => name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

// ID legacy (hash de URL) para retrocompatibilidad de lectura
const hashId = (url) => {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const getCollection = (type) => {
  if (type === 'movie') return 'fav_movies';
  if (type === 'series') return 'fav_series';
  return 'favorites';
};

export async function addFavorite(item) {
  const user = auth.currentUser;
  if (!user) return;
  const col = getCollection(item.type);
  const id = cleanId(item.name);
  await setDoc(doc(db, 'users', user.uid, col, id), {
    addedAt: serverTimestamp(),
    category: item.group || item.category || '',
    id,
    logoUrl: item.logo || item.logoUrl || '',
    name: item.name,
    streamUrl: item.url || '',
  });
}

export async function removeFavorite(itemName, itemUrl, type) {
  const user = auth.currentUser;
  if (!user) return;
  const col = getCollection(type);
  // Eliminar formato APK (por nombre limpio)
  await deleteDoc(doc(db, 'users', user.uid, col, cleanId(itemName)));
  // Eliminar formato legacy (por hash de URL) si existe
  if (itemUrl) {
    await deleteDoc(doc(db, 'users', user.uid, col, hashId(itemUrl)));
  }
}

export async function isFavorite(itemUrl, type, itemName) {
  const user = auth.currentUser;
  if (!user) return false;
  const col = getCollection(type);
  if (!itemUrl && itemName) {
    const docSnap = await getDoc(doc(db, 'users', user.uid, col, cleanId(itemName)));
    return docSnap.exists();
  }
  const snap = await getDocs(collection(db, 'users', user.uid, col));
  return snap.docs.some(d => {
    const data = d.data();
    return (data.url || data.streamUrl) === itemUrl;
  });
}

export async function getAllFavorites(type) {
  const user = auth.currentUser;
  if (!user) return [];
  const col = getCollection(type);
  const snap = await getDocs(collection(db, 'users', user.uid, col));
  return snap.docs.map(d => {
    const data = d.data();
    return {
      ...data,
      url: data.streamUrl || data.url || '',
      logo: data.logoUrl || data.logo || '',
      name: data.name || '',
      type: data.type || type,
      group: data.category || data.group || '',
    };
  }).filter(f => f.url || type === 'series').sort((a, b) => {
    const aTime = a.addedAt?.seconds ? a.addedAt.seconds * 1000 : (a.updatedAt || 0);
    const bTime = b.addedAt?.seconds ? b.addedAt.seconds * 1000 : (b.updatedAt || 0);
    return bTime - aTime;
  });
}
