/**
 * Bloqueia o "puxar pra baixo pra recarregar" (pull-to-refresh) — que acontece inclusive no PWA
 * instalado no Android — SEM tocar no scroll normal.
 *
 * Cirúrgico de propósito: só cancela o gesto quando a página já está no TOPO (`window.scrollY <= 0`)
 * E o dedo está indo pra BAIXO (o único movimento que dispara o refresh). Qualquer outro toque
 * passa direto — rolar a tela pra baixo é dedo indo pra cima, e rolar quando não está no topo tem
 * `scrollY > 0`, então nenhum dos dois é cancelado. `window.scrollY` é confiável independente de
 * qual elemento é o scroller (evita a ambiguidade do `document.scrollingElement`).
 *
 * Por que JS e não CSS: a tentativa via `overscroll-behavior-y: contain` em `html, body` travou
 * TODO o scroll no mobile (interação com o `overflow-x: hidden` do body). Ver `docs/design/DESIGN.md`.
 */
export function preventPullToRefresh() {
  if (typeof window === 'undefined' || !('ontouchstart' in window)) return;

  let startY = 0;

  window.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length === 1) startY = event.touches[0].clientY;
    },
    { passive: true }
  );

  window.addEventListener(
    'touchmove',
    (event) => {
      // Ignora multi-toque (pinça/zoom) — não é o gesto de refresh.
      if (event.touches.length !== 1) return;
      const pullingDown = event.touches[0].clientY > startY;
      const atTop = window.scrollY <= 0;
      if (atTop && pullingDown && event.cancelable) {
        event.preventDefault();
      }
    },
    { passive: false }
  );
}
