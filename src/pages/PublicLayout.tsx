import { Link } from 'react-router-dom';
import { BrandLockup } from '../components/BrandLogo';
import { openCookiePreferences } from '../privacy/cookieConsent';
import type { ReactNode } from 'react';

interface PublicLayoutProps {
  children: ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <main className="marketing-page public-marketing-shell">
      <nav className="marketing-nav public-nav" aria-label="Navegação pública">
        <Link to="/" aria-label="Ir para a página inicial da Zerou">
          <BrandLockup />
        </Link>
        <div className="public-nav-links">
          <Link to="/features">Funcionalidades</Link>
          <Link to="/security">Segurança</Link>
          <Link to="/pricing">Planos</Link>
          <Link to="/help">Ajuda</Link>
        </div>
        <div className="button-row public-nav-actions">
          <Link className="button button--ghost" to="/login">
            Entrar
          </Link>
          <Link className="button button--primary" to="/register">
            Começar grátis
          </Link>
        </div>
      </nav>

      {children}

      <footer className="public-footer">
        <div>
          <BrandLockup />
          <p className="text-secondary">Controle individual. Organização a dois.</p>
        </div>
        <div className="public-footer-links" aria-label="Links institucionais">
          <Link to="/features">Funcionalidades</Link>
          <Link to="/security">Segurança</Link>
          <Link to="/pricing">Planos</Link>
          <Link to="/help">Ajuda</Link>
          <Link to="/contact">Contato</Link>
          <Link to="/privacy-center">Centro de privacidade</Link>
          <Link to="/legal/terms">Termos</Link>
          <Link to="/legal/privacy">Privacidade</Link>
          <Link to="/legal/cookies">Cookies</Link>
          <Link to="/legal/subprocessors">Subprocessadores</Link>
          <button className="inline-link footer-cookie-button" type="button" onClick={openCookiePreferences}>
            Preferências de cookies
          </button>
        </div>
      </footer>
    </main>
  );
}
