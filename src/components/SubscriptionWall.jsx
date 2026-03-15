import { useNavigate } from 'react-router-dom';

export default function SubscriptionWall({ status }) {
  const navigate = useNavigate();
  const user = window._firebaseUser;

  const messages = {
    expired:   { icon: '🔒', title: 'Suscripción vencida',   sub: 'Tu acceso ha expirado. Renueva tu plan para continuar.' },
    cancelled: { icon: '⏸️', title: 'Suscripción cancelada', sub: 'Tu acceso ha sido cancelado.' },
    pending:   { icon: '⏳', title: 'Activación pendiente',  sub: 'Tu pago está siendo verificado. Pronto tendrás acceso.' },
  };

  const cfg = messages[status] ?? messages.expired;

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">{cfg.icon}</div>
        <h2 className="text-white text-2xl font-bold mb-2">{cfg.title}</h2>
        <p className="text-white/50 mb-6">{cfg.sub}</p>
        <button
          onClick={() => navigate('/profile')}
          className="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 rounded-xl transition-colors"
        >
          Ir a Mi Cuenta
        </button>
      </div>
    </div>
  );
}