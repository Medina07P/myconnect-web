import { useState, useEffect } from 'react';
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) setUserData(snap.data());
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (newPassword.length < 6) {
      setPasswordError('La contraseña debe tener mínimo 6 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden');
      return;
    }
    setChangingPassword(true);
    try {
      const user = auth.currentUser;
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPassword);
      setPasswordSuccess('Contraseña actualizada correctamente');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
    } catch (e) {
      setPasswordError(
        e.code === 'auth/wrong-password'
          ? 'La contraseña actual es incorrecta'
          : 'Error al cambiar la contraseña'
      );
    } finally {
      setChangingPassword(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!window.confirm('¿Seguro que quieres cancelar tu suscripción?')) return;
    const user = auth.currentUser;
    await updateDoc(doc(db, 'users', user.uid), {
      subscriptionStatus: 'cancelled'
    });
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Sin fecha';
    const date = timestamp.toDate();
    return `${date.getDate().toString().padStart(2, '0')}/${
      (date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case 'active':    return { label: 'Activa',     color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/30'   };
      case 'cancelled': return { label: 'Cancelada',  color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' };
      case 'pending':   return { label: 'Pendiente',  color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' };
      default:          return { label: 'Expirada',   color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/30'       };
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const user = auth.currentUser;
  const status = userData?.subscriptionStatus ?? 'expired';
  const statusConfig = getStatusConfig(status);

  const waBase = 'https://wa.me/573014518350?text=';
  const waRenovar = waBase + encodeURIComponent(`Hola MYCONNECT, quiero renovar mi suscripción IPTV PRO.\n\n📧 Correo: ${user?.email}\n🔑 ID: ${user?.uid}`);
  const waActivar = waBase + encodeURIComponent(`Hola MYCONNECT, quiero activar mi suscripción IPTV PRO.\n\n📧 Correo: ${user?.email}\n🔑 ID: ${user?.uid}`);
  const waPago   = waBase + encodeURIComponent(`Hola MYCONNECT, ya realicé el pago para activar mi suscripción.\n\n📧 Correo: ${user?.email}\n🔑 ID: ${user?.uid}`);
  const waSoporte = waBase + encodeURIComponent('Hola MYCONNECT, necesito soporte técnico con mi cuenta de IPTV PRO.');

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-white mb-6">👤 Mi Cuenta</h1>

      {/* Info del usuario */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center text-3xl">👤</div>
          <div>
            <p className="text-white font-bold text-lg">{userData?.name ?? user?.email}</p>
            <p className="text-white/50 text-sm">{user?.email}</p>
            <p className="text-white/30 text-xs mt-1">ID: {user?.uid?.substring(0, 12)}...</p>
          </div>
        </div>
      </div>

      {/* Suscripción */}
      <div className={`border rounded-2xl p-5 mb-4 ${statusConfig.bg}`}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-white font-bold">Suscripción</span>
          <span className={`text-sm font-bold px-3 py-1 rounded-full border ${statusConfig.bg} ${statusConfig.color}`}>
            {statusConfig.label}
          </span>
        </div>
        {userData?.subscriptionPlan && (
          <p className="text-white/60 text-sm mb-1">
            Plan: <span className="text-white capitalize">{userData.subscriptionPlan}</span>
          </p>
        )}
        <p className="text-white/60 text-sm">
          Vence: <span className="text-white">{formatDate(userData?.subscriptionExpiry)}</span>
        </p>
      </div>

      {/* Gestionar suscripción */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-4">
        <p className="text-white/50 text-xs mb-3 uppercase tracking-widest">Gestionar suscripción</p>
        <div className="flex flex-col gap-2">
          {status === 'active' && (
            <>
              <a href={waRenovar} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 font-medium py-3 px-4 rounded-xl transition-colors text-sm">
                <span>🔄</span> Renovar suscripción
              </a>
              <button onClick={handleCancelSubscription}
                className="flex items-center gap-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-medium py-3 px-4 rounded-xl transition-colors text-sm">
                <span>❌</span> Cancelar suscripción
              </button>
            </>
          )}
          {(status === 'expired' || status === 'cancelled') && (
            <a href={waActivar} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-medium py-3 px-4 rounded-xl transition-colors text-sm">
              <span>⚡</span> Activar suscripción
            </a>
          )}
          {status === 'pending' && (
            <a href={waPago} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 font-medium py-3 px-4 rounded-xl transition-colors text-sm">
              <span>📤</span> Ya pagué — enviar comprobante
            </a>
          )}
        </div>
      </div>

      {/* Soporte */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-4">
        <p className="text-white/50 text-xs mb-3 uppercase tracking-widest">Soporte</p>
        <a href={waSoporte} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-3 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 font-medium py-3 px-4 rounded-xl transition-colors text-sm">
          <span>💬</span> Contactar soporte por WhatsApp
        </a>
        <p className="text-white/30 text-xs mt-2 text-center">+57 301 451 8350</p>
      </div>

      {/* Cambiar contraseña */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-4">
        <button onClick={() => setShowPasswordForm(!showPasswordForm)}
          className="w-full flex items-center justify-between text-white">
          <span className="font-medium">🔒 Cambiar contraseña</span>
          <span className="text-white/40">{showPasswordForm ? '▲' : '▼'}</span>
        </button>
        {showPasswordForm && (
          <form onSubmit={handleChangePassword} className="mt-4 flex flex-col gap-3">
            <input type="password" placeholder="Contraseña actual"
              value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
              className="bg-white/10 text-white placeholder-white/40 px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
            <input type="password" placeholder="Nueva contraseña"
              value={newPassword} onChange={e => setNewPassword(e.target.value)}
              className="bg-white/10 text-white placeholder-white/40 px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
            <input type="password" placeholder="Confirmar nueva contraseña"
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              className="bg-white/10 text-white placeholder-white/40 px-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
            {passwordError && <p className="text-red-400 text-sm">{passwordError}</p>}
            {passwordSuccess && <p className="text-green-400 text-sm">{passwordSuccess}</p>}
            <button type="submit" disabled={changingPassword}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50 text-sm">
              {changingPassword ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>

      {/* Cerrar sesión */}
      <button onClick={handleSignOut}
        className="w-full bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 font-bold py-3 rounded-2xl transition-colors mb-8">
        Cerrar sesión
      </button>
    </div>
  );
}