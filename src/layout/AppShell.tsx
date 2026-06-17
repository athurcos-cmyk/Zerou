import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  CalendarClock,
  Home,
  LogOut,
  MoreHorizontal,
  Palette,
  Plus,
  ReceiptText,
  Repeat,
  Search,
  Shield,
  Target,
  Users,
  WalletCards,
  X
} from 'lucide-react';
import { BrandLockup } from '../components/BrandLogo';
import { logout } from '../auth/authService';
import { useAuth } from '../auth/AuthContext';

function getNavClass({ isActive }: { isActive: boolean }) {
  return `nav-link${isActive ? ' active' : ''}`;
}

export function AppShell() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isFoundationPending = location.pathname.startsWith('/app/onboarding') || Boolean(user && !profile?.defaultWorkspaceId);

  async function handleClearLocalDataLogout() {
    const confirmed = window.confirm(
      'Sair deste aparelho e remover os dados salvos localmente? Use isso em celular emprestado ou computador compartilhado.'
    );

    if (!confirmed) {
      return;
    }

    try {
      await logout({ clearLocalCache: true });
    } catch {
      await logout();
    }
  }

  return (
    <div className={`app-layout${isFoundationPending ? ' app-layout--focus' : ''}`}>
      {!isFoundationPending ? (
        <aside className="sidebar" aria-label="Navegação principal">
        <BrandLockup />
        <nav className="sidebar-nav">
          <NavLink className={getNavClass} to="/app" end>
            <Home size={19} aria-hidden="true" /> Início
          </NavLink>
          <NavLink className={getNavClass} to="/app/accounts">
            <WalletCards size={19} aria-hidden="true" /> Contas
          </NavLink>
          <NavLink className={getNavClass} to="/app/cards">
            <CreditCardIcon /> Cartões
          </NavLink>
          <NavLink className={getNavClass} to="/app/transactions">
            <ReceiptText size={19} aria-hidden="true" /> Transações
          </NavLink>
          <NavLink className={getNavClass} to="/app/bills">
            <CalendarClock size={19} aria-hidden="true" /> Compromissos
          </NavLink>
          <NavLink className={getNavClass} to="/app/goals">
            <Target size={19} aria-hidden="true" /> Metas
          </NavLink>
          <NavLink className={getNavClass} to="/app/recurring">
            <Repeat size={19} aria-hidden="true" /> Recorrências
          </NavLink>
          <NavLink className={getNavClass} to="/app/search">
            <Search size={19} aria-hidden="true" /> Busca
          </NavLink>
          <NavLink className={getNavClass} to="/app/shared">
            <Users size={19} aria-hidden="true" /> Compartilhado
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
          <button className="button button--ghost" type="button" onClick={() => void logout()}>
            <LogOut size={18} aria-hidden="true" /> Sair
          </button>
          <button className="button button--ghost" type="button" onClick={() => void handleClearLocalDataLogout()}>
            Sair deste aparelho
          </button>
        </div>
        </aside>
      ) : null}

      <main className="app-main">
        <Outlet />
      </main>

      {mobileMenuOpen && !isFoundationPending ? (
        <>
          <button
            className="mobile-more-backdrop"
            type="button"
            aria-label="Fechar menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <section className="mobile-more-sheet" aria-label="Mais opções">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Menu</p>
                <h2>Mais opções</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="mobile-more-grid">
              <NavLink className={getNavClass} to="/app/accounts" onClick={() => setMobileMenuOpen(false)}>
                <WalletCards size={19} aria-hidden="true" /> Contas
              </NavLink>
              <NavLink className={getNavClass} to="/app/transactions" onClick={() => setMobileMenuOpen(false)}>
                <ReceiptText size={19} aria-hidden="true" /> Transações
              </NavLink>
              <NavLink className={getNavClass} to="/app/bills" onClick={() => setMobileMenuOpen(false)}>
                <CalendarClock size={19} aria-hidden="true" /> Compromissos
              </NavLink>
              <NavLink className={getNavClass} to="/app/goals" onClick={() => setMobileMenuOpen(false)}>
                <Target size={19} aria-hidden="true" /> Metas
              </NavLink>
              <NavLink className={getNavClass} to="/app/recurring" onClick={() => setMobileMenuOpen(false)}>
                <Repeat size={19} aria-hidden="true" /> Recorrências
              </NavLink>
              <NavLink className={getNavClass} to="/app/search" onClick={() => setMobileMenuOpen(false)}>
                <Search size={19} aria-hidden="true" /> Busca
              </NavLink>
              <NavLink className={getNavClass} to="/app/settings/appearance" onClick={() => setMobileMenuOpen(false)}>
                <Palette size={19} aria-hidden="true" /> Aparência
              </NavLink>
              <NavLink className={getNavClass} to="/app/settings/security/login-methods" onClick={() => setMobileMenuOpen(false)}>
                <Shield size={19} aria-hidden="true" /> Segurança
              </NavLink>
            </div>
            <button className="button button--ghost" type="button" onClick={() => void logout()}>
              <LogOut size={18} aria-hidden="true" /> Sair
            </button>
          </section>
        </>
      ) : null}

      {!isFoundationPending ? (
        <nav className="mobile-nav" aria-label="Navegação mobile">
        <NavLink className={getNavClass} to="/app" end aria-label="Início">
          <Home size={20} aria-hidden="true" />
          <span>Início</span>
        </NavLink>
        <NavLink className={getNavClass} to="/app/cards" aria-label="Cartões">
          <WalletCards size={20} aria-hidden="true" />
          <span>Cartões</span>
        </NavLink>
        <NavLink className="mobile-fab" to="/app/transactions/new" aria-label="Adicionar transação">
          <Plus size={26} aria-hidden="true" />
        </NavLink>
        <NavLink className={getNavClass} to="/app/shared" aria-label="Compartilhado">
          <Users size={20} aria-hidden="true" />
          <span>Casal</span>
        </NavLink>
        <button
          className={`nav-link mobile-more-trigger${mobileMenuOpen ? ' active' : ''}`}
          type="button"
          aria-label="Mais opções"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <MoreHorizontal size={20} aria-hidden="true" />
          <span>Mais</span>
        </button>
        </nav>
      ) : null}
    </div>
  );
}

function CreditCardIcon() {
  return <WalletCards size={19} aria-hidden="true" />;
}
