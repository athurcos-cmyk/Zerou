import { useEffect, useMemo, useState } from 'react';
import { calculateInvoice } from '../domain/invoices/calculateInvoice';
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

  useEffect(() => {
    if (!workspaceId) {
      setState({ ...initialState, loading: false });
      return undefined;
    }

    setState((current) => ({ ...current, loading: true, error: null }));

    return subscribeCards(
      workspaceId,
      (cards) => setState((current) => ({ ...current, cards, loading: false, error: null })),
      () =>
        setState((current) => ({
          ...current,
          loading: false,
          error: 'Não foi possível carregar os cartões.'
        }))
    );
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || state.cards.length === 0) {
      setState((current) => ({ ...current, invoices: [], ledgerEntries: [] }));
      return undefined;
    }

    const unsubscribers = state.cards.map((card) =>
      subscribeInvoices(
        workspaceId,
        card.id,
        (items) =>
          setState((current) => ({
            ...current,
            invoices: [...current.invoices.filter((invoice) => invoice.cardId !== card.id), ...items]
          })),
        () => setState((current) => ({ ...current, error: 'Não foi possível carregar faturas.' }))
      )
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [state.cards, workspaceId]);

  useEffect(() => {
    if (!workspaceId || state.invoices.length === 0) {
      setState((current) => ({ ...current, ledgerEntries: [] }));
      return undefined;
    }

    const unsubscribers = state.invoices.map((invoice) =>
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
        () => setState((current) => ({ ...current, error: 'Não foi possível carregar o ledger da fatura.' }))
      )
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [state.invoices, workspaceId]);

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
