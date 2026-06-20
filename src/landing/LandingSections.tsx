import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import {
  ArrowRight, BarChart3, CreditCard, LockKeyhole, PiggyBank, Target, TrendingUp, Wallet
} from 'lucide-react';

const ease = [0.16, 1, 0.3, 1] as const;

function RevealSection({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.section
      ref={ref}
      id={id}
      className={`lp-section ${className}`}
      initial={{ opacity: 0, y: 36 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease }}
    >
      {children}
    </motion.section>
  );
}

function TiltCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.article
      className={`lp-cell ${className}`}
      whileHover={{ rotateX: -4, rotateY: 5, scale: 1.025 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      style={{ transformPerspective: 900 }}
    >
      {children}
    </motion.article>
  );
}

function CountUp({ to, prefix = '', suffix = '' }: { to: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  return (
    <motion.span
      ref={ref}
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : {}}
    >
      {inView ? (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {prefix}
          <motion.span>
            {to.toLocaleString('pt-BR')}
          </motion.span>
          {suffix}
        </motion.span>
      ) : `${prefix}${to.toLocaleString('pt-BR')}${suffix}`}
    </motion.span>
  );
}

const faqs = [
  { q: 'Posso usar sozinho?', a: 'Sim. o Granix funciona muito bem para a sua vida financeira individual. O modo casal entra só quando você quiser.' },
  { q: 'O que a outra pessoa vê?', a: 'Apenas o que está no espaço do casal: despesas compartilhadas, divisões e acertos. Suas contas, cartões e lançamentos pessoais continuam privados.' },
  { q: 'Cartão entra no saldo duas vezes?', a: 'Não. Compras ficam na fatura, e o saldo da conta só muda quando você registra o pagamento.' },
  { q: 'Preciso instalar pela loja?', a: 'Não. o Granix é um app web: abra pelo navegador do celular e adicione o atalho na tela inicial.' }
];

export function LandingSections() {
  const bentoRef = useRef<HTMLDivElement>(null);
  const bentoInView = useInView(bentoRef, { once: true, margin: '-60px' });

  return (
    <>
      {/* Stats band */}
      <RevealSection className="lp-section--tight">
        <div className="lp-stats-band">
          <div className="lp-stat">
            <strong><CountUp to={100} suffix="%" /></strong>
            <span>no celular</span>
          </div>
          <div className="lp-stat-divider" />
          <div className="lp-stat">
            <strong>2 min</strong>
            <span>pra começar</span>
          </div>
          <div className="lp-stat-divider" />
          <div className="lp-stat">
            <strong>R$ 0</strong>
            <span>pra sempre</span>
          </div>
        </div>
      </RevealSection>

      {/* Bento features */}
      <RevealSection id="recursos">
        <div className="lp-section-head">
          <p className="lp-kicker">O que o Granix faz por você</p>
          <h2 className="lp-h2">Tudo o que some no mês, num lugar só.</h2>
          <p>Sem planilha e sem complicação. Você vê pra onde vai cada real e corta o que não faz sentido — antes de ficar sem.</p>
        </div>

        <motion.div
          className="lp-bento"
          ref={bentoRef}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09 } } }}
          initial="hidden"
          animate={bentoInView ? 'show' : 'hidden'}
        >
          <motion.div
            variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } } }}
            className="lp-cell lp-cell--wide lp-cell--accent"
            style={{ transformPerspective: 900 }}
          >
            <span className="lp-cell-ico" style={{ background: '#ee5524' }}><Wallet size={22} /></span>
            <h3>Anote antes de esquecer</h3>
            <p>O gasto que some é o que você esquece. Aqui você lança em 3 toques — o valor é o herói.</p>
            <div className="lp-demo-hero">
              <span>Valor</span>
              <strong>R$ 318,00</strong>
            </div>
          </motion.div>

          <TiltCard className="lp-cell--tall">
            <span className="lp-cell-ico" style={{ background: '#6366c9' }}><BarChart3 size={22} /></span>
            <h3>Veja o vilão do mês</h3>
            <p>Descubra qual categoria está comendo seu salário — antes do dia 15.</p>
            <div className="lp-demo-cats">
              <span className="lp-demo-cat"><i style={{ background: '#ee5524' }} /> Mercado</span>
              <span className="lp-demo-cat"><i style={{ background: '#3b82c4' }} /> Casa</span>
              <span className="lp-demo-cat"><i style={{ background: '#9b5de5' }} /> Lazer</span>
              <span className="lp-demo-cat"><i style={{ background: '#1f9e6e' }} /> Salário</span>
            </div>
          </TiltCard>

          <TiltCard className="lp-cell--third">
            <span className="lp-cell-ico" style={{ background: '#1f9e6e' }}><CreditCard size={22} /></span>
            <h3>Cartão sem susto</h3>
            <p>Limite usado e o quanto ainda dá, sem contar a fatura duas vezes.</p>
            <div className="lp-demo-bar"><i style={{ width: '64%' }} /></div>
          </TiltCard>

          <TiltCard className="lp-cell--third">
            <span className="lp-cell-ico" style={{ background: '#e8911c' }}><Target size={22} /></span>
            <h3>Finalmente sobra</h3>
            <p>Guarde pra um objetivo ou quite uma dívida, com progresso que cresce na sua frente.</p>
            <div className="lp-demo-bar"><i style={{ width: '42%' }} /></div>
          </TiltCard>

          <TiltCard className="lp-cell--third lp-cell--dark-card">
            <span className="lp-cell-ico" style={{ background: 'rgba(255,255,255,0.12)' }}><LockKeyhole size={22} /></span>
            <h3>O que é seu, é só seu</h3>
            <p>Seu pessoal nunca aparece pro outro. Só o que vocês decidem dividir fica em comum.</p>
          </TiltCard>
        </motion.div>
      </RevealSection>

      {/* Couple band */}
      <RevealSection id="casal">
        <div className="lp-couple">
          <div>
            <p className="lp-kicker" style={{ color: '#f8a07a' }}>Modo casal</p>
            <h2 className="lp-h2">A viagem dos sonhos some todo mês nas pequenas contas.</h2>
            <p>Vocês querem juntar, mas o dinheiro escorre entre os dois e o sonho nunca sai do papel. Com o cofrinho do casal, cada real guardado aparece — e o objetivo finalmente cresce.</p>
            <ul className="lp-couple-points">
              <li><span className="lp-cp-ico"><PiggyBank size={16} /></span> Guardem juntos: o dinheiro sai da sua conta e entra no cofrinho do casal</li>
              <li><span className="lp-cp-ico"><TrendingUp size={16} /></span> Vejam quanto cada um contribuiu e quanto juntaram no mês</li>
              <li><span className="lp-cp-ico"><LockKeyhole size={16} /></span> Seu pessoal continua 100% privado — o outro só vê o cofrinho em comum</li>
            </ul>
          </div>
          <motion.div
            className="lp-couple-card"
            whileHover={{ scale: 1.03, rotateZ: 0.5 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          >
            <div className="lp-cofrinho-head">
              <span className="lp-cofrinho-ico"><PiggyBank size={20} /></span>
              <div><strong>Viagem dos sonhos</strong><span>Cofrinho do casal</span></div>
            </div>
            <div className="lp-cofrinho-amount">R$ 4.300 <em>de R$ 12.000</em></div>
            <div className="lp-cofrinho-bar"><i style={{ width: '36%' }} /></div>
            <div className="lp-cofrinho-month">Este mês vocês juntaram <strong>+ R$ 860</strong></div>
          </motion.div>
        </div>
      </RevealSection>

      {/* Steps */}
      <RevealSection id="como">
        <div className="lp-section-head">
          <p className="lp-kicker">Como funciona</p>
          <h2 className="lp-h2">Do caos ao controle em 2 minutos.</h2>
        </div>
        <div className="lp-steps">
          {[
            { n: '1', h: 'Crie em 2 minutos', p: 'Responda 2 perguntas e o Granix monta seu espaço privado na hora.' },
            { n: '2', h: 'Veja a verdade', p: 'Jogue gastos, contas e cartões pra dentro. Descubra pra onde foi cada real.' },
            { n: '3', h: 'Pare de terminar no zero', p: 'Corte o que não faz sentido e junte pro que importa — sozinho ou a dois.' },
          ].map((step, i) => (
            <motion.article
              key={step.n}
              className="lp-step"
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, delay: i * 0.1, ease }}
            >
              <span className="lp-step-num">{step.n}</span>
              <h3>{step.h}</h3>
              <p>{step.p}</p>
            </motion.article>
          ))}
        </div>
      </RevealSection>

      {/* FAQ */}
      <RevealSection>
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
      </RevealSection>

      {/* Final CTA */}
      <RevealSection>
        <div className="lp-cta lp-cta--dark">
          <div className="lp-cta-circles" aria-hidden="true">
            <span className="lp-cta-c lp-cta-c--1" />
            <span className="lp-cta-c lp-cta-c--2" />
          </div>
          <p className="lp-kicker lp-kicker--light">Chega de terminar o mês no zero</p>
          <h2 className="lp-h2 lp-h2--light">Descubra pra onde vai<br />seu dinheiro hoje.</h2>
          <Link className="lp-btn lp-btn--primary lp-btn--lg" to="/register">
            Quero ver meus gastos <ArrowRight size={18} />
          </Link>
          <p className="lp-cta-note lp-cta-note--light">Grátis · sem cartão de crédito · em 2 minutos</p>
        </div>
      </RevealSection>
    </>
  );
}
