import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  ReceiptText,
  Split,
  WalletCards
} from 'lucide-react';
import { Seo } from '../components/Seo';
import { PublicLayout } from './PublicLayout';

const faqs = [
  {
    question: 'Posso usar a Zerou sozinho?',
    answer: 'Sim. A Zerou funciona muito bem para sua vida financeira individual. O modo casal entra quando você quiser organizar algo com outra pessoa.'
  },
  {
    question: 'O que a outra pessoa consegue ver?',
    answer: 'Ela vê apenas o que estiver no espaço do casal: despesas compartilhadas, divisões, comentários e acertos. Suas contas, cartões e lançamentos pessoais continuam privados.'
  },
  {
    question: 'Cartão de crédito entra no saldo duas vezes?',
    answer: 'Não. Compras no cartão ficam na fatura, e o saldo da conta só muda quando você registra o pagamento da fatura.'
  },
  {
    question: 'Preciso instalar pela loja de apps?',
    answer: 'Não. A Zerou é um app web: você abre pelo navegador do celular e pode adicionar o atalho na tela inicial.'
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
            <p className="eyebrow">Controle individual. Organização a dois.</p>
            <h1 className="headline launch-headline">
              Seu dinheiro simples de entender.
            </h1>
            <p className="subtitle">
              Acompanhe gastos, contas, cartões e combinados do casal em um app feito para o celular, sem expor o que é só seu.
            </p>
            <div className="button-row marketing-actions">
              <Link className="button button--primary" to="/register">
                Começar agora <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a className="button button--secondary" href="#funcionalidades">
                Ver funcionalidades
              </a>
            </div>
            <div className="marketing-proof" aria-label="Destaques da Zerou">
              <span>
                <CheckCircle2 size={18} aria-hidden="true" /> Feito para usar no celular
              </span>
              <span>
                <CheckCircle2 size={18} aria-hidden="true" /> Pessoal e casal separados
              </span>
              <span>
                <CheckCircle2 size={18} aria-hidden="true" /> Fatura sem dupla contagem
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
              <p className="eyebrow">Resumo do mês</p>
              <strong>R$ 2.480,00 livres</strong>
              <p>Depois de contas, faturas e combinados.</p>
            </div>
            <div className="preview-grid">
              <span>
                <WalletCards size={18} aria-hidden="true" /> Contas
              </span>
              <span>
                <CreditCard size={18} aria-hidden="true" /> Cartões
              </span>
              <span>
                <BarChart3 size={18} aria-hidden="true" /> Gastos
              </span>
              <span>
                <Split size={18} aria-hidden="true" /> Casal
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="public-section split-section" id="como-funciona">
        <div>
          <p className="eyebrow">Como funciona</p>
          <h2>Primeiro você organiza o seu. Depois divide o que faz sentido.</h2>
        </div>
        <p>
          A Zerou foi pensada para a vida real: dinheiro pessoal continua pessoal, despesas do casal ficam em um lugar comum
          e a fatura do cartão aparece do jeito que você paga no banco.
        </p>
      </section>

      <section className="public-section feature-grid routine-grid" id="funcionalidades" aria-label="Funcionalidades Zerou">
        <article className="surface surface-pad feature-card routine-card">
          <span className="step-pill">1</span>
          <WalletCards size={24} aria-hidden="true" />
          <h3>Resumo claro</h3>
          <p>Veja saldo, entradas, gastos e compromissos do mês sem precisar montar planilha.</p>
        </article>
        <article className="surface surface-pad feature-card routine-card">
          <span className="step-pill">2</span>
          <ReceiptText size={24} aria-hidden="true" />
          <h3>Lançamentos rápidos</h3>
          <p>Registre despesas, receitas, contas a pagar e gastos recorrentes em poucos toques.</p>
        </article>
        <article className="surface surface-pad feature-card routine-card">
          <span className="step-pill">3</span>
          <CreditCard size={24} aria-hidden="true" />
          <h3>Cartões e faturas</h3>
          <p>Compras ficam na fatura. Pagamentos quitam a fatura sem virar outra despesa.</p>
        </article>
        <article className="surface surface-pad feature-card routine-card">
          <span className="step-pill">4</span>
          <BarChart3 size={24} aria-hidden="true" />
          <h3>Gastos por categoria</h3>
          <p>Entenda para onde o dinheiro está indo e encontre exageros antes do fim do mês.</p>
        </article>
        <article className="surface surface-pad feature-card routine-card">
          <span className="step-pill">5</span>
          <Split size={24} aria-hidden="true" />
          <h3>Casal sem confusão</h3>
          <p>Divida despesas, acompanhe quem pagou e registre acertos sem abrir toda sua vida financeira.</p>
        </article>
        <article className="surface surface-pad feature-card routine-card">
          <span className="step-pill">6</span>
          <LockKeyhole size={24} aria-hidden="true" />
          <h3>Privacidade por padrão</h3>
          <p>O que é pessoal fica pessoal. O que é dos dois aparece só no espaço compartilhado.</p>
        </article>
      </section>

      <section className="public-section split-section">
        <div>
          <p className="eyebrow">Diferencial</p>
          <h2>Um app financeiro para você e, quando precisar, para os dois.</h2>
        </div>
        <p>
          Muitos apps ajudam a anotar gastos. A Zerou quer resolver o ponto que mais bagunça a rotina: separar o dinheiro
          individual dos combinados do casal, com clareza para pagar, dividir e acertar.
        </p>
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
        <h2>Controle individual. Organização a dois.</h2>
        <p>Comece pela sua rotina individual e convide a outra pessoa quando fizer sentido.</p>
        <Link className="button button--primary" to="/register">
          Começar agora <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
    </PublicLayout>
  );
}
