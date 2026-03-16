import { doc, setDoc, getDoc, collection, getDocs, orderBy, query } from 'firebase/firestore';
import { auth, db } from './firebase';

const getId = (url) => {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

export async function saveProgress(itemUrl, itemName, currentTime, duration, type = 'movie') {
  const user = auth.currentUser;
  if (!user || currentTime < 5) return;
  await setDoc(doc(db, 'users', user.uid, 'progress', getId(itemUrl)), {
    url: itemUrl,
    name: itemName,
    currentTime,
    duration,
    type, // ✅ guarda el tipo
    updatedAt: Date.now(),
  });
}

export async function getProgress(itemUrl) {
  const user = auth.currentUser;
  if (!user) return null;
  const snap = await getDoc(doc(db, 'users', user.uid, 'progress', getId(itemUrl)));
  return snap.exists() ? snap.data() : null;
}

export async function getAllProgress(type = null) {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(collection(db, 'users', user.uid, 'progress'), orderBy('updatedAt', 'desc'));
  const snap = await getDocs(q);
  const all = snap.docs.map(d => d.data());
  return type ? all.filter(p => p.type === type) : all; // ✅ filtra por tipo
}