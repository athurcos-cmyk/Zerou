import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMonthlyTransactions, useCompleteCurrentMonth } from './useMonthlyTransactions';

const mocks = vi.hoisted(() => ({ subscribeTransactionsForMonths: vi.fn() }));
// importActual mantém dedupeById real (usado por useCompleteCurrentMonth); só troca a assinatura.
vi.mock('./financeService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./financeService')>()),
  subscribeTransactionsForMonths: mocks.subscribeTransactionsForMonths
}));

describe('useMonthlyTransactions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('carrega as transações dos meses pedidos e destrava o loading', () => {
    const tx = [{ id: 't1' }, { id: 't2' }] as never;
    mocks.subscribeTransactionsForMonths.mockImplementation((_ws, _months, onNext) => {
      onNext(tx);
      return vi.fn();
    });

    const { result } = renderHook(() => useMonthlyTransactions('ws1', ['2026-07']));

    expect(result.current.loading).toBe(false);
    expect(result.current.transactions).toBe(tx);
    expect(mocks.subscribeTransactionsForMonths).toHaveBeenCalledWith(
      'ws1',
      ['2026-07'],
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('sem workspace não assina nada e não fica preso em loading', () => {
    const { result } = renderHook(() => useMonthlyTransactions(undefined, ['2026-07']));
    expect(result.current.loading).toBe(false);
    expect(mocks.subscribeTransactionsForMonths).not.toHaveBeenCalled();
  });

  it('destrava o loading no timeout se o listener nunca responder (offline, cache vazio)', () => {
    mocks.subscribeTransactionsForMonths.mockImplementation(() => vi.fn()); // nunca chama onNext
    const { result } = renderHook(() => useMonthlyTransactions('ws1', ['2026-07']));

    expect(result.current.loading).toBe(true);
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.transactions).toEqual([]);
  });

  it('re-assina quando o conjunto de meses muda (navegar de mês)', () => {
    mocks.subscribeTransactionsForMonths.mockImplementation((_ws, _months, onNext) => {
      onNext([]);
      return vi.fn();
    });

    const { rerender } = renderHook(({ months }) => useMonthlyTransactions('ws1', months), {
      initialProps: { months: ['2026-07'] }
    });
    expect(mocks.subscribeTransactionsForMonths).toHaveBeenCalledTimes(1);

    rerender({ months: ['2026-06', '2026-07'] });
    expect(mocks.subscribeTransactionsForMonths).toHaveBeenCalledTimes(2);
  });

  it('NÃO re-assina se o conjunto é o mesmo, só em outra ordem (evita leitura à toa)', () => {
    mocks.subscribeTransactionsForMonths.mockImplementation((_ws, _months, onNext) => {
      onNext([]);
      return vi.fn();
    });

    const { rerender } = renderHook(({ months }) => useMonthlyTransactions('ws1', months), {
      initialProps: { months: ['2026-07', '2026-06'] }
    });
    expect(mocks.subscribeTransactionsForMonths).toHaveBeenCalledTimes(1);

    rerender({ months: ['2026-06', '2026-07'] }); // mesmo conjunto, ordem trocada
    expect(mocks.subscribeTransactionsForMonths).toHaveBeenCalledTimes(1);
  });
});

describe('useCompleteCurrentMonth (Fase 3: detecção de transbordo)', () => {
  const CURRENT = '2026-07';

  const row = (id: string, month: string) => ({ id, cashMonth: month, competenceMonth: month });
  const windowOf = (n: number, month: string) => Array.from({ length: n }, (_, i) => row(`w${i}`, month));

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('janela < 300: usa as 300 do boot e NÃO carrega nada extra (custo zero)', () => {
    const window299 = windowOf(299, CURRENT);
    const { result } = renderHook(() => useCompleteCurrentMonth('ws1', window299 as never, [CURRENT]));
    expect(result.current).toBe(window299);
    expect(mocks.subscribeTransactionsForMonths).not.toHaveBeenCalled();
  });

  it('janela cheia mas a mais antiga é de mês anterior: NÃO carrega (o mês atual já cabe)', () => {
    const window300 = [...windowOf(299, CURRENT), row('w299', '2026-06')];
    const { result } = renderHook(() => useCompleteCurrentMonth('ws1', window300 as never, [CURRENT]));
    expect(result.current).toBe(window300);
    expect(mocks.subscribeTransactionsForMonths).not.toHaveBeenCalled();
  });

  it('janela cheia E a mais antiga do mês atual (transbordo): carrega o mês e devolve a união', () => {
    const window300 = windowOf(300, CURRENT); // todas do mês atual → transbordou
    mocks.subscribeTransactionsForMonths.mockImplementation((_ws, _months, onNext) => {
      onNext([row('old-extra', CURRENT)] as never);
      return vi.fn();
    });

    const { result } = renderHook(() => useCompleteCurrentMonth('ws1', window300 as never, [CURRENT]));

    expect(mocks.subscribeTransactionsForMonths).toHaveBeenCalledWith('ws1', [CURRENT], expect.any(Function), expect.any(Function));
    expect((result.current as Array<{ id: string }>).some((t) => t.id === 'old-extra')).toBe(true);
    expect(result.current.length).toBe(301);
  });
});
