import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFinanceData } from './useFinanceData';

const financeMocks = vi.hoisted(() => ({
  ensureDefaultCategories: vi.fn(),
  subscribeAccounts: vi.fn(),
  subscribeBills: vi.fn(),
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
