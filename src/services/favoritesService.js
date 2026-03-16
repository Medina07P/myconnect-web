import { doc, setDoc, deleteDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';

// ✅ ID más confiable basado en la URL completa
const getId = (url) => {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

export async function addFavorite(item) {
  const user = auth.currentUser;
  if (!user) return;
  const id = getId(item.url);
  await setDoc(doc(db, 'users', user.uid, 'favorites', id), {
    url: item.url,
    name: item.name,
    logo: item.logo || '',
    type: item.type,
    updatedAt: Date.now(),
  });
}

export async function removeFavorite(itemUrl) {
  const user = auth.currentUser;
  if (!user) return;
  await deleteDoc(doc(db, 'users', user.uid, 'favorites', getId(itemUrl)));
}

export async function isFavorite(itemUrl) {
  const user = auth.currentUser;
  if (!user) return false;
  const snap = await getDoc(doc(db, 'users', user.uid, 'favorites', getId(itemUrl)));
  return snap.exists();
}

export async function getAllFavorites(type = null) {
  const user = auth.currentUser;
  if (!user) return [];
  const snap = await getDocs(collection(db, 'users', user.uid, 'favorites'));
  const all = snap.docs.map(d => d.data()).sort((a, b) => b.updatedAt - a.updatedAt);
  return type ? all.filter(f => f.type === type) : all;
}