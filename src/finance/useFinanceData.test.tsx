import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFinanceData } from './useFinanceData';

const financeMocks = vi.hoisted(() => ({
  ensureDefaultCategories: vi.fn(),
  markOverdueBills: vi.fn(),
  markOverdueReceivables: vi.fn(),
  subscribeAccounts: vi.fn(),
  subscribeBills: vi.fn(),
  subscribeReceivables: vi.fn(),
  subscribeBudgets: vi.fn(),
  subscribeCategories: vi.fn(),
  subscribeRecurringRules: vi.fn(),
  subscribeTransactions: vi.fn()
}));

vi.mock('./financeService', () => financeMocks);

function firestoreError(code: string) {
  return Object.assign(new Error(code), { code });
}

describe('useFinanceData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    financeMocks.ensureDefaultCategories.mockResolvedValue(undefined);

    financeMocks.subscribeAccounts.mockImplementation((_workspaceId, onNext, onError) => {
      if (financeMocks.subscribeAccounts.mock.calls.length === 1) {
        onError(firestoreError('permission-denied'));
      } else {
        onNext([]);
      }
      return vi.fn();
    });

    for (const subscribe of [
      financeMocks.subscribeBills,
      financeMocks.subscribeReceivables,
      financeMocks.subscribeBudgets,
      financeMocks.subscribeCategories,
      financeMocks.subscribeRecurringRules,
      financeMocks.subscribeTransactions
    ]) {
      subscribe.mockImplementation((_workspaceId, onNext) => {
        onNext([]);
        return vi.fn();
      });
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('retries protected financial reads while a new workspace foundation is settling', () => {
    const { result } = renderHook(() => useFinanceData('personal_user-1', 'user-1'));

    expect(financeMocks.subscribeAccounts).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(financeMocks.subscribeAccounts).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  // Regressão: `ensurePersonalFoundation` (onboarding) libera a UI depois de só 700ms em
  // rede fraca, então o member doc podia demorar mais que o backoff rápido (~8.2s) pra
  // aparecer no servidor. Sem retry sustentado, esgotar esse backoff deixava o Dashboard
  // preso na mensagem de erro pra sempre — só um reload manual resolvia.
  it('self-heals after the fast backoff window is exhausted, instead of failing forever', () => {
    const FAST_BACKOFF_ATTEMPTS = 5; // 4 delays (600/1200/2400/4000) entre 5 tentativas

    financeMocks.subscribeAccounts.mockImplementation((_workspaceId, onNext, onError) => {
      if (financeMocks.subscribeAccounts.mock.calls.length <= FAST_BACKOFF_ATTEMPTS) {
        onError(firestoreError('permission-denied'));
      } else {
        onNext([]);
      }
      return vi.fn();
    });

    const { result } = renderHook(() => useFinanceData('personal_user-3', 'user-1'));

    act(() => {
      vi.advanceTimersByTime(600 + 1200 + 2400 + 4000);
    });

    expect(financeMocks.subscribeAccounts).toHaveBeenCalledTimes(FAST_BACKOFF_ATTEMPTS);
    expect(result.current.error).toBe('Não foi possível carregar os dados financeiros deste workspace.');

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(financeMocks.subscribeAccounts).toHaveBeenCalledTimes(FAST_BACKOFF_ATTEMPTS + 1);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('prepares default categories once per workspace session', async () => {
    const { rerender, unmount } = renderHook(
      ({ workspaceId }) => useFinanceData(workspaceId, 'user-1'),
      { initialProps: { workspaceId: 'personal_user-2' } }
    );

    await act(async () => undefined);

    expect(financeMocks.ensureDefaultCategories).toHaveBeenCalledTimes(1);

    rerender({ workspaceId: 'personal_user-2' });
    await act(async () => undefined);

    expect(financeMocks.ensureDefaultCategories).toHaveBeenCalledTimes(1);

    unmount();
    renderHook(() => useFinanceData('personal_user-2', 'user-1'));
    await act(async () => undefined);

    expect(financeMocks.ensureDefaultCategories).toHaveBeenCalledTimes(1);
  });
});
