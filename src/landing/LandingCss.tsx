import { useRef, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, CreditCard, PiggyBank, TrendingUp } from 'lucide-react';
import { AppMockup } from './AppMockup';
import { LandingSections } from './LandingSections';
import { LandingShell } from './LandingShell';

export function LandingCss() {
  const stageRef = useRef<HTMLDivElement>(null);

  function handleMove(event: PointerEvent<HTMLDivElement>) {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty('--mx', `${x * 18}px`);
    el.style.setProperty('--my', `${y * 18}px`);
    el.style.setProperty('--ry', `${-18 - x * 8}deg`);
    el.style.setProperty('--rx', `${6 + y * 6}deg`);
  }

  function handleLeave() {
    const el = stageRef.current;
    if (!el) return;
    el.style.removeProperty('--mx');
    el.style.removeProperty('--my');
    el.style.removeProperty('--ry');
    el.style.removeProperty('--rx');
  }

  const hero = (
    <section className="lp-hero">
      <div className="lp-wrap">
        <div className="lp-hero-grid">
          <div className="lp-hero-copy">
            <span className="lp-pill"><i /> Controle individual. Organização a dois.</span>
            <h1 className="lp-h1">Seu dinheiro, <span className="grad">simples de entender.</span></h1>
            <p className="lp-lead">Gastos, contas, cartões e os combinados do casal num app feito para o celular — sem expor o que é só seu.</p>
            <div className="lp-hero-actions">
              <Link className="lp-btn lp-btn--primary lp-btn--lg" to="/register">Começar grátis <ArrowRight size={18} /></Link>
              <a className="lp-btn lp-btn--ghost lp-btn--lg" href="#recursos">Ver recursos</a>
            </div>
            <div className="lp-proof">
              <span><CheckCircle2 size={18} /> Feito para o celular</span>
              <span><CheckCircle2 size={18} /> Pessoal e casal separados</span>
              <span><CheckCircle2 size={18} /> Fatura sem dupla contagem</span>
            </div>
          </div>

          <div
            className="lp-stage"
            ref={stageRef}
            onPointerMove={handleMove}
            onPointerLeave={handleLeave}
            style={{ ['--ry' as string]: '-18deg', ['--rx' as string]: '6deg' }}
          >
            <span className="lp-coin lp-coin--1" />
            <span className="lp-coin lp-coin--2" />

            <div className="lp-float lp-float--a">
              <span className="ico" style={{ background: '#1f9e6e' }}><TrendingUp size={16} /></span> + R$ 5.200
            </div>
            <div className="lp-float lp-float--c">
              <span className="ico" style={{ background: '#6366c9' }}><CreditCard size={16} /></span> Fatura R$ 1.120
            </div>
            <div className="lp-float lp-float--d">
              <span className="ico" style={{ background: '#e8911c' }}><PiggyBank size={16} /></span> Meta 42%
            </div>

            <div className="lp-stage-phone" style={{ transform: 'rotateY(var(--ry,-18deg)) rotateX(var(--rx,6deg))' }}>
              <div className="lp-phone-bob"><AppMockup /></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <LandingShell hero={hero}>
      <LandingSections />
    </LandingShell>
  );
}
