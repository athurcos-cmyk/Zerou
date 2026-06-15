import { useEffect, useMemo, useState } from 'react';
import { buildDefaultCategory, defaultCategories } from './defaultCategories';
import { calculateAccountBalances, calculateDashboardSummary } from './financeCalculations';
import {
  ensureDefaultCategories,
  subscribeAccounts,
  subscribeBills,
  subscribeCategories,
  subscribeRecurringRules,
  subscribeTransactions,
  type LocalSynced
} from './financeService';
import type { Account, Bill, Category, RecurringRule, Transaction } from '../types/contracts';

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

function setSlice<K extends keyof Pick<FinanceDataState, 'accounts' | 'categories' | 'transactions' | 'bills' | 'recurringRules'>>(
  key: K,
  value: FinanceDataState[K]
) {
  return (state: FinanceDataState): FinanceDataState => ({
    ...state,
    [key]: value,
    loading: false,
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

    setState((current) => ({ ...current, loading: true, error: null }));

    if (userId) {
      ensureDefaultCategories(workspaceId).catch(() => {
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

    const unsubscribers = [
      subscribeAccounts(workspaceId, (items) => setState(setSlice('accounts', items)), onError),
      subscribeCategories(workspaceId, (items) => setState(setSlice('categories', items)), onError),
      subscribeTransactions(workspaceId, (items) => setState(setSlice('transactions', items)), onError),
      subscribeBills(workspaceId, (items) => setState(setSlice('bills', items)), onError),
      subscribeRecurringRules(workspaceId, (items) => setState(setSlice('recurringRules', items)), onError)
    ];

    return () => {
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

  const dashboard = useMemo(
    () =>
      calculateDashboardSummary({
        accounts: activeAccounts,
        transactions: state.transactions,
        bills: state.bills,
        recurringRules: state.recurringRules
      }),
    [activeAccounts, state.bills, state.recurringRules, state.transactions]
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
    dashboard,
    pendingWrites
  };
}
