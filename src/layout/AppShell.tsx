import { useState, useEffect } from 'react';
import { requestAndRegisterPushToken } from '../pwa/notifications';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart2,
  Banknote,
  Bot,
  CalendarClock,
  HelpCircle,
  Home,
  LogOut,
  Palette,
  Plus,
  ReceiptText,
  Shield,
  Target,
  TrendingUp,
  MessageCircle,
  Users,
  WalletCards,
  X
} from 'lucide-react';
import { UserAvatar } from '../profile/UserAvatar';
import { BrandLockup } from '../components/BrandLogo';
import { logout } from '../auth/authService';
import { useAuth } from '../auth/AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import { WelcomeTour } from '../onboarding/WelcomeTour';
import { useWelcomeTour } from '../onboarding/welcomeTour.store';

function getNavClass({ isActive }: { isActive: boolean }) {
  return `nav-link${isActive ? ' active' : ''}`;
}

export function AppShell() {
  const { user, profile, authFromCache } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const openTour = useWelcomeTour((state) => state.openTour);

  // Pede permissão de push e registra o token FCM após o Firebase confirmar a sessão
  useEffect(() => {
    if (!authFromCache) {
      requestAndRegisterPushToken().catch(() => {});
    }
  }, [authFromCache]);
  const isFoundationPending = location.pathname.startsWith('/app/onboarding') || Boolean(user && !profile?.defaultWorkspaceId);

  async function handleLogout() {
    const ok = await confirm({
      title: 'Sair da conta?',
      message: 'Isso limpa os dados salvos neste aparelho. Se você tiver alterações feitas offline que ainda não sincronizaram, elas serão perdidas.',
      confirmLabel: 'Sair',
      danger: true
    });

    if (!ok) {
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
        <div>
          <BrandLockup />
          <p className="text-secondary" style={{ margin: '0.5rem 0 0 0.6rem', fontSize: '0.85rem' }}>
            {profile?.name ?? user?.email}
          </p>
        </div>
        <nav className="sidebar-nav">
          <NavLink className={getNavClass} to="/app" end>
            <Home size={19} aria-hidden="true" /> Início
          </NavLink>
          <NavLink className={getNavClass} to="/app/accounts">
            <WalletCards size={19} aria-hidden="true" /> Contas
          </NavLink>
          <NavLink className={getNavClass} to="/app/net-worth">
            <TrendingUp size={19} aria-hidden="true" /> Patrimônio
          </NavLink>
          <NavLink className={getNavClass} to="/app/cards">
            <CreditCardIcon /> Cartões
          </NavLink>
          <NavLink className={getNavClass} to="/app/transactions">
            <ReceiptText size={19} aria-hidden="true" /> Transações
          </NavLink>
          <NavLink className={getNavClass} to="/app/bills">
            <CalendarClock size={19} aria-hidden="true" /> Contas a Pagar
          </NavLink>
          <NavLink className={getNavClass} to="/app/goals">
            <Target size={19} aria-hidden="true" /> Metas
          </NavLink>
          <NavLink className={getNavClass} to="/app/search">
            <BarChart2 size={19} aria-hidden="true" /> Análise
          </NavLink>
          <NavLink className={getNavClass} to="/app/shared">
            <Users size={19} aria-hidden="true" /> Compartilhado
          </NavLink>
          <NavLink className={getNavClass} to="/app/assistant">
            <Bot size={19} aria-hidden="true" /> Assistente
          </NavLink>
          <p className="eyebrow" style={{ margin: '0.75rem 0 0.15rem 0.6rem' }}>Conta</p>
          <NavLink className={getNavClass} to="/app/settings/payday">
            <Banknote size={19} aria-hidden="true" /> Recebimento
          </NavLink>
          <NavLink className={getNavClass} to="/app/settings/appearance">
            <Palette size={19} aria-hidden="true" /> Aparência
          </NavLink>
          <NavLink className={getNavClass} to="/app/settings/whatsapp">
            <MessageCircle size={19} aria-hidden="true" /> WhatsApp
          </NavLink>
          <NavLink className={getNavClass} to="/app/settings/security/login-methods">
            <Shield size={19} aria-hidden="true" /> Segurança
          </NavLink>
          <button className="nav-link" type="button" onClick={openTour}>
            <HelpCircle size={19} aria-hidden="true" /> Como funciona
          </button>
        </nav>
        <div className="sidebar-footer">
          <button className="button button--ghost" type="button" onClick={() => void handleLogout()}>
            <LogOut size={18} aria-hidden="true" /> Sair
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
          <section className="mobile-menu-sheet" aria-label="Menu">
            <div className="mobile-menu-header">
              <UserAvatar profile={profile} size={44} />
              <div>
                <strong>{profile?.name ?? user?.email}</strong>
                {profile?.name ? <span className="text-secondary" style={{ fontSize: '0.8rem' }}>{user?.email}</span> : null}
              </div>
              <button className="icon-button" type="button" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="mobile-menu-grid">
              <NavLink className={getNavClass} to="/app/accounts" onClick={() => setMobileMenuOpen(false)}>
                <WalletCards size={19} aria-hidden="true" /> Contas
              </NavLink>
              <NavLink className={getNavClass} to="/app/net-worth" onClick={() => setMobileMenuOpen(false)}>
                <TrendingUp size={19} aria-hidden="true" /> Patrimônio
              </NavLink>
              <NavLink className={getNavClass} to="/app/shared" onClick={() => setMobileMenuOpen(false)}>
                <Users size={19} aria-hidden="true" /> Compartilhado
              </NavLink>
              <NavLink className={getNavClass} to="/app/bills" onClick={() => setMobileMenuOpen(false)}>
                <CalendarClock size={19} aria-hidden="true" /> Contas a Pagar
              </NavLink>
              <NavLink className={getNavClass} to="/app/goals" onClick={() => setMobileMenuOpen(false)}>
                <Target size={19} aria-hidden="true" /> Metas
              </NavLink>
              <NavLink className={getNavClass} to="/app/search" onClick={() => setMobileMenuOpen(false)}>
                <BarChart2 size={19} aria-hidden="true" /> Análise
              </NavLink>
              <NavLink className={getNavClass} to="/app/settings/whatsapp" onClick={() => setMobileMenuOpen(false)}>
                <MessageCircle size={19} aria-hidden="true" /> WhatsApp
              </NavLink>
              <NavLink className={getNavClass} to="/app/assistant" onClick={() => setMobileMenuOpen(false)}>
                <Bot size={19} aria-hidden="true" /> Assistente
              </NavLink>
            </div>
            <div className="mobile-menu-footer">
              <NavLink className={getNavClass} to="/app/settings/payday" onClick={() => setMobileMenuOpen(false)}>
                <Banknote size={17} aria-hidden="true" /> Recebimento
              </NavLink>
              <NavLink className={getNavClass} to="/app/settings/appearance" onClick={() => setMobileMenuOpen(false)}>
                <Palette size={17} aria-hidden="true" /> Aparência
              </NavLink>
              <NavLink className={getNavClass} to="/app/settings/security/login-methods" onClick={() => setMobileMenuOpen(false)}>
                <Shield size={17} aria-hidden="true" /> Segurança
              </NavLink>
              <button className="nav-link" type="button" onClick={() => { setMobileMenuOpen(false); openTour(); }}>
                <HelpCircle size={17} aria-hidden="true" /> Como funciona
              </button>
              <button className="nav-link" type="button" onClick={() => { setMobileMenuOpen(false); void handleLogout(); }}>
                <LogOut size={17} aria-hidden="true" /> Sair
              </button>
            </div>
          </section>
        </>
      ) : null}

      {!isFoundationPending ? (
        <nav className="mobile-nav" aria-label="Navegação mobile">
        <NavLink className={getNavClass} to="/app" end aria-label="Início">
          <Home size={20} aria-hidden="true" />
          <span>Início</span>
        </NavLink>
        <NavLink className={getNavClass} to="/app/transactions" aria-label="Transações">
          <ReceiptText size={20} aria-hidden="true" />
          <span>Transações</span>
        </NavLink>
        <NavLink className="mobile-fab" to="/app/transactions/new" aria-label="Adicionar transação">
          <Plus size={26} aria-hidden="true" />
        </NavLink>
        <NavLink className={getNavClass} to="/app/cards" aria-label="Cartões">
          <WalletCards size={20} aria-hidden="true" />
          <span>Cartões</span>
        </NavLink>
        <button
          className={`nav-link mobile-menu-trigger${mobileMenuOpen ? ' active' : ''}`}
          type="button"
          aria-label="Menu"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <UserAvatar profile={profile} size={24} />
          <span>Menu</span>
        </button>
        </nav>
      ) : null}

      {confirmDialog}
      <WelcomeTour />
    </div>
  );
}

function CreditCardIcon() {
  return <WalletCards size={19} aria-hidden="true" />;
}
