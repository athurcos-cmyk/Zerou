import { CheckCircle2, Clock3 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { defaultPlanCatalog, freeBillingAccountForUser } from '../billing/billingService';

export function BillingSettingsPage() {
  const { user } = useAuth();
  const account = user ? freeBillingAccountForUser(user.uid) : null;

  return (
    <section className="page-stack">
      <div>
        <p className="eyebrow">Configurações</p>
        <h1 className="page-title">Plano gratuito</h1>
        <p className="page-description">
          A Zerou está 100% gratuita por enquanto. O billing Stripe criado na Fase 5 permanece como fundação técnica, mas
          checkout, portal e assinaturas pagas não estão ativos para usuários.
        </p>
      </div>

      <div className="surface surface-pad billing-summary">
        <div>
          <p className="eyebrow">Plano atual</p>
          <h2>Gratuito</h2>
          <p className="text-secondary">Status: acesso liberado nesta etapa de lançamento.</p>
        </div>
        <div className="status-pill">{account?.subscriptionStatus ?? 'free'}</div>
      </div>

      <div className="notice notice--success">
        <CheckCircle2 size={18} aria-hidden="true" />
        Espaço pessoal, espaço compartilhado, cartões, faturas e motor financeiro atual ficam inclusos sem cobrança.
      </div>

      <section className="plan-grid" aria-label="Estrutura futura de planos">
        {defaultPlanCatalog.map((plan) => (
          <article className="surface surface-pad plan-card" key={plan.id}>
            <div>
              <p className="eyebrow">{plan.name}</p>
              <h2>{plan.id === 'free' ? 'Ativo agora' : 'Futuro'}</h2>
              <p className="text-secondary">{plan.description}</p>
            </div>
            <div className="notice">
              {plan.active ? <CheckCircle2 size={18} aria-hidden="true" /> : <Clock3 size={18} aria-hidden="true" />}
              {plan.active ? 'Disponível para esta conta.' : 'Sem cobrança ou upgrade ativo nesta versão.'}
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}
