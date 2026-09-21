import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  LayoutDashboard,
  Menu,
  Settings,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { config } from '../../config/env';

const NAV: Array<{
  to: string;
  label: string;
  end?: boolean;
  icon: LucideIcon;
}> = [
  { to: '/', label: 'Overview', end: true, icon: LayoutDashboard },
  { to: '/buildings', label: 'Buildings', icon: Building2 },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <div className={`app-shell ${menuOpen ? 'menu-open' : ''}`}>
      <header className="mobile-topbar">
        <button
          type="button"
          className="mobile-menu-btn"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} strokeWidth={2} /> : <Menu size={20} strokeWidth={2} />}
        </button>
        <div className="mobile-brand">
          <img src="/logo.png" alt="" />
          <strong>Barighorr</strong>
        </div>
        <span className="mobile-user">{user?.name?.split(' ')[0] || 'Admin'}</span>
      </header>

      <button
        type="button"
        className="sidebar-backdrop"
        aria-label="Close menu"
        onClick={() => setMenuOpen(false)}
      />

      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.png" alt="Barighorr" />
          <div className="brand-copy">
            <strong>Barighorr</strong>
            <span>Platform admin</span>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <span className="nav-icon" aria-hidden>
                  <Icon size={18} strokeWidth={1.85} />
                </span>
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          Signed in as <strong style={{ color: '#fff' }}>{user?.name || 'Admin'}</strong>
          <br />
          {config.appName} · v{config.appVersion}
        </div>
      </aside>

      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}
