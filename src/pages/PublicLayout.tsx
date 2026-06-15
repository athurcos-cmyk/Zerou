import { Link } from 'react-router-dom';
import { BrandLockup } from '../components/BrandLogo';
import type { ReactNode } from 'react';

interface PublicLayoutProps {
  children: ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <main className="marketing-page public-marketing-shell" data-theme="paper">
      <nav className="marketing-nav public-nav" aria-label="Navegação pública">
        <Link to="/" aria-label="Ir para a página inicial da Zerou">
          <BrandLockup />
        </Link>
        <div className="public-nav-links">
          <a href="/#funcionalidades">Funcionalidades</a>
          <Link to="/security">Segurança</Link>
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
          <Link to="/security">Segurança</Link>
          <Link to="/help">Ajuda</Link>
          <Link to="/contact">Contato</Link>
          <Link to="/legal/terms">Termos</Link>
          <Link to="/legal/privacy">Privacidade</Link>
        </div>
      </footer>
    </main>
  );
}
