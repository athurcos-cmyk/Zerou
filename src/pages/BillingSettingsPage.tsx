import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { freeBillingAccountForUser } from '../billing/billingService';

export function BillingSettingsPage() {
  const { user } = useAuth();
  const account = user ? freeBillingAccountForUser(user.uid) : null;

  return (
    <section className="page-stack">
      <div>
        <p className="eyebrow">Configurações</p>
        <h1 className="page-title">Plano gratuito</h1>
        <p className="page-description">
          A Zerou está 100% gratuita por enquanto. Não existe cobrança ativa, assinatura ou upgrade pago nesta versão.
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

      <section className="plan-grid" aria-label="Plano atual">
        <article className="surface surface-pad plan-card">
          <div>
            <p className="eyebrow">Incluído agora</p>
            <h2>Uso completo gratuito</h2>
            <p className="text-secondary">Você pode usar o app atual sem cartão de crédito e sem tela de pagamento.</p>
          </div>
          <div className="notice">
            <CheckCircle2 size={18} aria-hidden="true" />
            Qualquer mudança futura de cobrança será avisada antes.
          </div>
        </article>
      </section>
    </section>
  );
}
