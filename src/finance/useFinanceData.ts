import { useEffect, useMemo, useState } from 'react';
import { buildDefaultCategory, defaultCategories } from './defaultCategories';
import { currentAccountBalances } from './financeCalculations';
import {
  ensureDefaultCategories,
  markOverdueBills,
  subscribeAccounts,
  subscribeBills,
  subscribeBudgets,
  subscribeCategories,
  subscribeRecurringRules,
  subscribeTransactions,
  type LocalSynced
} from './financeService';
import type { Account, Bill, Budget, Category, RecurringRule, Transaction } from '../types/contracts';

const FINANCE_BOOT_RETRY_DELAYS_MS = [600, 1200, 2400, 4000];
// Se um listener onSnapshot não disparar em 2.5s (cache vazio + offline), assume []
// para destravar o loading. Quando a rede voltar, o listener entrega os dados reais.
const SLICE_BOOT_TIMEOUT_MS = 2500;
// Persistido (não só em memória) pra não repetir esse getDocs a cada refresh do app —
// era a causa de um banner de erro assustador aparecendo à toa em rede instável logo
// após o refresh, mesmo com as categorias padrão já existindo há muito tempo.
const PREPARED_DEFAULT_CATEGORIES_KEY = 'zerou.defaultCategoriesPrepared';

function readPreparedDefaultCategoryWorkspaces(): Set<string> {
  try {
    const raw = window.localStorage.getItem(PREPARED_DEFAULT_CATEGORIES_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

const preparedDefaultCategoryWorkspaces = readPreparedDefaultCategoryWorkspaces();

function markDefaultCategoriesPrepared(workspaceId: string) {
  preparedDefaultCategoryWorkspaces.add(workspaceId);
  try {
    window.localStorage.setItem(PREPARED_DEFAULT_CATEGORIES_KEY, JSON.stringify([...preparedDefaultCategoryWorkspaces]));
  } catch {
    // Sem localStorage (aba privada bloqueada): só perde a memória entre sessões.
  }
}

/**
 * O que o app sabe sobre as transações a partir da janela de `subscribeTransactions`
 * (as 300 mais recentes). `knownIds` é o que essa janela cobre; tudo fora dela precisa ser
 * consultado antes de o ledger de fatura poder ser filtrado com segurança (ver `useInvoiceLedger`).
 */
export interface TransactionDeletionIndex {
  knownIds: ReadonlySet<string>;
  deletedIds: ReadonlySet<string>;
}

interface FinanceDataState {
  accounts: Array<LocalSynced<Account>>;
  categories: Array<LocalSynced<Category>>;
  transactions: Array<LocalSynced<Transaction>>;
  bills: Array<LocalSynced<Bill>>;
  recurringRules: Array<LocalSynced<RecurringRule>>;
  budgets: Array<LocalSynced<Budget>>;
  loading: boolean;
  error: string | null;
}

const initialState: FinanceDataState = {
  accounts: [],
  categories: [],
  transactions: [],
  bills: [],
  recurringRules: [],
  budgets: [],
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

type FinanceSliceKey = keyof Pick<FinanceDataState, 'accounts' | 'categories' | 'transactions' | 'bills' | 'recurringRules' | 'budgets'>;

const REQUIRED_SLICES: FinanceSliceKey[] = ['accounts', 'categories', 'transactions', 'bills', 'recurringRules', 'budgets'];

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

    // Backfill não-crítico: `categoriesWithDefaults` (abaixo) já mostra as categorias
    // padrão na hora via merge local, mesmo que esta escrita nunca chegue a acontecer —
    // então uma falha aqui nunca deve virar erro pro usuário (mesma filosofia do
    // fireWrite: silencioso em produção, visível só no console em dev).
    function prepareDefaultCategories(attempt = 0) {
      if (!userId || preparedDefaultCategoryWorkspaces.has(activeWorkspaceId)) {
        return;
      }

      ensureDefaultCategories(activeWorkspaceId).then(() => {
        markDefaultCategoriesPrepared(activeWorkspaceId);
      }).catch((error) => {
        if (cancelled) {
          return;
        }

        if (canRetryFinanceBoot(error, attempt)) {
          scheduleRetry(prepareDefaultCategories, attempt);
          return;
        }

        if (import.meta.env.DEV) {
          console.error('[prepareDefaultCategories] falhou apos todas as tentativas', error);
        }
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
      let resolved = false;

      const wrappedOnNext = (items: T[]) => {
        resolved = true;
        onNext(items);
      };

      const bootTimeout = window.setTimeout(() => {
        if (cancelled || resolved) return;
        resolved = true;
        onNext([]);
      }, SLICE_BOOT_TIMEOUT_MS);
      timers.push(bootTimeout);

      unsubscribe = subscribe(activeWorkspaceId, wrappedOnNext, (error) => {
        if (cancelled) return;

        const code = getErrorCode(error);

        // unavailable = offline ou rede flaky. O SDK do Firestore ja retenta
        // automaticamente quando a conexao voltar. Se ja temos dados do cache
        // (ou o boot timeout ja entregou []), nao fazemos nada — o erro eh
        // esperado e os dados continuam aparecendo. Se ainda nao recebemos nada,
        // o boot timeout corre em paralelo e resolve com [] em 2.5s.
        // Nunca matamos o listener — o SDK cuida do reconnect.
        if (code === 'unavailable') return;

        // Erro real (permission-denied, deadline-exceeded sem ser offline):
        // so eh fatal se o listener nunca entregou dados.
        window.clearTimeout(bootTimeout);

        if (resolved) return;

        unsubscribe();

        if (canRetryFinanceBoot(error, attempt)) {
          setState((current) => ({ ...current, loading: true, error: null }));
          scheduleRetry((nextAttempt) => {
            unsubscribe = subscribeWithBootRetry(subscribe, onNext, nextAttempt);
          }, attempt);
          return;
        }

        onError();
      });

      return () => {
        window.clearTimeout(bootTimeout);
        unsubscribe();
      };
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
      subscribeWithBootRetry(subscribeRecurringRules, (items) => setState(setSlice('recurringRules', items, markSliceLoaded('recurringRules')))),
      subscribeWithBootRetry(subscribeBudgets, (items) => setState(setSlice('budgets', items, markSliceLoaded('budgets'))))
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
    () => currentAccountBalances(activeAccounts),
    [activeAccounts]
  );

  const pendingWrites = useMemo(
    () =>
      [...state.accounts, ...state.categories, ...state.transactions, ...state.bills, ...state.recurringRules, ...state.budgets].some(
        (item) => item.localSyncStatus === 'pending'
      ),
    [state.accounts, state.bills, state.budgets, state.categories, state.recurringRules, state.transactions]
  );

  // Transações excluídas no Extrato (soft delete) precisam propagar pro cálculo da fatura:
  // uma compra no cartão excluída deve parar de contar no saldo/lista da fatura. `knownIds`
  // vai junto porque `subscribeTransactions` só traz as 300 mais recentes — quem consome isso
  // (`useInvoiceLedger`) precisa saber o que essa janela NÃO cobre pra ir buscar no servidor.
  const transactionIndex = useMemo<TransactionDeletionIndex>(
    () => ({
      knownIds: new Set(state.transactions.map((t) => t.id)),
      deletedIds: new Set(state.transactions.filter((t) => t.deletedAt).map((t) => t.id))
    }),
    [state.transactions]
  );

  return {
    ...state,
    accounts: activeAccounts,
    categories: categoriesWithDefaults,
    accountBalances,
    transactionIndex,
    pendingWrites
  };
}
