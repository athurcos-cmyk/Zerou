import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMonthlyTransactions } from './useMonthlyTransactions';

const mocks = vi.hoisted(() => ({ subscribeTransactionsForMonths: vi.fn() }));
vi.mock('./financeService', () => mocks);

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
