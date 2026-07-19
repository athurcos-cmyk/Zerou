import { describe, expect, it } from 'vitest';
import { dedupeById } from './financeService';

describe('dedupeById', () => {
  it('une listas por id sem duplicar na fronteira', () => {
    const a = [{ id: '1', v: 'a1' }, { id: '2', v: 'a2' }];
    const b = [{ id: '2', v: 'b2' }, { id: '3', v: 'b3' }];
    expect(dedupeById(a, b).map((x) => x.id).sort()).toEqual(['1', '2', '3']);
  });

  it('o último vence em id repetido (a Análise sobrescreve a versão das 300)', () => {
    const boot = [{ id: '2', v: 'boot' }];
    const analysis = [{ id: '2', v: 'analysis' }];
    expect(dedupeById(boot, analysis)).toEqual([{ id: '2', v: 'analysis' }]);
  });

  it('inclui item que só existe na segunda lista (mês antigo fora das 300)', () => {
    const recent300 = [{ id: 'r1' }];
    const oldMonth = [{ id: 'old1' }];
    expect(dedupeById(recent300, oldMonth).map((x) => x.id)).toContain('old1');
  });

  it('lida com listas vazias', () => {
    expect(dedupeById([], [])).toEqual([]);
    expect(dedupeById<{ id: string }>()).toEqual([]);
  });
});
