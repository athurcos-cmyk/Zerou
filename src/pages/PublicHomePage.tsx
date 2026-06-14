import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import { BrandLockup } from '../components/BrandLogo';

export function PublicHomePage() {
  return (
    <main className="marketing-page">
      <section className="marketing-hero" aria-label="Zerou">
        <nav className="marketing-nav">
          <BrandLockup />
          <Link className="button button--secondary" to="/login">
            Entrar
          </Link>
        </nav>

        <div className="marketing-hero-grid">
          <div className="marketing-copy">
            <p className="eyebrow">Finanças pessoais e a dois</p>
            <h1 className="headline">Organize suas finanças sem misturar o que é seu.</h1>
            <p className="subtitle">
              A Zerou separa o controle individual do espaço compartilhado. Cada pessoa mantém autonomia, e o que é dos
              dois fica claro.
            </p>
            <div className="button-row marketing-actions">
              <Link className="button button--primary" to="/register">
                Começar grátis <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link className="button button--ghost" to="/login">
                Já tenho conta
              </Link>
            </div>
            <div className="marketing-proof" aria-label="Fundação da Fase 1">
              <span>
                <CheckCircle2 size={18} aria-hidden="true" /> Login e onboarding
              </span>
              <span>
                <CheckCircle2 size={18} aria-hidden="true" /> Seis temas
              </span>
              <span>
                <CheckCircle2 size={18} aria-hidden="true" /> Workspace pessoal
              </span>
            </div>
          </div>

          <div className="app-preview" aria-hidden="true">
            <div className="app-preview-top">
              <span className="empty-icon">
                <ShieldCheck size={24} />
              </span>
              <div>
                <p className="eyebrow">Fase 1</p>
                <strong>Base segura para evoluir.</strong>
              </div>
            </div>
            <div className="app-preview-list">
              <span />
              <span />
              <span />
            </div>
            <div className="app-preview-card">
              <Sparkles size={20} />
              <p>Nenhum dado financeiro fake. Primeiro a fundação, depois o motor.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
