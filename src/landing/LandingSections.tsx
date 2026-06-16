import { Link } from 'react-router-dom';
import {
  ArrowRight, BarChart3, CreditCard, Handshake, LockKeyhole, Split, Target, Wallet
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

      {/* Couple band */}
      <section className="lp-section" id="casal">
        <div className="lp-couple">
          <div>
            <p className="lp-kicker" style={{ color: '#f8a07a' }}>Modo casal</p>
            <h2 className="lp-h2">Dividam sem abrir a vida financeira.</h2>
            <p>A maioria dos apps obriga você a misturar tudo. Na Zerou, cada um continua com seu espaço privado e só o que vocês decidem dividir aparece no espaço compartilhado.</p>
            <ul className="lp-couple-points">
              <li><span className="lp-cp-ico" style={{ background: 'rgba(255,255,255,0.12)' }}><LockKeyhole size={16} /></span> Seu pessoal continua 100% privado — o outro nunca vê suas contas e cartões</li>
              <li><span className="lp-cp-ico" style={{ background: 'rgba(255,255,255,0.12)' }}><Split size={16} /></span> Lance uma despesa em comum e divida igual, por porcentagem ou valor</li>
              <li><span className="lp-cp-ico" style={{ background: 'rgba(255,255,255,0.12)' }}><Handshake size={16} /></span> A Zerou calcula quem deve quanto — vocês acertam com um toque</li>
            </ul>
          </div>
          <div className="lp-couple-card">
            <span>Você tem a receber</span>
            <strong>R$ 240,00</strong>
            <span>Ana deve esse valor a você.</span>
            <div className="pay"><Handshake size={16} style={{ marginRight: 6 }} /> Acertar contas</div>
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
