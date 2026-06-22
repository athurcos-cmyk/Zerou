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
            Controle individual. Organização a dois. Seu espaço pessoal nasce privado; o que for compartilhado fica
            claro quando chegar a hora.
          </p>
        </aside>
        <div className="form-card">{children}</div>
      </section>
    </main>
  );
}
