import { doc, setDoc, deleteDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';

export async function addFavorite(item) {
  const user = auth.currentUser;
  if (!user) return;

  const id = btoa(item.url).replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);

  await setDoc(doc(db, 'users', user.uid, 'favorites', id), {
    url: item.url,
    name: item.name,
    logo: item.logo || '',
    type: item.type, // 'channel', 'movie', 'series'
    updatedAt: Date.now(),
  });
}

export async function removeFavorite(itemUrl) {
  const user = auth.currentUser;
  if (!user) return;

  const id = btoa(itemUrl).replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);
  await deleteDoc(doc(db, 'users', user.uid, 'favorites', id));
}

export async function isFavorite(itemUrl) {
  const user = auth.currentUser;
  if (!user) return false;

  const id = btoa(itemUrl).replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);
  const snap = await getDoc(doc(db, 'users', user.uid, 'favorites', id));
  return snap.exists();
}

export async function getAllFavorites() {
  const user = auth.currentUser;
  if (!user) return [];

  const snap = await getDocs(collection(db, 'users', user.uid, 'favorites'));
  return snap.docs.map(d => d.data()).sort((a, b) => b.updatedAt - a.updatedAt);
}