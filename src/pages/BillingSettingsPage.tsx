import { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { FormMessage } from '../components/FormMessage';
import { formatMoney } from '../finance/money';
import {
  createCheckoutSession,
  createCustomerPortalSession,
  defaultPlanCatalog,
  freeBillingAccountForUser,
  subscribeBillingAccount,
  subscribePlanCatalog
} from '../billing/billingService';
import type { BillingAccount, BillingInterval, PlanCatalogItem, PlanId } from '../types/contracts';

const statusLabels: Record<BillingAccount['subscriptionStatus'], string> = {
  free: 'Free',
  trialing: 'Teste',
  active: 'Ativo',
  past_due: 'Pagamento pendente',
  paused: 'Pausado',
  cancelled: 'Cancelado',
  expired: 'Expirado'
};

function billingUnavailable(plan: PlanCatalogItem, interval: BillingInterval) {
  if (plan.id === 'free') {
    return false;
  }

  return interval === 'monthly' ? !plan.stripeMonthlyPriceId : !plan.stripeAnnualPriceId;
}

function formatPlanPrice(plan: PlanCatalogItem, interval: BillingInterval) {
  if (plan.id === 'free') {
    return 'Grátis';
  }

  const amount = interval === 'monthly' ? plan.monthlyPriceCents : plan.annualPriceCents;

  return amount ? formatMoney(amount) : 'Preço a configurar';
}

export function BillingSettingsPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanCatalogItem[]>(defaultPlanCatalog);
  const [account, setAccount] = useState<BillingAccount | null>(user ? freeBillingAccountForUser(user.uid) : null);
  const [message, setMessage] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  useEffect(() => subscribePlanCatalog(setPlans), []);

  useEffect(() => {
    if (!user) {
      return;
    }

    return subscribeBillingAccount(user.uid, setAccount, () =>
      setMessage({ type: 'danger', text: 'Não foi possível carregar o estado de cobrança da Zerou agora.' })
    );
  }, [user]);

  async function startCheckout(planId: Exclude<PlanId, 'free'>, interval: BillingInterval) {
    setLoadingAction(`${planId}-${interval}`);
    setMessage(null);

    try {
      const url = await createCheckoutSession(planId, interval);
      window.location.assign(url);
    } catch {
      setMessage({
        type: 'danger',
        text: 'Cobrança indisponível no ambiente atual. Confira Stripe Test Mode, Price IDs e Functions antes de assinar.'
      });
    } finally {
      setLoadingAction(null);
    }
  }

  async function openPortal() {
    setLoadingAction('portal');
    setMessage(null);

    try {
      const url = await createCustomerPortalSession();
      window.location.assign(url);
    } catch {
      setMessage({ type: 'danger', text: 'Portal do cliente indisponível para esta conta Zerou.' });
    } finally {
      setLoadingAction(null);
    }
  }

  const paidPlans = plans.filter((plan) => plan.id !== 'free');
  const currentPlan = plans.find((plan) => plan.id === account?.currentPlanId) ?? defaultPlanCatalog[0];

  return (
    <section className="page-stack">
      <div>
        <p className="eyebrow">Configurações</p>
        <h1 className="page-title">Cobrança</h1>
        <p className="page-description">Gerencie plano, Checkout e Portal da Zerou. O estado exibido vem do Firestore sincronizado por webhook.</p>
      </div>

      {message ? <FormMessage type={message.type}>{message.text}</FormMessage> : null}

      <div className="surface surface-pad billing-summary">
        <div>
          <p className="eyebrow">Plano atual</p>
          <h2>{currentPlan.name}</h2>
          <p className="text-secondary">Status: {account ? statusLabels[account.subscriptionStatus] : 'Carregando'}</p>
        </div>
        <div className="status-pill">{account?.subscriptionStatus ?? 'free'}</div>
        <button className="button button--secondary" type="button" onClick={() => void openPortal()} disabled={loadingAction === 'portal'}>
          <ExternalLink size={18} aria-hidden="true" /> Abrir portal
        </button>
      </div>

      <div className="notice">
        <AlertTriangle size={18} aria-hidden="true" />
        Checkout real depende de `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, Price IDs no `planCatalog` e Functions publicadas.
      </div>

      <section className="plan-grid" aria-label="Planos pagos">
        {paidPlans.map((plan) => (
          <article className="surface surface-pad plan-card" key={plan.id}>
            <div>
              <p className="eyebrow">{plan.name}</p>
              <h2>{plan.description}</h2>
            </div>
            <div className="billing-actions">
              {(['monthly', 'annual'] as BillingInterval[]).map((interval) => (
                <button
                  className="button button--primary"
                  disabled={billingUnavailable(plan, interval) || loadingAction === `${plan.id}-${interval}`}
                  key={interval}
                  type="button"
                  onClick={() => void startCheckout(plan.id as Exclude<PlanId, 'free'>, interval)}
                >
                  {interval === 'monthly' ? 'Mensal' : 'Anual'} - {formatPlanPrice(plan, interval)}
                </button>
              ))}
            </div>
            {billingUnavailable(plan, 'monthly') || billingUnavailable(plan, 'annual') ? (
              <p className="text-muted">Price IDs ainda não configurados no catálogo remoto.</p>
            ) : null}
          </article>
        ))}
      </section>
    </section>
  );
}
