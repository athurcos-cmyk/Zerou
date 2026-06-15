import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, CreditCard, LockKeyhole, ReceiptText, Split, WalletCards } from 'lucide-react';
import { Seo } from '../components/Seo';
import { PublicLayout } from './PublicLayout';

const faqs = [
  {
    question: 'A Zerou mistura minhas finanças com as do casal?',
    answer: 'Não. Cada pessoa mantém o próprio espaço individual. O espaço compartilhado mostra apenas o que você decide compartilhar.'
  },
  {
    question: 'O app está pago?',
    answer: 'Não. Nesta etapa de lançamento, a Zerou fica 100% gratuita. Planos pagos ficam para uma decisão futura.'
  },
  {
    question: 'Cartão de crédito entra no saldo duas vezes?',
    answer: 'Não. Compras no cartão entram na fatura, e o saldo da conta só muda quando a fatura é paga.'
  },
  {
    question: 'Já posso usar em produção?',
    answer: 'Sim para uso pessoal com o escopo atual. Antes de um lançamento público amplo, ainda faltam revisão jurídica, App Check e rotinas operacionais finais.'
  }
];

export function PublicHomePage() {
  return (
    <PublicLayout>
      <Seo
        title="Zerou"
        description="Organize suas finanças pessoais e do casal sem misturar o que é individual com o que é compartilhado."
        path="/"
      />

      <section className="marketing-hero launch-hero" aria-label="Zerou">
        <div className="marketing-hero-grid">
          <div className="marketing-copy">
            <p className="eyebrow">Finanças pessoais e a dois</p>
            <h1 className="headline launch-headline">
              Organize suas finanças.
              <br />
              Compartilhe o que faz sentido.
            </h1>
            <p className="subtitle">
              Controle sua vida financeira pessoal e do casal no mesmo app, sem misturar o que deve permanecer privado.
            </p>
            <div className="button-row marketing-actions">
              <Link className="button button--primary" to="/register">
                Começar grátis <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a className="button button--secondary" href="#como-funciona">
                Ver como funciona
              </a>
            </div>
            <div className="marketing-proof" aria-label="Destaques do lançamento">
              <span>
                <CheckCircle2 size={18} aria-hidden="true" /> 100% gratuito por enquanto
              </span>
              <span>
                <CheckCircle2 size={18} aria-hidden="true" /> Pessoal separado do compartilhado
              </span>
              <span>
                <CheckCircle2 size={18} aria-hidden="true" /> PWA para usar no celular
              </span>
            </div>
          </div>

          <div className="launch-preview" aria-label="Resumo visual do app Zerou">
            <div className="preview-phone-top">
              <span />
              <span />
              <span />
            </div>
            <div className="preview-balance">
              <p className="eyebrow">Hoje na Zerou</p>
              <strong>Seu controle continua seu.</strong>
              <p>O que é dos dois fica claro.</p>
            </div>
            <div className="preview-grid">
              <span>
                <WalletCards size={18} aria-hidden="true" /> Contas
              </span>
              <span>
                <CreditCard size={18} aria-hidden="true" /> Faturas
              </span>
              <span>
                <Split size={18} aria-hidden="true" /> Casal
              </span>
              <span>
                <LockKeyhole size={18} aria-hidden="true" /> Privado
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="public-section split-section" id="como-funciona">
        <div>
          <p className="eyebrow">O problema</p>
          <h2>Planilha, banco, cartão e conversa solta não combinam bem.</h2>
        </div>
        <p>
          A Zerou nasceu para quem quer entender o próprio dinheiro e combinar despesas a dois sem transformar tudo em uma
          conta única. Privacidade aqui é autonomia: cada pessoa decide o que entra no espaço compartilhado.
        </p>
      </section>

      <section className="public-section feature-grid" aria-label="Como funciona">
        <article className="surface surface-pad feature-card">
          <WalletCards size={24} aria-hidden="true" />
          <h3>Organize o individual</h3>
          <p>Cadastre contas, receitas, despesas, compromissos e recorrências no seu espaço pessoal.</p>
        </article>
        <article className="surface surface-pad feature-card">
          <CreditCard size={24} aria-hidden="true" />
          <h3>Cartões sem dupla contagem</h3>
          <p>Compras alimentam faturas. A conta bancária só muda quando você registra o pagamento da fatura.</p>
        </article>
        <article className="surface surface-pad feature-card">
          <Split size={24} aria-hidden="true" />
          <h3>Compartilhe o que faz sentido</h3>
          <p>O espaço compartilhado recebe resumos, divisões e acertos, sem expor contas pessoais por padrão.</p>
        </article>
      </section>

      <section className="public-section split-section">
        <div>
          <p className="eyebrow">Segurança</p>
          <h2>Separação por usuário, workspace e regras Firestore.</h2>
        </div>
        <p>
          A Zerou usa autenticação Firebase, regras de acesso por membership, cache local controlável e consentimento
          explícito para cookies opcionais. Não prometemos segurança absoluta; documentamos limites e próximos reforços.
        </p>
      </section>

      <section className="public-section pricing-strip">
        <div>
          <p className="eyebrow">Lançamento gratuito</p>
          <h2>Por enquanto, tudo incluso.</h2>
          <p className="text-secondary">
            O app fica 100% gratuito nesta etapa. Billing Stripe existe como fundação técnica futura, mas checkout e planos
            pagos não estão ativos para usuários.
          </p>
        </div>
        <Link className="button button--primary" to="/register">
          Começar grátis
        </Link>
      </section>

      <section className="public-section faq-grid" aria-label="Perguntas frequentes">
        <div>
          <p className="eyebrow">FAQ</p>
          <h2>Dúvidas comuns antes de começar.</h2>
        </div>
        <div className="faq-list">
          {faqs.map((faq) => (
            <details className="surface surface-pad faq-item" key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="public-section final-cta">
        <ReceiptText size={28} aria-hidden="true" />
        <h2>Duas pessoas. Dois espaços. Uma organização em comum.</h2>
        <p>Comece pela sua rotina individual e convide a outra pessoa quando fizer sentido.</p>
        <Link className="button button--primary" to="/register">
          Começar grátis <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
    </PublicLayout>
  );
}
