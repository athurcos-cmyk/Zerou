import { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { AppMockup } from './AppMockup';
import { LandingSections } from './LandingSections';
import { LandingShell } from './LandingShell';

const WebglScene = lazy(() => import('./WebglScene'));

export function LandingWebgl() {
  const hero = (
    <section className="lp-hero">
      <span className="lp-blob lp-blob--tang" />
      <span className="lp-blob lp-blob--blue" />
      <div className="lp-wrap">
        <div className="lp-hero-grid">
          <div className="lp-hero-copy">
            <span className="lp-pill"><i /> 3D de verdade · WebGL</span>
            <h1 className="lp-h1">Seu dinheiro, <span className="grad">em outra dimensão.</span></h1>
            <p className="lp-lead">Passe o mouse no cartão e ele responde. Gastos, contas, cartões e o casal num app feito para o celular.</p>
            <div className="lp-hero-actions">
              <Link className="lp-btn lp-btn--primary lp-btn--lg" to="/register">Começar grátis <ArrowRight size={18} /></Link>
              <a className="lp-btn lp-btn--ghost lp-btn--lg" href="#recursos">Ver recursos</a>
            </div>
            <div className="lp-proof">
              <span><CheckCircle2 size={18} /> Feito para o celular</span>
              <span><CheckCircle2 size={18} /> Pessoal e casal separados</span>
            </div>
          </div>

          <div className="lp-webgl-stage">
            <div className="lp-canvas">
              <Suspense fallback={<div className="lp-webgl-fallback">Carregando cena 3D…</div>}>
                <WebglScene />
              </Suspense>
            </div>
            <div className="lp-webgl-phone"><AppMockup /></div>
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <LandingShell variant="webgl" hero={hero}>
      <LandingSections />
    </LandingShell>
  );
}
