import { Link } from 'react-router-dom';
import { BrandLockup } from '../components/BrandLogo';
import { SiteFooter } from '../components/SiteFooter';
import { organizationSchema } from '../components/organizationSchema';
import type { ReactNode } from 'react';

interface PublicLayoutProps {
  children: ReactNode;
}

export function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <main className="marketing-page public-marketing-shell" data-theme="paper">
      {/* Um crawler pode entrar direto por /security ou /help sem nunca passar pela home —
          o schema de identidade da marca precisa estar aqui também, não só na landing. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
      <nav className="marketing-nav public-nav" aria-label="Navegação pública">
        <Link to="/" aria-label="Ir para a página inicial da Granativa">
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

      <SiteFooter />
    </main>
  );
}
