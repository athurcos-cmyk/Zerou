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

export function useCardsData(workspaceId?: string) {
  const [state, setState] = useState<CardsState>(initialState);

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
    const unsubscribers = cards.map((card) =>
      subscribeWithTransientRetry({
        subscribe: (onError) =>
          subscribeInvoices(
            workspaceId,
            card.id,
            (items) => {
              markClosedInvoices(workspaceId, items, card.closingDay);
              setState((current) => ({
                ...current,
                invoices: [...current.invoices.filter((invoice) => invoice.cardId !== card.id), ...items]
              }));
            },
            onError
          ),
        onError: () => setState((current) => ({ ...current, error: 'Não foi possível carregar faturas.' }))
      })
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [cardIds, workspaceId]);

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
    pendingWrites
  };
}
