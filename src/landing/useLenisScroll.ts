import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

/* Scroll suave/amortecido só na landing (não no app) — monta no mount da `LandingCss`, desmonta
   ao sair da rota. Respeita `prefers-reduced-motion`: quem pediu menos movimento recebe o scroll
   nativo do navegador, sem suavização nenhuma. Sincroniza com o ticker do GSAP (não com
   `requestAnimationFrame` direto) porque é o `ScrollTrigger` das seções abaixo que precisa saber
   a posição real do scroll a cada frame — sem isso o pin/scrub das etapas desalinha do dedo/mouse. */
export function useLenisScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);

    function onTick(time: number) {
      lenis.raf(time * 1000);
    }
    gsap.ticker.add(onTick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(onTick);
      lenis.destroy();
    };
  }, []);
}
