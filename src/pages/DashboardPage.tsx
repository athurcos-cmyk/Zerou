import { ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function DashboardPage() {
  const { profile } = useAuth();

  return (
    <section className="page-content">
      <p className="eyebrow">Dashboard vazio</p>
      <h1 className="page-title">Seu espaço Zerou está pronto.</h1>
      <p className="page-description">
        {profile?.defaultWorkspaceId
          ? 'A fundação foi criada com workspace pessoal isolado. Nenhum dado financeiro foi criado nesta fase.'
          : 'Conclua o onboarding para criar seu workspace pessoal isolado.'}
      </p>

      <div className="dashboard-grid">
        <article className="surface surface-pad">
          <p className="eyebrow">Workspace</p>
          <h2>Privado por padrão</h2>
          <p className="text-secondary">O acesso depende de membership ativa e regras Firestore.</p>
        </article>
        <article className="surface surface-pad">
          <p className="eyebrow">Temas</p>
          <h2>Preferência individual</h2>
          <p className="text-secondary">Cada usuário escolhe a própria aparência, inclusive em espaços compartilhados.</p>
        </article>
        <article className="surface surface-pad">
          <p className="eyebrow">Próximo passo</p>
          <h2>Motor financeiro</h2>
          <p className="text-secondary">Contas, transações e saldos entram somente na Fase 2.</p>
        </article>
      </div>

      <div className="surface empty-panel" style={{ marginTop: '1rem' }}>
        <div className="empty-panel-inner">
          <span className="empty-icon">
            <Sparkles size={26} aria-hidden="true" />
          </span>
          <h2>Nada para calcular ainda.</h2>
          <p className="text-secondary">
            O dashboard está intencionalmente vazio: sem dados fake, sem saldos simulados e sem persistir informações
            financeiras antes da fase correta.
          </p>
          <Link className="button button--primary" to="/app/settings/appearance">
            Ajustar aparência <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
