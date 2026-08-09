import { describe, expect, it, beforeEach } from 'vitest';
import { preventPullToRefresh } from './preventPullToRefresh';

/**
 * O guard só pode cancelar o puxão VERTICAL no topo do documento. Cancelar um gesto horizontal
 * mata o arrasto das faixas que rolam de lado (`.invoice-strip-track`, `.chip-row--scroll`) —
 * foi exatamente o bug de 09/08/2026.
 */
function touchMove(target: Element, from: { x: number; y: number }, to: { x: number; y: number }) {
  const start = new Event('touchstart', { bubbles: true, cancelable: true });
  Object.defineProperty(start, 'touches', { value: [{ clientX: from.x, clientY: from.y }] });
  target.dispatchEvent(start);

  const move = new Event('touchmove', { bubbles: true, cancelable: true });
  Object.defineProperty(move, 'touches', { value: [{ clientX: to.x, clientY: to.y }] });
  target.dispatchEvent(move);
  return move.defaultPrevented;
}

describe('preventPullToRefresh', () => {
  beforeEach(() => {
    // O guard sai cedo sem isto (aparelho sem toque).
    if (!('ontouchstart' in window)) {
      Object.defineProperty(window, 'ontouchstart', { value: null, configurable: true });
    }
    window.scrollY = 0;
    preventPullToRefresh();
  });

  it('cancela o puxão pra baixo no topo do documento', () => {
    expect(touchMove(document.body, { x: 200, y: 300 }, { x: 200, y: 360 })).toBe(true);
  });

  it('NÃO cancela arrasto horizontal, mesmo com o dedo descendo um pouco', () => {
    expect(touchMove(document.body, { x: 200, y: 300 }, { x: 140, y: 308 })).toBe(false);
  });
});
