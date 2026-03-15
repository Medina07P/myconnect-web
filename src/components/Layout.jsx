import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';

const navItems = [
  { to: '/',        icon: '📺', label: 'En Vivo'   },
  { to: '/movies',  icon: '🎬', label: 'Películas' },
  { to: '/series',  icon: '🎭', label: 'Series'    },
  { to: '/profile', icon: '👤', label: 'Perfil'    },
];

export default function Layout() {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-lg tracking-widest">
            <span className="text-red-500">MY</span>CONNECT
            <span className="text-orange-500 ml-1">IPTV</span>
          </span>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                  }`
                }
              >
                {item.icon} {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* Contenido */}
      <main className="flex-1 pt-14 pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* Bottom nav móvil */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-black/95 border-t border-white/10">
        <div className="flex">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center py-2 text-xs transition-colors ${
                  isActive ? 'text-orange-500' : 'text-white/40'
                }`
              }
            >
              <span className="text-xl">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}