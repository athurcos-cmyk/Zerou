/**
 * Bloqueia o "puxar pra baixo pra recarregar" (pull-to-refresh) — que acontece inclusive no PWA
 * instalado no Android — SEM tocar no scroll normal (nem no de dentro dos BottomSheets).
 *
 * Cirúrgico: só cancela o gesto quando o puxão-pra-baixo NÃO pode ser consumido por nenhum scroll
 * (o documento está no topo E nenhum container rolável sob o dedo tem o que rolar pra cima). Nesse
 * caso, o puxão viraria overscroll do documento = pull-to-refresh. Qualquer outro movimento passa:
 * - rolar a tela pra baixo é dedo indo pra CIMA (não é "pra baixo") → nunca cancelado;
 * - rolar dentro de um sheet/lista com `scrollTop > 0` → o próprio container consome → não cancela.
 *
 * `window.scrollY` (e `scrollTop` dos ancestrais) são confiáveis independente de qual elemento é o
 * scroller. Por que JS e não CSS: `overscroll-behavior-y: contain` em `html, body` travou TODO o
 * scroll no mobile (interação com o `overflow-x: hidden` do body). Ver `docs/design/DESIGN.md`.
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
      if (!pullingDown || window.scrollY > 0) return;
      // No topo do documento e puxando pra baixo: só é refresh se nada sob o dedo puder consumir.
      if (!pullCanBeConsumed(event.target) && event.cancelable) {
        event.preventDefault();
      }
    },
    { passive: false }
  );
}

/**
 * Existe algum ancestral rolável (sob o dedo) com `scrollTop > 0`? Se sim, o puxão-pra-baixo é
 * rolar ESSE container pra cima (não o documento) — então não é pull-to-refresh. `getComputedStyle`
 * só roda quando `scrollTop > 0` (caso raro), pra não pesar em todo touchmove.
 */
function pullCanBeConsumed(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null;
  while (node) {
    if (node.scrollTop > 0) {
      const overflowY = getComputedStyle(node).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') return true;
    }
    node = node.parentElement;
  }
  return false;
}
