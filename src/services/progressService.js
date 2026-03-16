import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

// ✅ Guarda el progreso cada vez que se llama
export async function saveProgress(itemUrl, itemName, currentTime, duration) {
  const user = auth.currentUser;
  if (!user || currentTime < 5) return; // no guardar si apenas empezó

  const id = btoa(itemUrl).replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);

  await setDoc(doc(db, 'users', user.uid, 'progress', id), {
    url: itemUrl,
    name: itemName,
    currentTime,
    duration,
    updatedAt: Date.now(),
  });
}

// ✅ Lee el progreso de un item
export async function getProgress(itemUrl) {
  const user = auth.currentUser;
  if (!user) return null;

  const id = btoa(itemUrl).replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);
  const snap = await getDoc(doc(db, 'users', user.uid, 'progress', id));
  return snap.exists() ? snap.data() : null;
}

// ✅ Lee todos los items con progreso (para la sección "continuar viendo")
export async function getAllProgress() {
  const user = auth.currentUser;
  if (!user) return [];

  const { collection, getDocs, orderBy, query } = await import('firebase/firestore');
  const q = query(
    collection(db, 'users', user.uid, 'progress'),
    orderBy('updatedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}