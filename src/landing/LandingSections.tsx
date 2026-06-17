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
          <p className="lp-kicker">O que a Zerou faz por você</p>
          <h2 className="lp-h2">Tudo o que some no mês, num lugar só.</h2>
          <p>Sem planilha e sem complicação. Você vê pra onde vai cada real e corta o que não faz sentido — antes de ficar sem.</p>
        </div>

        <div className="lp-bento">
          <article className="lp-cell lp-cell--wide lp-cell--accent">
            <span className="lp-cell-ico" style={{ background: '#ee5524' }}><Wallet size={22} /></span>
            <h3>Anote antes de esquecer</h3>
            <p>O gasto que some é o que você esquece. Aqui você lança em 3 toques — o valor é o herói.</p>
            <div className="lp-demo-hero">
              <span>Valor</span>
              <strong>R$ 318,00</strong>
            </div>
          </article>

          <article className="lp-cell lp-cell--tall">
            <span className="lp-cell-ico" style={{ background: '#6366c9' }}><BarChart3 size={22} /></span>
            <h3>Veja o vilão do mês</h3>
            <p>Descubra qual categoria está comendo seu salário — antes do dia 15.</p>
            <div className="lp-demo-cats">
              <span className="lp-demo-cat"><i style={{ background: '#ee5524' }} /> Mercado</span>
              <span className="lp-demo-cat"><i style={{ background: '#3b82c4' }} /> Casa</span>
              <span className="lp-demo-cat"><i style={{ background: '#9b5de5' }} /> Lazer</span>
              <span className="lp-demo-cat"><i style={{ background: '#1f9e6e' }} /> Salário</span>
            </div>
          </article>

          <article className="lp-cell lp-cell--third">
            <span className="lp-cell-ico" style={{ background: '#1f9e6e' }}><CreditCard size={22} /></span>
            <h3>Cartão sem susto</h3>
            <p>Limite usado e o quanto ainda dá, sem contar a fatura duas vezes.</p>
            <div className="lp-demo-bar"><i style={{ width: '64%' }} /></div>
          </article>

          <article className="lp-cell lp-cell--third">
            <span className="lp-cell-ico" style={{ background: '#e8911c' }}><Target size={22} /></span>
            <h3>Finalmente sobra</h3>
            <p>Guarde pra um objetivo ou quite uma dívida, com progresso que cresce na sua frente.</p>
            <div className="lp-demo-bar"><i style={{ width: '42%' }} /></div>
          </article>

          <article className="lp-cell lp-cell--third">
            <span className="lp-cell-ico" style={{ background: '#1c1814' }}><LockKeyhole size={22} /></span>
            <h3>O que é seu, é só seu</h3>
            <p>Seu pessoal nunca aparece pro outro. Só o que vocês decidem dividir fica em comum.</p>
          </article>
        </div>
      </section>

      {/* Couple band — cofrinho */}
      <section className="lp-section" id="casal">
        <div className="lp-couple">
          <div>
            <p className="lp-kicker" style={{ color: '#f8a07a' }}>Modo casal</p>
            <h2 className="lp-h2">A viagem dos sonhos some todo mês nas pequenas contas.</h2>
            <p>Vocês querem juntar, mas o dinheiro escorre entre os dois e o sonho nunca sai do papel. Com o cofrinho do casal, cada real guardado aparece — e o objetivo finalmente cresce na frente de vocês.</p>
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
          <h2 className="lp-h2">Do caos ao controle em 2 minutos.</h2>
        </div>
        <div className="lp-steps">
          <article className="lp-step">
            <span className="lp-step-num">1</span>
            <h3>Crie em 2 minutos</h3>
            <p>Responda 2 perguntas e a Zerou monta seu espaço privado na hora.</p>
          </article>
          <article className="lp-step">
            <span className="lp-step-num">2</span>
            <h3>Veja a verdade</h3>
            <p>Jogue gastos, contas e cartões pra dentro. Descubra pra onde foi cada real.</p>
          </article>
          <article className="lp-step">
            <span className="lp-step-num">3</span>
            <h3>Pare de terminar no zero</h3>
            <p>Corte o que não faz sentido e junte pro que importa — sozinho ou a dois.</p>
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
          <p className="lp-kicker">Chega de terminar o mês no zero</p>
          <h2 className="lp-h2">Descubra pra onde vai seu dinheiro hoje.</h2>
          <Link className="lp-btn lp-btn--primary lp-btn--lg" to="/register">
            Quero ver meus gastos <ArrowRight size={18} />
          </Link>
          <p className="lp-cta-note">Grátis · sem cartão de crédito · em 2 minutos</p>
        </div>
      </section>
    </>
  );
}
