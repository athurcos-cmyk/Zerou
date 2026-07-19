import { useEffect, useMemo, useState } from 'react';
import { subscribeWithTransientRetry } from '../firebase/firestoreRetry';
import { dedupeById, subscribeTransactionsForMonths, type LocalSynced } from './financeService';
import type { Transaction } from '../types/contracts';

// Se as queries por mês não responderem em 2.5s (cache vazio + offline), destrava o loading
// com o que tiver — mesmo padrão de `SLICE_BOOT_TIMEOUT_MS`/`INVOICE_BOOT_TIMEOUT_MS`.
const MONTHLY_BOOT_TIMEOUT_MS = 2500;

interface MonthlyTransactionsState {
  transactions: Array<LocalSynced<Transaction>>;
  loading: boolean;
  error: string | null;
}

const initialState: MonthlyTransactionsState = { transactions: [], loading: true, error: null };

/**
 * Carrega as transações de um conjunto de meses, sob demanda (a Análise, não o boot). Segue o
 * padrão dos outros hooks de dados: `subscribeWithTransientRetry` + `markLoaded()` (proteção
 * anti-"piscar"/erro transitório) e boot timeout pra destravar offline. Quem consome deve unir
 * isto com as 300 do boot (`finance.transactions`) — assim a tela nunca aparece vazia durante o
 * carregamento e só refina do parcial pro completo.
 */
export function useMonthlyTransactions(workspaceId: string | undefined, monthKeys: string[]) {
  const [state, setState] = useState<MonthlyTransactionsState>(initialState);
  // Chave estável: só re-assina quando o CONJUNTO de meses muda, não a cada render.
  const monthsKey = useMemo(() => [...monthKeys].sort().join(','), [monthKeys]);

  useEffect(() => {
    if (!workspaceId || !monthsKey) {
      setState({ transactions: [], loading: false, error: null });
      return undefined;
    }

    const months = monthsKey.split(',');
    setState((current) => ({ ...current, loading: true, error: null }));

    let cancelled = false;
    const bootTimer = window.setTimeout(() => {
      setState((current) => (current.loading ? { ...current, loading: false } : current));
    }, MONTHLY_BOOT_TIMEOUT_MS);

    const unsubscribe = subscribeWithTransientRetry({
      subscribe: (onError, markLoaded) =>
        subscribeTransactionsForMonths(
          workspaceId,
          months,
          (items) => {
            markLoaded();
            if (!cancelled) setState({ transactions: items, loading: false, error: null });
          },
          onError
        ),
      onRetrying: () => setState((current) => ({ ...current, loading: true, error: null })),
      onError: () =>
        setState((current) => ({
          ...current,
          loading: false,
          error: 'Não foi possível carregar o histórico deste período.'
        }))
    });

    return () => {
      cancelled = true;
      window.clearTimeout(bootTimer);
      unsubscribe();
    };
  }, [workspaceId, monthsKey]);

  return state;
}

/**
 * Fonte de transações pro gasto do MÊS ATUAL garantindo o mês completo mesmo quando a janela de
 * 300 do boot transbordou (>300 lançamentos no mês corrente). Detecção barata: só carrega sob
 * demanda se a janela está CHEIA (300) E a mais antiga carregada é do mês atual (`months[0]`) —
 * senão as 300 já cobrem o mês e é ZERO leitura extra (o caso de todo mundo hoje). `months` são
 * os meses a garantir completos (ex.: [mês atual, mês anterior] pro Dashboard). Fase 3 do plano
 * `docs/planning/HISTORICO_TRANSACOES.md`.
 */
export function useCompleteCurrentMonth(
  workspaceId: string | undefined,
  windowTransactions: Array<LocalSynced<Transaction>>,
  months: string[]
): Array<LocalSynced<Transaction>> {
  const currentMonth = months[0];
  // `windowTransactions` vem ordenado por data desc (`subscribeTransactions`), então o último é
  // o mais antigo carregado. Janela cheia (300) + mais antigo no mês atual = o mês transbordou.
  const oldest = windowTransactions[windowTransactions.length - 1];
  const overflowed =
    windowTransactions.length >= 300 &&
    !!oldest &&
    !!currentMonth &&
    (oldest.cashMonth === currentMonth || oldest.competenceMonth === currentMonth);

  const monthsKey = months.join(',');
  const monthsToLoad = useMemo(() => (overflowed ? monthsKey.split(',') : []), [overflowed, monthsKey]);
  const loaded = useMonthlyTransactions(overflowed ? workspaceId : undefined, monthsToLoad);

  return useMemo(
    () => (overflowed ? dedupeById(windowTransactions, loaded.transactions) : windowTransactions),
    [overflowed, windowTransactions, loaded.transactions]
  );
}
