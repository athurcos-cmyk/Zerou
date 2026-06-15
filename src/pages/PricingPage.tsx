import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Seo } from '../components/Seo';
import { PublicLayout } from './PublicLayout';

export function PricingPage() {
  return (
    <PublicLayout>
      <Seo
        title="Planos"
        description="A Zerou está 100% gratuita nesta etapa, sem cobrança ou assinatura ativa."
        path="/pricing"
      />

      <section className="public-section pricing-hero">
        <p className="eyebrow">Planos Zerou</p>
        <h1 className="marketing-title">Gratuito agora. Sem plano escondido.</h1>
        <p className="marketing-copy">
          A decisão de lançamento é simples: a Zerou está 100% gratuita nesta etapa. Se um dia existir cobrança, isso será
          avisado de forma clara antes de qualquer mudança.
        </p>
      </section>

      <section className="plan-grid public-plan-grid" aria-label="Planos">
        <article className="surface surface-pad plan-card">
          <div>
            <p className="eyebrow">Plano atual</p>
            <h2>R$ 0</h2>
            <p className="text-secondary">Uso liberado para organizar contas, cartões, faturas e despesas compartilhadas.</p>
          </div>
          <ul className="entitlement-list">
            <li>
              <CheckCircle2 size={18} aria-hidden="true" /> Espaço pessoal
            </li>
            <li>
              <CheckCircle2 size={18} aria-hidden="true" /> Cartões e faturas
            </li>
            <li>
              <CheckCircle2 size={18} aria-hidden="true" /> Espaço compartilhado para duas pessoas
            </li>
          </ul>
          <Link className="button button--primary" to="/register">
            Começar grátis
          </Link>
        </article>
      </section>
    </PublicLayout>
  );
}
