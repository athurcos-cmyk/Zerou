import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Seo } from '../components/Seo';
import './landing.css';

interface LandingShellProps {
  variant: 'css' | 'webgl' | 'mix';
  hero: ReactNode;
  children: ReactNode;
}

const variantLabels: Record<LandingShellProps['variant'], string> = {
  css: 'CSS 3D',
  webgl: 'WebGL',
  mix: 'Misto'
};

export function LandingShell({ variant, hero, children }: LandingShellProps) {
  return (
    <main className="lp" data-theme="paper">
      <Seo title="Zerou — finanças simples de entender" description="Organize suas finanças pessoais e do casal, sem misturar o que é seu com o que é compartilhado." path={`/landing/${variant}`} />

      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Link className="lp-brand" to="/">
            <img src="/brand/zerou-symbol.png" alt="" width={30} height={30} /> Zerou
          </Link>
          <nav className="lp-nav-links">
            <a href="#recursos">Recursos</a>
            <a href="#casal">Casal</a>
            <a href="#como">Como funciona</a>
          </nav>
          <div className="lp-nav-cta">
            <Link className="lp-btn lp-btn--ghost" to="/login">Entrar</Link>
            <Link className="lp-btn lp-btn--primary" to="/register">Começar grátis</Link>
          </div>
        </div>
      </header>

      {hero}

      <div className="lp-wrap">{children}</div>

      <div className="lp-wrap">
        <footer className="lp-footer">
          <Link className="lp-brand" to="/"><img src="/brand/zerou-symbol.png" alt="" width={30} height={30} /> Zerou</Link>
          <nav className="lp-footer-links">
            <Link to="/security">Segurança</Link>
            <Link to="/help">Ajuda</Link>
            <Link to="/legal/terms">Termos</Link>
            <Link to="/legal/privacy">Privacidade</Link>
          </nav>
        </footer>
      </div>

      {/* Eval-only variant switcher */}
      <nav className="lp-ribbon" aria-label="Comparar variantes">
        <Link className={variant === 'css' ? 'on' : ''} to="/landing/css">CSS 3D</Link>
        <Link className={variant === 'webgl' ? 'on' : ''} to="/landing/webgl">WebGL</Link>
        <Link className={variant === 'mix' ? 'on' : ''} to="/landing/mix">Misto</Link>
      </nav>
      <span hidden>{variantLabels[variant]}</span>
    </main>
  );
}
