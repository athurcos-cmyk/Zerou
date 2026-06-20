import { Link } from 'react-router-dom';
import { LockKeyhole, ShieldCheck, Users } from 'lucide-react';
import { Seo } from '../components/Seo';
import { PublicLayout } from './PublicLayout';

export function PrivacyCenterPage() {
  return (
    <PublicLayout>
      <Seo
        title="Privacidade"
        description="Como o Granix protege a separação entre seu espaço individual e o espaço compartilhado."
        path="/privacy-center"
        robots="noindex,nofollow"
      />
      <section className="public-section privacy-center">
        <p className="eyebrow">Privacidade</p>
        <h1 className="marketing-title">Seu espaço pessoal continua seu.</h1>
        <p className="marketing-copy">
          o Granix foi desenhada para separar o que é individual do que é compartilhado. Esta página resume os controles mais
          importantes e aponta para a política completa.
        </p>

        <div className="privacy-action-grid">
          <article className="surface surface-pad privacy-action-card">
            <span className="empty-icon">
              <LockKeyhole size={22} aria-hidden="true" />
            </span>
            <h2>Dados individuais</h2>
            <p>Contas, cartões, faturas e lançamentos pessoais não aparecem para outra pessoa por padrão.</p>
            <Link className="button button--secondary" to="/legal/privacy">
              Ver política
            </Link>
          </article>
          <article className="surface surface-pad privacy-action-card">
            <span className="empty-icon">
              <Users size={22} aria-hidden="true" />
            </span>
            <h2>Espaço do casal</h2>
            <p>Somente informações lançadas no espaço compartilhado ficam visíveis para os membros daquele espaço.</p>
            <Link className="button button--secondary" to="/app/shared">
              Abrir compartilhado
            </Link>
          </article>
          <article className="surface surface-pad privacy-action-card">
            <span className="empty-icon">
              <ShieldCheck size={22} aria-hidden="true" />
            </span>
            <h2>Segurança da conta</h2>
            <p>Revise seus métodos de login dentro do app e mantenha seu dispositivo protegido.</p>
            <Link className="button button--secondary" to="/app/settings/security/login-methods">
              Métodos de login
            </Link>
          </article>
        </div>
      </section>
    </PublicLayout>
  );
}
