import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../services/firebase';

export function useSubscription() {
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    // ✅ FIX: espera a que Firebase confirme el usuario
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setStatus('expired');
        return;
      }

      const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
        if (!snap.exists()) { setStatus('expired'); return; }

        const data = snap.data();
        const subStatus = data.subscriptionStatus ?? 'expired';
        const subExpiry = data.subscriptionExpiry?.toDate();

        if (subStatus === 'active') { setStatus('active'); return; }
        if (subStatus === 'cancelled' && subExpiry && subExpiry > new Date()) {
          setStatus('active'); return;
        }
        setStatus(subStatus);
      });

      return unsub;
    });

    return unsubAuth;
  }, []);

  return { status, hasAccess: status === 'active' };
}