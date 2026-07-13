import { useEffect, useMemo, useState } from 'react';
import { buildDefaultCategory, defaultCategories } from './defaultCategories';
import { calculateAccountBalances } from './financeCalculations';
import {
  ensureDefaultCategories,
  markOverdueBills,
  subscribeAccounts,
  subscribeBills,
  subscribeCategories,
  subscribeRecurringRules,
  subscribeTransactions,
  type LocalSynced
} from './financeService';
import type { Account, Bill, Category, RecurringRule, Transaction } from '../types/contracts';

const FINANCE_BOOT_RETRY_DELAYS_MS = [600, 1200, 2400, 4000];
const preparedDefaultCategoryWorkspaces = new Set<string>();

interface FinanceDataState {
  accounts: Array<LocalSynced<Account>>;
  categories: Array<LocalSynced<Category>>;
  transactions: Array<LocalSynced<Transaction>>;
  bills: Array<LocalSynced<Bill>>;
  recurringRules: Array<LocalSynced<RecurringRule>>;
  loading: boolean;
  error: string | null;
}

const initialState: FinanceDataState = {
  accounts: [],
  categories: [],
  transactions: [],
  bills: [],
  recurringRules: [],
  loading: true,
  error: null
};

function getErrorCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
}

function canRetryFinanceBoot(error: unknown, attempt: number) {
  return (
    attempt < FINANCE_BOOT_RETRY_DELAYS_MS.length
    && ['permission-denied', 'unavailable', 'deadline-exceeded'].includes(getErrorCode(error))
  );
}

type FinanceSliceKey = keyof Pick<FinanceDataState, 'accounts' | 'categories' | 'transactions' | 'bills' | 'recurringRules'>;

const REQUIRED_SLICES: FinanceSliceKey[] = ['accounts', 'categories', 'transactions', 'bills', 'recurringRules'];

function setSlice<K extends FinanceSliceKey>(
  key: K,
  value: FinanceDataState[K],
  stillLoading: boolean
) {
  return (state: FinanceDataState): FinanceDataState => ({
    ...state,
    [key]: value,
    loading: stillLoading,
    error: null
  });
}

export function useFinanceData(workspaceId?: string, userId?: string) {
  const [state, setState] = useState<FinanceDataState>(initialState);

  useEffect(() => {
    if (!workspaceId) {
      setState({ ...initialState, loading: false });
      return undefined;
    }

    const activeWorkspaceId = workspaceId;
    setState((current) => ({ ...current, loading: true, error: null }));
    let cancelled = false;
    const timers: number[] = [];
    // Só considera o boot concluído quando TODAS as coleções tiverem recebido o
    // primeiro snapshot (mesmo que do cache local) — não a primeira que chegar.
    // Caso contrário, o saldo pode piscar R$ 0,00 se `categories`/`bills` resolverem
    // do cache antes de `accounts`.
    const loadedSlices = new Set<FinanceSliceKey>();

    function markSliceLoaded(key: FinanceSliceKey) {
      loadedSlices.add(key);
      return loadedSlices.size < REQUIRED_SLICES.length;
    }

    const scheduleRetry = (callback: (attempt: number) => void, attempt: number) => {
      const timer = window.setTimeout(() => {
        if (!cancelled) {
          callback(attempt + 1);
        }
      }, FINANCE_BOOT_RETRY_DELAYS_MS[attempt]);
      timers.push(timer);
    };

    function prepareDefaultCategories(attempt = 0) {
      if (!userId || preparedDefaultCategoryWorkspaces.has(activeWorkspaceId)) {
        return;
      }

      ensureDefaultCategories(activeWorkspaceId).then(() => {
        preparedDefaultCategoryWorkspaces.add(activeWorkspaceId);
      }).catch((error) => {
        if (cancelled) {
          return;
        }

        if (canRetryFinanceBoot(error, attempt)) {
          scheduleRetry(prepareDefaultCategories, attempt);
          return;
        }

        setState((current) => ({
          ...current,
          loading: false,
          error: 'Não foi possível preparar as categorias padrão agora.'
        }));
      });
    }

    const onError = () => {
      setState((current) => ({
        ...current,
        loading: false,
        error: 'Não foi possível carregar os dados financeiros deste workspace.'
      }));
    };

    function subscribeWithBootRetry<T>(
      subscribe: (
        workspaceId: string,
        onNext: (items: T[]) => void,
        onError: (error: Error) => void
      ) => () => void,
      onNext: (items: T[]) => void,
      attempt = 0
    ): () => void {
      let unsubscribe: () => void = () => undefined;

      unsubscribe = subscribe(activeWorkspaceId, onNext, (error) => {
        unsubscribe();

        if (cancelled) {
          return;
        }

        if (canRetryFinanceBoot(error, attempt)) {
          setState((current) => ({ ...current, loading: true, error: null }));
          scheduleRetry((nextAttempt) => {
            unsubscribe = subscribeWithBootRetry(subscribe, onNext, nextAttempt);
          }, attempt);
          return;
        }

        onError();
      });

      return () => unsubscribe();
    }

    prepareDefaultCategories();

    const unsubscribers = [
      subscribeWithBootRetry(subscribeAccounts, (items) => setState(setSlice('accounts', items, markSliceLoaded('accounts')))),
      subscribeWithBootRetry(subscribeCategories, (items) => setState(setSlice('categories', items, markSliceLoaded('categories')))),
      subscribeWithBootRetry(subscribeTransactions, (items) => setState(setSlice('transactions', items, markSliceLoaded('transactions')))),
      subscribeWithBootRetry(subscribeBills, (items) => {
        markOverdueBills(activeWorkspaceId, items);
        setState(setSlice('bills', items, markSliceLoaded('bills')));
      }),
      subscribeWithBootRetry(subscribeRecurringRules, (items) => setState(setSlice('recurringRules', items, markSliceLoaded('recurringRules'))))
    ];

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [userId, workspaceId]);

  const categoriesWithDefaults = useMemo(() => {
    if (!workspaceId) {
      return state.categories;
    }

    const existingIds = new Set(state.categories.map((category) => category.id));
    const missingDefaults = defaultCategories
      .filter((category) => !existingIds.has(category.id))
      .map((category) => ({
        ...buildDefaultCategory(workspaceId, category),
        localSyncStatus: 'pending' as const
      }));

    return [...state.categories, ...missingDefaults].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
  }, [state.categories, workspaceId]);

  const activeAccounts = useMemo(() => state.accounts.filter((account) => account.isActive), [state.accounts]);

  const accountBalances = useMemo(
    () => calculateAccountBalances(activeAccounts, state.transactions),
    [activeAccounts, state.transactions]
  );

  const pendingWrites = useMemo(
    () =>
      [...state.accounts, ...state.categories, ...state.transactions, ...state.bills, ...state.recurringRules].some(
        (item) => item.localSyncStatus === 'pending'
      ),
    [state.accounts, state.bills, state.categories, state.recurringRules, state.transactions]
  );

  return {
    ...state,
    accounts: activeAccounts,
    categories: categoriesWithDefaults,
    accountBalances,
    pendingWrites
  };
}
