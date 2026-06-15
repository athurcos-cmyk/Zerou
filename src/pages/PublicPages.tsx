import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ArrowRight, CreditCard, HelpCircle, LockKeyhole, Mail, ReceiptText, ShieldCheck, Split, WalletCards } from 'lucide-react';
import { Seo } from '../components/Seo';
import { PublicLayout } from './PublicLayout';

export function FeaturesPage() {
  return (
    <PublicLayout>
      <Seo
        title="Funcionalidades"
        description="Conheça as funcionalidades atuais da Zerou para finanças pessoais, cartões, faturas e espaço compartilhado."
        path="/features"
      />
      <section className="public-section pricing-hero">
        <p className="eyebrow">Funcionalidades</p>
        <h1 className="marketing-title">O essencial para organizar sem misturar.</h1>
        <p className="marketing-copy">
          A Zerou já cobre a rotina de contas, transações, cartões, faturas, compromissos e organização a dois com privacidade.
        </p>
      </section>
      <section className="public-section feature-grid">
        <Feature icon={<WalletCards size={24} />} title="Contas e transações" text="Receitas, despesas, transferências, busca e status de sincronização pelo Firestore." />
        <Feature icon={<ReceiptText size={24} />} title="Compromissos" text="Contas a pagar e recorrências entram no dinheiro disponível." />
        <Feature icon={<CreditCard size={24} />} title="Cartões e faturas" text="Fatura por ledger, pagamento parcial, crédito, encargos e fechamento manual." />
        <Feature icon={<Split size={24} />} title="Espaço compartilhado" text="Convite por código/QR, despesas resumidas, comentários e acertos entre duas pessoas." />
        <Feature icon={<LockKeyhole size={24} />} title="Privacidade por desenho" text="Referências pessoais não entram no contrato de despesa compartilhada." />
        <Feature icon={<ShieldCheck size={24} />} title="PWA e temas" text="Seis temas oficiais, modo system, cache local controlável e atualização automática." />
      </section>
    </PublicLayout>
  );
}

export function SecurityPage() {
  return (
    <PublicLayout>
      <Seo
        title="Segurança"
        description="Como a Zerou separa dados por usuário, workspace e regras de acesso, sem prometer segurança absoluta."
        path="/security"
      />
      <section className="public-section split-section">
        <div>
          <p className="eyebrow">Segurança</p>
          <h1 className="marketing-title">Clareza sobre proteção e limites.</h1>
        </div>
        <p>
          A Zerou usa Firebase Auth, Firestore Security Rules, isolamento por workspace, cache local controlável e analytics
          desligado por padrão. Segurança é tratada como prática contínua, não como promessa absoluta.
        </p>
      </section>
      <section className="public-section feature-grid">
        <Feature icon={<ShieldCheck size={24} />} title="Acesso autenticado" text="Rotas privadas exigem login, onboarding e membership ativa no workspace." />
        <Feature icon={<LockKeyhole size={24} />} title="Dados separados" text="O parceiro não lê contas, cartões ou transações do espaço pessoal do outro." />
        <Feature icon={<ReceiptText size={24} />} title="Auditoria do casal" text="Ações do espaço compartilhado registram resumo sem salvar código puro de convite." />
      </section>
      <section className="public-section final-cta">
        <h2>Quer revisar a documentação de privacidade?</h2>
        <p>Veja como a Zerou trata dados, espaços compartilhados, retenção e solicitações LGPD.</p>
        <Link className="button button--primary" to="/legal/privacy">
          Ver política de privacidade
        </Link>
      </section>
    </PublicLayout>
  );
}

export function HelpPage() {
  return (
    <PublicLayout>
      <Seo title="Ajuda" description="Ajuda inicial da Zerou para começar, organizar cartões e usar o espaço compartilhado." path="/help" />
      <section className="public-section pricing-hero">
        <p className="eyebrow">Ajuda</p>
        <h1 className="marketing-title">Comece pelo seu espaço pessoal.</h1>
        <p className="marketing-copy">
          Crie a conta, conclua o onboarding, cadastre uma conta financeira e registre suas primeiras movimentações.
        </p>
      </section>
      <section className="public-section faq-grid">
        <div>
          <HelpCircle size={28} aria-hidden="true" />
          <h2>Perguntas rápidas</h2>
        </div>
        <div className="faq-list">
          <details className="surface surface-pad faq-item" open>
            <summary>Como convidar outra pessoa?</summary>
            <p>Entre em Compartilhado, crie o espaço, gere o convite e envie o código ou link para a outra pessoa.</p>
          </details>
          <details className="surface surface-pad faq-item">
            <summary>Como registrar cartão?</summary>
            <p>Use Cartões, crie um cartão e registre compras. Pagamentos de fatura saem de uma conta financeira.</p>
          </details>
          <details className="surface surface-pad faq-item">
            <summary>Como limpar cache local?</summary>
            <p>No app autenticado, use Sair e limpar dados locais. Isso ajuda em computador compartilhado.</p>
          </details>
        </div>
      </section>
    </PublicLayout>
  );
}

export function ContactPage() {
  return (
    <PublicLayout>
      <Seo title="Contato" description="Canais de contato da Zerou para suporte e privacidade." path="/contact" />
      <section className="public-section split-section">
        <div>
          <p className="eyebrow">Contato</p>
          <h1 className="marketing-title">Fale com a Zerou.</h1>
        </div>
        <div className="contact-list">
          <p>
            <Mail size={18} aria-hidden="true" /> Suporte: <a className="inline-link" href="mailto:suporte@zerou.app">suporte@zerou.app</a>
          </p>
          <p>
            <Mail size={18} aria-hidden="true" /> Privacidade: <a className="inline-link" href="mailto:privacidade@zerou.app">privacidade@zerou.app</a>
          </p>
          <p className="text-secondary">
            Ajuste estes emails antes de produção caso o domínio final seja outro.
          </p>
          <Link className="button button--primary" to="/privacy-center">
            Abrir centro de privacidade <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="surface surface-pad feature-card">
      {icon}
      <h2>{title}</h2>
      <p>{text}</p>
    </article>
  );
}
