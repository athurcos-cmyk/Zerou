import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';

export function PublicHomePage() {
  return (
    <main className="public-page">
      <section className="public-shell" aria-label="Zerou">
        <div className="public-panel public-panel--hero">
          <div>
            <BrandLogo />
            <p className="text-secondary">Controle individual. Organização a dois.</p>
            <p className="eyebrow">Finanças pessoais e a dois</p>
            <h1 className="headline">Organize suas finanças. Compartilhe o que faz sentido.</h1>
            <p className="subtitle">
              Controle sua vida financeira pessoal e do casal no mesmo app, sem misturar o que deve permanecer
              privado.
            </p>
            <div className="button-row" style={{ marginTop: '1.5rem' }}>
              <Link className="button button--primary" to="/register">
                Começar grátis <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link className="button button--secondary" to="/login">
                Entrar
              </Link>
            </div>
          </div>
          <p className="notice">
            Esta é a fundação do app Zerou. O motor financeiro, cartões, espaço compartilhado e billing entram nas
            próximas fases.
          </p>
        </div>
        <div className="form-card">
          <div className="empty-panel-inner">
            <span className="empty-icon">
              <ShieldCheck size={26} aria-hidden="true" />
            </span>
            <p className="eyebrow">Fase 1</p>
            <h2 className="page-title">Base segura para evoluir.</h2>
            <p className="page-description">
              Cadastro, login, onboarding, workspace pessoal isolado e seis temas oficiais configuráveis por usuário.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
