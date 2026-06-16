import { Suspense, lazy, useRef, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, PiggyBank, TrendingUp } from 'lucide-react';
import { AppMockup } from './AppMockup';
import { LandingSections } from './LandingSections';
import { LandingShell } from './LandingShell';

const WebglCard = lazy(() => import('./WebglCard'));

export function LandingMix() {
  const stageRef = useRef<HTMLDivElement>(null);

  function handleMove(event: PointerEvent<HTMLDivElement>) {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty('--ry', `${-18 - x * 8}deg`);
    el.style.setProperty('--rx', `${6 + y * 6}deg`);
  }
  function handleLeave() {
    const el = stageRef.current;
    if (!el) return;
    el.style.removeProperty('--ry');
    el.style.removeProperty('--rx');
  }

  const hero = (
    <section className="lp-hero">
      <span className="lp-blob lp-blob--tang" />
      <span className="lp-blob lp-blob--blue" />
      <div className="lp-wrap">
        <div className="lp-hero-grid">
          <div className="lp-hero-copy">
            <span className="lp-pill"><i /> CSS 3D + um toque de WebGL</span>
            <h1 className="lp-h1">Seu dinheiro, <span className="grad">leve e vivo.</span></h1>
            <p className="lp-lead">A base flui em CSS; o cartão é WebGL de verdade e segue o seu mouse. O melhor dos dois mundos.</p>
            <div className="lp-hero-actions">
              <Link className="lp-btn lp-btn--primary lp-btn--lg" to="/register">Começar grátis <ArrowRight size={18} /></Link>
              <a className="lp-btn lp-btn--ghost lp-btn--lg" href="#recursos">Ver recursos</a>
            </div>
            <div className="lp-proof">
              <span><CheckCircle2 size={18} /> Feito para o celular</span>
              <span><CheckCircle2 size={18} /> Pessoal e casal separados</span>
            </div>
          </div>

          <div className="lp-stage" ref={stageRef} onPointerMove={handleMove} onPointerLeave={handleLeave}>
            <span className="lp-coin lp-coin--2" />

            {/* WebGL highlight: the 3D card */}
            <div className="lp-mix-card">
              <Suspense fallback={null}>
                <WebglCard />
              </Suspense>
            </div>

            <div className="lp-float lp-float--a">
              <span className="ico" style={{ background: '#1f9e6e' }}><TrendingUp size={16} /></span> + R$ 5.200
            </div>
            <div className="lp-float lp-float--b">
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
    <LandingShell variant="mix" hero={hero}>
      <LandingSections />
    </LandingShell>
  );
}
