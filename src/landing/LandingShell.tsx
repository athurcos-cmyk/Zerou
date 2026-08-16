import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Seo } from '../components/Seo';
import { SiteFooter } from '../components/SiteFooter';
import { organizationSchema } from '../components/organizationSchema';
import './landing.css';

interface LandingShellProps {
  hero: ReactNode;
  children: ReactNode;
}

export function LandingShell({ hero, children }: LandingShellProps) {
  return (
    <main className="lp" data-theme="paper">
      {/* SEO: title/description precisam bater com a cópia estática em `index.html` (a que robôs
          que não executam JavaScript enxergam) — os dois já divergiram uma vez em silêncio. Ver
          `.agents/product-marketing.md`. */}
      <Seo
        title="Granativa — veja pra onde vai seu dinheiro"
        description="Registre um gasto em 3 toques e veja pra onde foi seu dinheiro. Funciona sem internet, é grátis, com modo casal opcional. O que é seu continua só seu."
        path="/"
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />

      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Link className="lp-brand" to="/">
            <img src="/brand/granativa-logo-horizontal.png" alt="Granativa" height={28} style={{ width: 'auto' }} />
          </Link>
          <nav className="lp-nav-links">
            <a href="#recursos">Recursos</a>
            <a href="#casal">Casal</a>
            <a href="#como">Como funciona</a>
          </nav>
          <div className="lp-nav-cta">
            <Link className="lp-btn lp-btn--ghost" to="/login">Entrar</Link>
            <Link className="lp-btn lp-btn--primary" to="/register">Ver gastos</Link>
          </div>
        </div>
      </header>

      {hero}

      <div className="lp-wrap">{children}</div>

      <div className="lp-wrap">
        <SiteFooter />
      </div>

    </main>
  );
}
