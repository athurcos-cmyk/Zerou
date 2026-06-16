import { Link } from 'react-router-dom';
import {
  ArrowRight, BarChart3, CreditCard, LockKeyhole, PiggyBank, Target, TrendingUp, Wallet
} from 'lucide-react';

const faqs = [
  { q: 'Posso usar sozinho?', a: 'Sim. A Zerou funciona muito bem para a sua vida financeira individual. O modo casal entra só quando você quiser.' },
  { q: 'O que a outra pessoa vê?', a: 'Apenas o que está no espaço do casal: despesas compartilhadas, divisões e acertos. Suas contas, cartões e lançamentos pessoais continuam privados.' },
  { q: 'Cartão entra no saldo duas vezes?', a: 'Não. Compras ficam na fatura, e o saldo da conta só muda quando você registra o pagamento.' },
  { q: 'Preciso instalar pela loja?', a: 'Não. A Zerou é um app web: abra pelo navegador do celular e adicione o atalho na tela inicial.' }
];

export function LandingSections() {
  return (
    <>
      {/* Bento features */}
      <section className="lp-section" id="recursos">
        <div className="lp-section-head">
          <p className="lp-kicker">Recursos</p>
          <h2 className="lp-h2">Tudo o que você precisa, sem planilha.</h2>
          <p>Lançamentos em segundos, cartões sem dupla contagem e uma visão clara de para onde o dinheiro vai.</p>
        </div>

        <div className="lp-bento">
          <article className="lp-cell lp-cell--wide lp-cell--accent">
            <span className="lp-cell-ico" style={{ background: '#ee5524' }}><Wallet size={22} /></span>
            <h3>Lançar é instantâneo</h3>
            <p>O valor é o herói: digite, escolha categoria e conta. Pronto.</p>
            <div className="lp-demo-hero">
              <span>Valor</span>
              <strong>R$ 318,00</strong>
            </div>
          </article>

          <article className="lp-cell lp-cell--tall">
            <span className="lp-cell-ico" style={{ background: '#6366c9' }}><BarChart3 size={22} /></span>
            <h3>Gastos por categoria</h3>
            <p>Veja exageros antes do fim do mês.</p>
            <div className="lp-demo-cats">
              <span className="lp-demo-cat"><i style={{ background: '#ee5524' }} /> Mercado</span>
              <span className="lp-demo-cat"><i style={{ background: '#3b82c4' }} /> Casa</span>
              <span className="lp-demo-cat"><i style={{ background: '#9b5de5' }} /> Lazer</span>
              <span className="lp-demo-cat"><i style={{ background: '#1f9e6e' }} /> Salário</span>
            </div>
          </article>

          <article className="lp-cell lp-cell--third">
            <span className="lp-cell-ico" style={{ background: '#1f9e6e' }}><CreditCard size={22} /></span>
            <h3>Cartões e faturas</h3>
            <p>Limite usado e disponível num olhar.</p>
            <div className="lp-demo-bar"><i style={{ width: '64%' }} /></div>
          </article>

          <article className="lp-cell lp-cell--third">
            <span className="lp-cell-ico" style={{ background: '#e8911c' }}><Target size={22} /></span>
            <h3>Metas</h3>
            <p>Guardar dinheiro ou quitar dívidas com progresso real.</p>
            <div className="lp-demo-bar"><i style={{ width: '42%' }} /></div>
          </article>

          <article className="lp-cell lp-cell--third">
            <span className="lp-cell-ico" style={{ background: '#1c1814' }}><LockKeyhole size={22} /></span>
            <h3>Privado por padrão</h3>
            <p>O que é seu fica só seu. O dos dois aparece só no espaço compartilhado.</p>
          </article>
        </div>
      </section>

      {/* Couple band — cofrinho */}
      <section className="lp-section" id="casal">
        <div className="lp-couple">
          <div>
            <p className="lp-kicker" style={{ color: '#f8a07a' }}>Modo casal</p>
            <h2 className="lp-h2">Juntem dinheiro pra realizar junto.</h2>
            <p>Criem um cofrinho em comum — viagem, reserva, a casa nova. Cada um guarda quando quiser, direto da sua conta, e vocês acompanham o quanto já juntaram rumo à meta.</p>
            <ul className="lp-couple-points">
              <li><span className="lp-cp-ico"><PiggyBank size={16} /></span> Guardem juntos para um objetivo: o dinheiro sai da sua conta e entra no cofrinho do casal</li>
              <li><span className="lp-cp-ico"><TrendingUp size={16} /></span> Vejam quanto cada um contribuiu e quanto juntaram no mês</li>
              <li><span className="lp-cp-ico"><LockKeyhole size={16} /></span> Seu pessoal continua 100% privado — o outro só vê o cofrinho em comum</li>
            </ul>
          </div>
          <div className="lp-couple-card">
            <div className="lp-cofrinho-head">
              <span className="lp-cofrinho-ico"><PiggyBank size={20} /></span>
              <div><strong>Viagem dos sonhos</strong><span>Cofrinho do casal</span></div>
            </div>
            <div className="lp-cofrinho-amount">R$ 4.300 <em>de R$ 12.000</em></div>
            <div className="lp-cofrinho-bar"><i style={{ width: '36%' }} /></div>
            <div className="lp-cofrinho-month">Este mês vocês juntaram <strong>+ R$ 860</strong></div>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="lp-section" id="como">
        <div className="lp-section-head">
          <p className="lp-kicker">Como funciona</p>
          <h2 className="lp-h2">Comece em 3 passos.</h2>
        </div>
        <div className="lp-steps">
          <article className="lp-step">
            <span className="lp-step-num">1</span>
            <h3>Crie sua conta</h3>
            <p>Responda um questionário rápido e a Zerou monta seu espaço pessoal privado.</p>
          </article>
          <article className="lp-step">
            <span className="lp-step-num">2</span>
            <h3>Lance e acompanhe</h3>
            <p>Registre gastos, contas e cartões. Veja saldo, disponível e comprometido na hora.</p>
          </article>
          <article className="lp-step">
            <span className="lp-step-num">3</span>
            <h3>Convide quem quiser</h3>
            <p>Quando fizer sentido, divida despesas com outra pessoa e acertem com clareza.</p>
          </article>
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-section">
        <div className="lp-section-head">
          <p className="lp-kicker">FAQ</p>
          <h2 className="lp-h2">Antes de começar.</h2>
        </div>
        <div className="lp-faq">
          {faqs.map((faq) => (
            <details key={faq.q}>
              <summary>{faq.q}</summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="lp-section">
        <div className="lp-cta">
          <p className="lp-kicker">Controle individual. Organização a dois.</p>
          <h2 className="lp-h2">Seu dinheiro, finalmente simples.</h2>
          <Link className="lp-btn lp-btn--primary lp-btn--lg" to="/register">
            Começar grátis <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </>
  );
}
