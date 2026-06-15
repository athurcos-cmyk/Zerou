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
              Seu dinheiro claro no celular.
            </h1>
            <p className="subtitle">
              Registre contas, compras, faturas e despesas a dois sem misturar o que é pessoal com o que você decidiu compartilhar.
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
                <CheckCircle2 size={18} aria-hidden="true" /> Feito para usar no celular
              </span>
              <span>
                <CheckCircle2 size={18} aria-hidden="true" /> Cartão sem bagunçar saldo
              </span>
              <span>
                <CheckCircle2 size={18} aria-hidden="true" /> Privado até você compartilhar
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
              <strong>R$ 2.480,00 livres</strong>
              <p>Depois de faturas e compromissos do mês.</p>
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
          <p className="eyebrow">Como funciona</p>
          <h2>Primeiro você entende o seu dinheiro. Depois decide o que é dos dois.</h2>
        </div>
        <p>
          A Zerou nasceu para tirar a organização financeira da planilha e da conversa solta. Ela separa sua rotina pessoal
          do combinado com outra pessoa, com faturas, compromissos e acertos no mesmo lugar.
        </p>
      </section>

      <section className="public-section feature-grid routine-grid" aria-label="Rotina Zerou">
        <article className="surface surface-pad feature-card routine-card">
          <span className="step-pill">1</span>
          <WalletCards size={24} aria-hidden="true" />
          <h3>Lance o básico</h3>
          <p>Contas, entradas, gastos, recorrências e cartões ficam no seu espaço individual.</p>
        </article>
        <article className="surface surface-pad feature-card routine-card">
          <span className="step-pill">2</span>
          <CreditCard size={24} aria-hidden="true" />
          <h3>Veja faturas e compromissos</h3>
          <p>Compras alimentam faturas, e a conta só muda quando você registra o pagamento.</p>
        </article>
        <article className="surface surface-pad feature-card routine-card">
          <span className="step-pill">3</span>
          <Split size={24} aria-hidden="true" />
          <h3>Divida sem expor tudo</h3>
          <p>O espaço compartilhado recebe só o resumo, a divisão e o acerto que você escolheu.</p>
        </article>
      </section>

      <section className="public-section split-section">
        <div>
          <p className="eyebrow">Segurança</p>
          <h2>Separação por usuário, workspace e regras Firestore.</h2>
        </div>
        <p>
          A Zerou usa autenticação Firebase, regras de acesso por membership, separação por workspace e cache local
          controlável. Dados pessoais não são vendidos, e analytics fica desligado por padrão.
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
