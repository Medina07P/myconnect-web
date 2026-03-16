import { doc, setDoc, deleteDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';

const getId = (url) => {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

// ✅ Colección correcta según el tipo — igual que la app móvil
const getCollection = (type) => {
  if (type === 'movie') return 'fav_movies';
  if (type === 'series') return 'fav_series';
  return 'favorites'; // canales
};

export async function addFavorite(item) {
  const user = auth.currentUser;
  if (!user) return;
  const col = getCollection(item.type);
  await setDoc(doc(db, 'users', user.uid, col, getId(item.url)), {
    url: item.url,
    name: item.name,
    logo: item.logo || '',
    type: item.type,
    updatedAt: Date.now(),
  });
}

export async function removeFavorite(itemUrl, type) {
  const user = auth.currentUser;
  if (!user) return;
  const col = getCollection(type);
  await deleteDoc(doc(db, 'users', user.uid, col, getId(itemUrl)));
}

export async function isFavorite(itemUrl, type) {
  const user = auth.currentUser;
  if (!user) return false;
  const col = getCollection(type);
  const snap = await getDoc(doc(db, 'users', user.uid, col, getId(itemUrl)));
  return snap.exists();
}

export async function getAllFavorites(type) {
  const user = auth.currentUser;
  if (!user) return [];
  const col = getCollection(type);
  const snap = await getDocs(collection(db, 'users', user.uid, col));
  return snap.docs.map(d => d.data()).sort((a, b) => b.updatedAt - a.updatedAt);
}