import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABELS } from '../lib/format';
import { Notice } from './ui';
import { BellIcon, ClipboardIcon, HomeIcon, LockIcon, LogoutIcon, MenuIcon, ReceiptIcon, ShieldIcon, TagIcon, UsersIcon } from './Icons';

export function Logo() {
  return (
    <span className="logo">
      <span className="logo-mark">
        <ShieldIcon size={20} />
      </span>
      <span className="logo-text">
        Gasto<strong>Seguro</strong>
      </span>
    </span>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const link = (to: string, label: string, icon: ReactNode) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={() => setMenuOpen(false)}>
      {icon}
      <span>{label}</span>
    </NavLink>
  );

  const initials = (user?.name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return (
    <div className="app-shell">
      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <div className="sidebar-top">
          <Logo />
        </div>
        <nav className="nav" aria-label="Navegación principal">
          <span className="nav-section">Finanzas</span>
          {link('/', 'Resumen', <HomeIcon />)}
          {link('/gastos', 'Gastos', <ReceiptIcon />)}
          {link('/categorias', 'Categorías', <TagIcon />)}
          <span className="nav-section">Cuenta</span>
          {link('/seguridad', 'Seguridad', <LockIcon />)}
          {(user?.role === 'ADMIN' || user?.role === 'AUDITOR') && <span className="nav-section">Seguridad de la plataforma</span>}
          {user?.role === 'ADMIN' && link('/admin/usuarios', 'Usuarios', <UsersIcon />)}
          {(user?.role === 'ADMIN' || user?.role === 'AUDITOR') && link('/auditoria', 'Auditoría', <ClipboardIcon />)}
          {(user?.role === 'ADMIN' || user?.role === 'AUDITOR') && link('/alertas', 'Alertas', <BellIcon />)}
        </nav>
        <div className="sidebar-user">
          <span className="avatar" aria-hidden="true">
            {initials}
          </span>
          <div className="sidebar-user-info">
            <strong>{user?.name}</strong>
            <span>{ROLE_LABELS[user?.role ?? 'USER']}</span>
          </div>
          <button type="button" className="icon-button" onClick={handleLogout} aria-label="Cerrar sesión" title="Cerrar sesión">
            <LogoutIcon />
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-button menu-toggle" onClick={() => setMenuOpen((open) => !open)} aria-label="Abrir menú">
            <MenuIcon />
          </button>
          <Logo />
        </header>
        <main className="content">
          {(user?.role === 'ADMIN' || user?.role === 'AUDITOR') && !user.mfaEnabled && (
            <Notice kind="warning">
              <span>
                Tu rol ({ROLE_LABELS[user.role]}) exige la verificación en dos pasos. Las funciones de {user.role === 'ADMIN' ? 'administración' : 'auditoría'} permanecerán
                bloqueadas hasta que la actives en <Link to="/seguridad">Seguridad</Link>.
              </span>
            </Notice>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
