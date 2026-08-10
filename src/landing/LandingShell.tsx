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
      {/* SEO: o título vira "Controle financeiro pessoal e do casal | Granativa" (49 chars, cabe
          inteiro no resultado do Google) — termo de busca na frente, marca no fim. A descrição tem
          154 chars de propósito: acima de ~155 o Google corta com reticências. Ver
          `.agents/product-marketing.md`. */}
      <Seo
        title="Controle financeiro pessoal e do casal"
        description="Registre um gasto em 3 toques e veja pra onde vai seu dinheiro. Cartões, contas e metas num lugar só — com um espaço do casal onde o seu continua privado."
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
