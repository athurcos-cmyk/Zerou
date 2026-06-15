import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { BrandLockup } from '../components/BrandLogo';
import { formatMoney } from '../finance/money';
import { defaultPlanCatalog, subscribePlanCatalog } from '../billing/billingService';
import type { PlanCatalogItem } from '../types/contracts';

function priceLabel(plan: PlanCatalogItem) {
  if (plan.id === 'free') {
    return 'Grátis';
  }

  if (!plan.monthlyPriceCents) {
    return 'A configurar';
  }

  return `${formatMoney(plan.monthlyPriceCents)}/mês`;
}

export function PricingPage() {
  const [plans, setPlans] = useState<PlanCatalogItem[]>(defaultPlanCatalog);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);

  useEffect(
    () =>
      subscribePlanCatalog(
        (nextPlans) => {
          setPlans(nextPlans);
          setCatalogUnavailable(false);
        },
        () => setCatalogUnavailable(true)
      ),
    []
  );

  return (
    <main className="public-page pricing-page">
      <nav className="marketing-nav">
        <Link to="/" aria-label="Ir para inicio">
          <BrandLockup />
        </Link>
        <div className="button-row">
          <Link className="button button--ghost" to="/login">
            Entrar
          </Link>
          <Link className="button button--primary" to="/register">
            Começar grátis
          </Link>
        </div>
      </nav>

      <section className="pricing-hero">
        <p className="eyebrow">Planos Zerou</p>
        <h1 className="marketing-title">Escolha como organizar suas finanças.</h1>
        <p className="marketing-copy">
          Comece individualmente, desbloqueie o espaço compartilhado com Duo ou avance para recursos Premium quando fizer sentido.
        </p>
        {catalogUnavailable ? <p className="notice">Catálogo remoto indisponível. Mostrando estrutura padrão da Zerou.</p> : null}
      </section>

      <section className="plan-grid" aria-label="Planos">
        {plans.map((plan) => (
          <article className="surface surface-pad plan-card" key={plan.id}>
            <div>
              <p className="eyebrow">{plan.name}</p>
              <h2>{priceLabel(plan)}</h2>
              <p className="text-secondary">{plan.description}</p>
            </div>
            <ul className="entitlement-list">
              <li>
                <CheckCircle2 size={18} aria-hidden="true" /> {plan.entitlements.maxTransactionsPerMonth.toLocaleString('pt-BR')} transações/mês
              </li>
              <li>
                <CheckCircle2 size={18} aria-hidden="true" />{' '}
                {plan.entitlements.canCreateCoupleWorkspace ? 'Espaço compartilhado incluso' : 'Espaço pessoal privado'}
              </li>
              <li>
                <CheckCircle2 size={18} aria-hidden="true" />{' '}
                {plan.entitlements.canExportXlsx ? 'Exportações avançadas' : 'Exportações avançadas ficam para planos pagos'}
              </li>
            </ul>
            <Link className={`button ${plan.id === 'free' ? 'button--secondary' : 'button--primary'}`} to={plan.id === 'free' ? '/register' : '/app/settings/billing'}>
              {plan.id === 'free' ? 'Começar grátis' : 'Assinar pelo app'}
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}

