import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandLockup } from './BrandLogo';

interface AuthLayoutProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthLayout({ eyebrow, title, description, children }: AuthLayoutProps) {
  return (
    <main className="public-page" data-theme="paper">
      <section className="public-shell" aria-label="Acesso Granativa">
        <aside className="public-panel public-panel--hero">
          <div>
            <Link to="/" aria-label="Ir para início">
              <BrandLockup />
            </Link>
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="headline">{title}</h1>
            <p className="subtitle">{description}</p>
          </div>
          <p className="notice">
            Veja pra onde vai seu dinheiro. Sozinho ou a dois. O que você registra é seu; o que for compartilhado com o
            casal, você decide quando.
          </p>
        </aside>
        <div className="form-card">{children}</div>
      </section>
    </main>
  );
}
