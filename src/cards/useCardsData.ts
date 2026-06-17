import { useEffect, useMemo, useRef, useState } from 'react';
import { calculateInvoice } from '../domain/invoices/calculateInvoice';
import { subscribeWithTransientRetry } from '../firebase/firestoreRetry';
import { toDate } from '../finance/financeDates';
import {
  subscribeCards,
  subscribeInvoiceLedger,
  subscribeInvoices,
  type LocalCardSynced
} from './cardService';
import type { CreditCard, Invoice, InvoiceLedgerEntry } from '../types/contracts';

interface CardsState {
  cards: Array<LocalCardSynced<CreditCard>>;
  invoices: Array<LocalCardSynced<Invoice>>;
  ledgerEntries: Array<LocalCardSynced<InvoiceLedgerEntry>>;
  loading: boolean;
  error: string | null;
}

const initialState: CardsState = {
  cards: [],
  invoices: [],
  ledgerEntries: [],
  loading: true,
  error: null
};

export function useCardsData(workspaceId?: string) {
  const [state, setState] = useState<CardsState>(initialState);

  // Refs: effects read current data without triggering re-subscription on data-only changes.
  const cardsRef = useRef(state.cards);
  cardsRef.current = state.cards;
  const invoicesRef = useRef(state.invoices);
  invoicesRef.current = state.invoices;

  const cardIds = useMemo(
    () => state.cards.map((c) => c.id).sort().join(','),
    [state.cards]
  );
  const invoiceIds = useMemo(
    () => state.invoices.map((inv) => inv.id).sort().join(','),
    [state.invoices]
  );

  useEffect(() => {
    if (!workspaceId) {
      setState({ ...initialState, loading: false });
      return undefined;
    }

    setState((current) => ({ ...current, loading: true, error: null }));

    return subscribeWithTransientRetry({
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
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !cardIds) {
      setState((current) => ({ ...current, invoices: [], ledgerEntries: [] }));
      return undefined;
    }

    const cards = cardsRef.current;
    const unsubscribers = cards.map((card) =>
      subscribeWithTransientRetry({
        subscribe: (onError) =>
          subscribeInvoices(
            workspaceId,
            card.id,
            (items) =>
              setState((current) => ({
                ...current,
                invoices: [...current.invoices.filter((invoice) => invoice.cardId !== card.id), ...items]
              })),
            onError
          ),
        onError: () => setState((current) => ({ ...current, error: 'Não foi possível carregar faturas.' }))
      })
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [cardIds, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !invoiceIds) {
      setState((current) => ({ ...current, ledgerEntries: [] }));
      return undefined;
    }

    const invoices = invoicesRef.current;
    const unsubscribers = invoices.map((invoice) =>
      subscribeWithTransientRetry({
        subscribe: (onError) =>
          subscribeInvoiceLedger(
            workspaceId,
            invoice.cardId,
            invoice.id,
            (items) =>
              setState((current) => ({
                ...current,
                ledgerEntries: [
                  ...current.ledgerEntries.filter((entry) => entry.invoiceId !== invoice.id || entry.cardId !== invoice.cardId),
                  ...items
                ]
              })),
            onError
          ),
        onError: () => setState((current) => ({ ...current, error: 'Não foi possível carregar o ledger da fatura.' }))
      })
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [invoiceIds, workspaceId]);

  const calculatedInvoices = useMemo(
    () =>
      state.invoices.map((invoice) => {
        const entries = state.ledgerEntries
          .filter((entry) => entry.cardId === invoice.cardId && entry.invoiceId === invoice.id)
          .map((entry) => ({
            id: entry.id,
            type: entry.type,
            amountCents: entry.amountCents,
            effectiveAt: toDate(entry.effectiveAt),
            idempotencyKey: entry.idempotencyKey
          }));
        const calculation = calculateInvoice(entries, invoice.status === 'closed' ? 'closed' : 'open');

        return {
          ...invoice,
          purchasesTotalCents: calculation.purchasesTotalCents,
          paymentsTotalCents: calculation.paymentsTotalCents,
          creditsTotalCents: calculation.creditsTotalCents,
          feesTotalCents: calculation.feesTotalCents,
          outstandingBalanceCents: calculation.outstandingBalanceCents,
          overpaidCreditCents: calculation.overpaidCreditCents,
          status: invoice.status === 'open' || invoice.status === 'closed' ? calculation.status : invoice.status,
          ledgerEntries: state.ledgerEntries.filter((entry) => entry.cardId === invoice.cardId && entry.invoiceId === invoice.id)
        };
      }),
    [state.invoices, state.ledgerEntries]
  );

  const pendingWrites = useMemo(
    () => [...state.cards, ...state.invoices, ...state.ledgerEntries].some((item) => item.localSyncStatus === 'pending'),
    [state.cards, state.invoices, state.ledgerEntries]
  );

  return {
    ...state,
    invoices: calculatedInvoices,
    pendingWrites
  };
}
