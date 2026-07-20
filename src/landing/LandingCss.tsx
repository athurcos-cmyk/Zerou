import { useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  motion,
  useMotionValue,
  useMotionTemplate,
  useSpring,
  useTransform,
  useScroll,
  useReducedMotion,
  MotionConfig,
} from 'framer-motion';
import { ArrowRight, CheckCircle2, CreditCard, PiggyBank, TrendingUp } from 'lucide-react';
import { AppMockup } from './AppMockup';
import { LandingSections } from './LandingSections';
import { LandingShell } from './LandingShell';

const ease = [0.16, 1, 0.3, 1] as const;

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.75, ease } },
};

export function LandingCss() {
  const heroRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  /* só dispara tilt quando o dispositivo tem cursor (não-touch) */
  const canHover = useRef(
    typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches
  );

  /* scroll parallax — stage sobe mais devagar que a página */
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const stageScrollY = useTransform(scrollYProgress, [0, 1], ['0%', '18%']);
  const cueOpacity   = useTransform(scrollYProgress, [0, 0.45], [1, 0]);

  /* mouse tracking — apenas o stage reage, texto fica estático */
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 90, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 90, damping: 20 });

  /* tilt do stage inteiro */
  const stageRotateY = useTransform(springX, [-0.5, 0.5], [-10, 10]);
  const stageRotateX = useTransform(springY, [-0.5, 0.5], [5, -5]);

  /* glow laranja segue cursor */
  const glowX = useTransform(springX, [-0.5, 0.5], ['-50px', '50px']);
  const glowY = useTransform(springY, [-0.5, 0.5], ['-28px', '28px']);

  /* gloss de luz na tela do phone — efeito reflexo */
  const glossXpct = useTransform(springX, [-0.5, 0.5], [22, 78]);
  const glossYpct = useTransform(springY, [-0.5, 0.5], [18, 72]);
  const glossBg = useMotionTemplate`radial-gradient(circle at ${glossXpct}% ${glossYpct}%, rgba(255,255,255,0.22) 0%, transparent 52%)`;

  function handleMouseMove(e: React.MouseEvent<HTMLElement>) {
    if (!heroRef.current) return;
    const r = heroRef.current.getBoundingClientRect();
    mouseX.set((e.clientX - r.left) / r.width - 0.5);
    mouseY.set((e.clientY - r.top) / r.height - 0.5);
  }
  function handleMouseLeave() {
    mouseX.set(0);
    mouseY.set(0);
  }

  const hero = (
    <section
      className="lp-hero lp-hero--light"
      ref={heroRef}
      onMouseMove={canHover.current ? handleMouseMove : undefined}
      onMouseLeave={canHover.current ? handleMouseLeave : undefined}
    >
      {/* Grade perspectiva recuando para o fundo */}
      <div className="lp-grid-bg" aria-hidden="true" />

      {/* Glow laranja — segue cursor suavemente */}
      <motion.div className="lp-glow" aria-hidden="true" style={{ x: glowX, y: glowY }} />

      <div className="lp-wrap" style={{ position: 'relative', zIndex: 2 }}>
        <div className="lp-hero-dark-grid">

          {/* Texto — completamente estático, sem parallax */}
          <motion.div
            className="lp-hero-copy"
            variants={stagger}
            initial="hidden"
            animate="show"
          >
            <motion.span className="lp-pill" variants={fadeUp}>
              <i /> A real que ninguém te conta
            </motion.span>

            <motion.h1 className="lp-h1" variants={fadeUp}>
              Seu salário{' '}
              <em className="lp-grad">já chega devendo.</em>
            </motion.h1>

            <motion.p className="lp-subhead" variants={fadeUp}>
              E some antes de você ver a cor dele.
            </motion.p>

            <motion.p className="lp-lead" variants={fadeUp}>
              Dia 5 cai, dia 15 já era. Aí vem a fatura, o "tinha
              esquecido dessa", o boleto que dobrou.{' '}
              <strong>Você não é ruim com dinheiro</strong> — você só
              nunca viu pra onde ele foge.
            </motion.p>

            <motion.div className="lp-hero-actions" variants={fadeUp}>
              <Link className="lp-btn lp-btn--primary lp-btn--lg" to="/register">
                Quero ver pra onde vai meu dinheiro <ArrowRight size={18} />
              </Link>
              <a className="lp-btn lp-btn--ghost lp-btn--lg" href="#como">
                Como funciona
              </a>
            </motion.div>

            <motion.p className="lp-hero-note" variants={fadeUp}>
              Grátis · sem cartão de crédito · funciona no navegador do celular
            </motion.p>

            <motion.div className="lp-proof" variants={fadeUp}>
              <span><CheckCircle2 size={16} /> Feito pro celular</span>
              <span><CheckCircle2 size={16} /> Pessoal e casal, separados</span>
              <span><CheckCircle2 size={16} /> Fatura sem contar duas vezes</span>
            </motion.div>
          </motion.div>

          {/* Stage — scroll parallax no wrapper externo */}
          <motion.div style={{ y: stageScrollY }}>
            {/* Perspectiva 3D — parent estabelece o frustum */}
            <div style={{ perspective: '1100px' }}>
              {/* Stage com preserve-3d: badges ficam em Z diferentes, tilt unifica tudo */}
              <motion.div
                className="lp-stage"
                style={{
                  rotateY: stageRotateY,
                  rotateX: stageRotateX,
                  transformStyle: 'preserve-3d',
                }}
                initial={{ opacity: 0, y: 60 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.3, ease }}
              >
                {/* Badge mais próxima do viewer (Z alto) — move mais no tilt */}
                <motion.div
                  className="lp-float lp-float--a lp-float--light"
                  style={{ z: 60 }}
                  animate={reduceMotion ? {} : { y: [0, -10, 0] }}
                  transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <span className="ico" style={{ background: '#1f9e6e' }}><TrendingUp size={15} /></span>
                  + R$ 5.200
                </motion.div>

                {/* Badge camada média */}
                <motion.div
                  className="lp-float lp-float--c lp-float--light"
                  style={{ z: 30 }}
                  animate={reduceMotion ? {} : { y: [0, -8, 0] }}
                  transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
                >
                  <span className="ico" style={{ background: '#6366c9' }}><CreditCard size={15} /></span>
                  Fatura R$ 1.120
                </motion.div>

                {/* Badge atrás do phone (Z negativo) */}
                <motion.div
                  className="lp-float lp-float--d lp-float--light"
                  style={{ z: -15 }}
                  animate={reduceMotion ? {} : { y: [0, -12, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
                >
                  <span className="ico" style={{ background: '#e8911c' }}><PiggyBank size={15} /></span>
                  Meta 42%
                </motion.div>

                {/* Phone no Z=0 + bob + gloss de luz */}
                <motion.div
                  className="lp-stage-phone"
                  animate={reduceMotion ? {} : { y: [0, -8, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <AppMockup />
                  {/* Gloss: reflexo de luz que segue o cursor */}
                  <motion.div
                    className="lp-phone-gloss"
                    style={{ background: glossBg }}
                    aria-hidden="true"
                  />
                </motion.div>
              </motion.div>
            </div>
          </motion.div>

        </div>
      </div>

      <motion.div
        className="lp-scroll-cue lp-scroll-cue--light"
        style={{ opacity: cueOpacity }}
      >
        <span />
      </motion.div>
    </section>
  );

  return (
    <MotionConfig reducedMotion="user">
      <LandingShell hero={hero}>
        <LandingSections />
      </LandingShell>
    </MotionConfig>
  );
}
