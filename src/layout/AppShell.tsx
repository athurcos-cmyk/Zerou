import { NavLink, Outlet } from 'react-router-dom';
import { Home, LogOut, Palette, Plus, ReceiptText, Shield, WalletCards } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { logout } from '../auth/authService';
import { useAuth } from '../auth/AuthContext';

function getNavClass({ isActive }: { isActive: boolean }) {
  return `nav-link${isActive ? ' active' : ''}`;
}

export function AppShell() {
  const { user, profile } = useAuth();

  return (
    <div className="app-layout">
      <aside className="sidebar" aria-label="Navegação principal">
        <BrandLogo />
        <nav className="sidebar-nav">
          <NavLink className={getNavClass} to="/app" end>
            <Home size={19} aria-hidden="true" /> Início
          </NavLink>
          <NavLink className={getNavClass} to="/app/settings/appearance">
            <Palette size={19} aria-hidden="true" /> Aparência
          </NavLink>
          <NavLink className={getNavClass} to="/app/settings/security/login-methods">
            <Shield size={19} aria-hidden="true" /> Segurança
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <p className="text-secondary">{profile?.name ?? user?.email}</p>
          <button className="button button--ghost" type="button" onClick={logout}>
            <LogOut size={18} aria-hidden="true" /> Sair
          </button>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-header">
          <BrandLogo compact />
          <div>
            <strong>Zerou</strong>
            <p className="text-muted" style={{ margin: 0 }}>
              Controle individual. Organização a dois.
            </p>
          </div>
        </header>
        <Outlet />
      </main>

      <nav className="mobile-nav" aria-label="Navegação mobile">
        <NavLink className={getNavClass} to="/app" end aria-label="Início">
          <Home size={20} aria-hidden="true" />
          <span>Início</span>
        </NavLink>
        <button className="nav-link" type="button" disabled title="Transações entram na Fase 2" aria-label="Transações">
          <ReceiptText size={20} aria-hidden="true" />
        </button>
        <button className="nav-link" type="button" disabled title="Ações financeiras entram na Fase 2" aria-label="Adicionar">
          <Plus size={22} aria-hidden="true" />
        </button>
        <button className="nav-link" type="button" disabled title="Relatórios entram nas próximas fases" aria-label="Relatórios">
          <WalletCards size={20} aria-hidden="true" />
        </button>
        <NavLink className={getNavClass} to="/app/settings/appearance" aria-label="Mais">
          <Palette size={20} aria-hidden="true" />
          <span>Mais</span>
        </NavLink>
      </nav>
    </div>
  );
}
