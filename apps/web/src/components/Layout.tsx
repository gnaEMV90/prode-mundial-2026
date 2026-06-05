import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const navItems = [
  { to: '/fixture', label: 'Fixture' },
  { to: '/ranking', label: 'Ranking' },
  { to: '/reglas', label: 'Reglas' }
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-xl font-black tracking-tight">
            Prode <span className="text-emerald-400">Mundial</span>
          </Link>

          <nav className="hidden items-center gap-4 md:flex">
            {navItems.map((item) => (
              <DesktopNavLink key={item.to} to={item.to}>
                {item.label}
              </DesktopNavLink>
            ))}

            {user && <DesktopNavLink to="/panel">Mi panel</DesktopNavLink>}
            {user && <DesktopNavLink to="/mis-pronosticos">Mis pronósticos</DesktopNavLink>}
            {user && <DesktopNavLink to="/especiales">Especiales</DesktopNavLink>}
            {user && <DesktopNavLink to="/cuenta">Mi cuenta</DesktopNavLink>}

            {user?.role === 'ADMIN' && (
              <NavLink to="/admin" className="text-sm text-amber-300 hover:text-amber-200">
                Admin
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden text-sm text-slate-300 sm:block">{user.name}</span>
                <button
                  onClick={handleLogout}
                  className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
                >
                  Salir
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
                >
                  Entrar
                </Link>

                <Link
                  to="/registro"
                  className="rounded-xl bg-emerald-400 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-300"
                >
                  Registrarme
                </Link>
              </>
            )}
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-3 overflow-x-auto px-4 pb-3 md:hidden">
          {navItems.map((item) => (
            <MobileNavLink key={item.to} to={item.to}>
              {item.label}
            </MobileNavLink>
          ))}

          {user && <MobileNavLink to="/panel">Mi panel</MobileNavLink>}
          {user && <MobileNavLink to="/mis-pronosticos">Mis pronósticos</MobileNavLink>}
          {user && <MobileNavLink to="/especiales">Especiales</MobileNavLink>}
          {user && <MobileNavLink to="/cuenta">Mi cuenta</MobileNavLink>}

          {user?.role === 'ADMIN' && (
            <NavLink
              to="/admin"
              className="whitespace-nowrap rounded-full bg-amber-400 px-3 py-1 text-sm font-bold text-slate-950"
            >
              Admin
            </NavLink>
          )}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-white/10 bg-slate-950">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-bold text-slate-200">Desarrollado por Germán Andrighetti</div>
            <div>Sistemas simples para negocios reales.</div>
          </div>

          <div className="text-left sm:text-right">
            <div>© {currentYear} Prode Mundial 2026.</div>
            <div>Aplicación gratuita para jugar y compartir.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function DesktopNavLink({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `text-sm ${isActive ? 'text-emerald-300' : 'text-slate-300 hover:text-white'}`}
    >
      {children}
    </NavLink>
  );
}

function MobileNavLink({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `whitespace-nowrap rounded-full px-3 py-1 text-sm ${
          isActive ? 'bg-emerald-400 text-slate-950' : 'bg-white/10 text-slate-200'
        }`
      }
    >
      {children}
    </NavLink>
  );
}