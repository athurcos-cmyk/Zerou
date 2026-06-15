import { Link } from 'react-router-dom';
import { CheckCircle2, Clock3 } from 'lucide-react';
import { Seo } from '../components/Seo';
import { defaultPlanCatalog } from '../billing/billingService';
import { PublicLayout } from './PublicLayout';

export function PricingPage() {
  return (
    <PublicLayout>
      <Seo
        title="Planos"
        description="A Zerou está 100% gratuita nesta etapa. Billing fica preparado para o futuro, sem checkout ativo agora."
        path="/pricing"
      />

      <section className="public-section pricing-hero">
        <p className="eyebrow">Planos Zerou</p>
        <h1 className="marketing-title">Gratuito agora. Planos pagos só quando fizer sentido.</h1>
        <p className="marketing-copy">
          A decisão de lançamento é simples: a Zerou está 100% gratuita nesta etapa. Duo e Premium permanecem como
          nomenclatura técnica futura, não como venda ativa.
        </p>
      </section>

      <section className="plan-grid public-plan-grid" aria-label="Planos">
        {defaultPlanCatalog.map((plan) => (
          <article className="surface surface-pad plan-card" key={plan.id}>
            <div>
              <p className="eyebrow">{plan.name}</p>
              <h2>{plan.id === 'free' ? 'R$ 0' : 'Futuro'}</h2>
              <p className="text-secondary">{plan.description}</p>
            </div>
            <ul className="entitlement-list">
              <li>
                <CheckCircle2 size={18} aria-hidden="true" />{' '}
                {plan.id === 'free' ? 'Uso liberado nesta etapa' : 'Sem checkout ativo agora'}
              </li>
              <li>
                <CheckCircle2 size={18} aria-hidden="true" /> Espaço pessoal e compartilhado no lançamento gratuito
              </li>
              <li>
                {plan.active ? <CheckCircle2 size={18} aria-hidden="true" /> : <Clock3 size={18} aria-hidden="true" />}{' '}
                {plan.active ? 'Disponível hoje' : 'Mantido como preparação técnica'}
              </li>
            </ul>
            <Link className="button button--primary" to="/register">
              Começar grátis
            </Link>
          </article>
        ))}
      </section>
    </PublicLayout>
  );
}
