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
      <div className="public-page-inner">
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
              Cada conta só vê os próprios dados, sempre, inclusive dentro do espaço do casal, se você abrir um.
            </p>
          </aside>
          <div className="form-card">{children}</div>
        </section>
        <p className="public-page-footer">
          <Link className="inline-link" to="/help">Ajuda</Link>
          <Link className="inline-link" to="/security">Como protegemos seus dados</Link>
        </p>
      </div>
    </main>
  );
}
