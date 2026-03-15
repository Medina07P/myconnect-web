import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            "AIzaSyCJuvziGDbhetVGKyLHuXmT-6-kK7DOaDc",
  authDomain:        "iptv-player-70ac2.firebaseapp.com",
  projectId:         "iptv-player-70ac2",
  storageBucket:     "iptv-player-70ac2.firebasestorage.app",
  messagingSenderId: "707821425560",
  appId:             "1:707821425560:web:6290a9e7a97cbc954cd1ed",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);