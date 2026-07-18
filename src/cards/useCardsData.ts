import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveInvoiceStatus } from '../domain/invoices/calculateInvoice';
import { subscribeWithTransientRetry } from '../firebase/firestoreRetry';
import { markClosedInvoices, subscribeCards, subscribeInvoices, type LocalCardSynced } from './cardService';
import type { CreditCard, Invoice } from '../types/contracts';

interface CardsState {
  cards: Array<LocalCardSynced<CreditCard>>;
  invoices: Array<LocalCardSynced<Invoice>>;
  loading: boolean;
  error: string | null;
}

const initialState: CardsState = {
  cards: [],
  invoices: [],
  loading: true,
  error: null
};

/** Quanto esperar pela primeira entrega (sucesso OU erro) da fatura de um cartão antes de
 * considerá-la "resolvida" mesmo sem dado — evita que `loading` fique preso pra sempre
 * offline com uma fatura que nunca foi cacheada. Mesmo padrão de `SLICE_BOOT_TIMEOUT_MS`
 * em `useFinanceData.ts`. */
const INVOICE_BOOT_TIMEOUT_MS = 2500;

export function useCardsData(workspaceId?: string) {
  const [state, setState] = useState<CardsState>(initialState);
  // Quais cartões já tiveram a fatura resolvida (sucesso, erro ou timeout) pelo menos
  // uma vez — usado só pra saber quando `loading` pode virar false, não guarda dado.
  const [loadedInvoiceCardIds, setLoadedInvoiceCardIds] = useState<ReadonlySet<string>>(new Set());

  // `deleteCard` é soft-delete (isActive: false) — o listener continua trazendo o doc.
  // Filtrar aqui, e não em cada tela, garante que um cartão excluído suma da lista E
  // pare de comprometer saldo/limite: as faturas dele nunca chegam ao Dashboard porque
  // o effect abaixo só assina faturas dos cartões ativos.
  const activeCards = useMemo(() => state.cards.filter((card) => card.isActive !== false), [state.cards]);

  // Refs: effects read current data without triggering re-subscription on data-only changes.
  const cardsRef = useRef(activeCards);
  cardsRef.current = activeCards;

  const cardIds = useMemo(
    () => activeCards.map((c) => c.id).sort().join(','),
    [activeCards]
  );

  useEffect(() => {
    if (!workspaceId) {
      setState({ ...initialState, loading: false });
      return undefined;
    }

    setState((current) => ({ ...current, loading: true, error: null }));

    const bootTimer = window.setTimeout(() => {
      setState((current) => current.loading ? { ...current, loading: false } : current);
    }, 2500);

    const unsub = subscribeWithTransientRetry({
      subscribe: (onError) =>
        subscribeCards(
          workspaceId,
          (cards) => setState((current) => ({ ...current, cards, loading: false, error: null })),
          onError
        ),
      onRetrying: () => setState((current) => ({ ...current, loading: true, error: null })),
      onError: () =>
        setState((current) => ({
          ...current,
          loading: false,
          error: 'Não foi possível carregar os cartões.'
        }))
    });

    return () => {
      window.clearTimeout(bootTimer);
      unsub();
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !cardIds) {
      setState((current) => ({ ...current, invoices: [] }));
      return undefined;
    }

    const cards = cardsRef.current;
    const timers: number[] = [];

    function markInvoiceLoaded(cardId: string) {
      setLoadedInvoiceCardIds((current) => (current.has(cardId) ? current : new Set(current).add(cardId)));
    }

    const unsubscribers = cards.map((card) => {
      let resolved = false;
      const bootTimer = window.setTimeout(() => {
        resolved = true;
        markInvoiceLoaded(card.id);
      }, INVOICE_BOOT_TIMEOUT_MS);
      timers.push(bootTimer);

      return subscribeWithTransientRetry({
        subscribe: (onError) =>
          subscribeInvoices(
            workspaceId,
            card.id,
            (items) => {
              resolved = true;
              window.clearTimeout(bootTimer);
              markInvoiceLoaded(card.id);
              markClosedInvoices(workspaceId, items, card.closingDay);
              setState((current) => ({
                ...current,
                invoices: [...current.invoices.filter((invoice) => invoice.cardId !== card.id), ...items]
              }));
            },
            onError
          ),
        onError: () => {
          if (!resolved) {
            resolved = true;
            window.clearTimeout(bootTimer);
            markInvoiceLoaded(card.id);
          }
          setState((current) => ({ ...current, error: 'Não foi possível carregar faturas.' }));
        }
      });
    });

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [cardIds, workspaceId]);

  // "Comprometido"/"Disponível" no Dashboard descontam o saldo das faturas — reportar
  // loading=false antes delas chegarem mostraria um valor inflado por um instante
  // (a fatura ainda não foi subtraída) até a fatura chegar e corrigir, um "piscar"
  // visível pro usuário. Só considera resolvido quando toda conta ativa já tiver
  // resposta (sucesso, erro ou timeout) da própria fatura.
  const invoicesLoading = activeCards.some((card) => !loadedInvoiceCardIds.has(card.id));

  const calculatedInvoices = useMemo(() => {
    // Faturas de um cartão que acabou de ser excluído continuam em `state.invoices`
    // (o effect desassina o listener, mas não limpa o que já chegou) — sem este filtro
    // elas seguiriam contando no "Comprometido" do Dashboard.
    const activeCardIds = new Set(activeCards.map((card) => card.id));

    return state.invoices.filter((invoice) => activeCardIds.has(invoice.cardId)).map((invoice) => {
      // Totais (purchasesTotalCents, outstandingBalanceCents, etc.) já vêm certos do
      // documento — mantidos incrementalmente por invoiceLedgerEntryTrigger.ts. Só o status
      // fino ('paid'/'partial'/'overdue'/'overpaid') continua calculado no client, porque
      // nunca foi persistido — ver comentário em invoiceLedgerEntryTrigger.ts.
      const lifecycle = invoice.status === 'open' ? 'open' : 'closed';
      const status = resolveInvoiceStatus({
        lifecycle,
        outstandingBalanceCents: invoice.outstandingBalanceCents ?? 0,
        overpaidCreditCents: invoice.overpaidCreditCents ?? 0,
        paymentsTotalCents: invoice.paymentsTotalCents ?? 0,
        purchasesTotalCents: invoice.purchasesTotalCents ?? 0,
        feesTotalCents: invoice.feesTotalCents ?? 0,
        dueDate: invoice.dueDate?.toDate()
      });

      return { ...invoice, status };
    });
  }, [state.invoices, activeCards]);

  const pendingWrites = useMemo(
    () => [...state.cards, ...state.invoices].some((item) => item.localSyncStatus === 'pending'),
    [state.cards, state.invoices]
  );

  return {
    ...state,
    cards: activeCards,
    invoices: calculatedInvoices,
    loading: state.loading || invoicesLoading,
    pendingWrites
  };
}
