import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useInvoiceLedger, type InvoiceLedgerRef } from './useInvoiceLedger';
import type { TransactionDeletionIndex } from '../finance/useFinanceData';

const cardMocks = vi.hoisted(() => ({
  subscribeInvoiceLedger: vi.fn(),
  fetchDeletedTransactionIds: vi.fn()
}));

vi.mock('./cardService', () => cardMocks);

/** A janela de `subscribeTransactions` conhece `knownIds`; `deletedIds` é o subset excluído. */
function index(deletedIds: string[] = [], knownIds: string[] = ['txn-1', 'txn-2']): TransactionDeletionIndex {
  return { knownIds: new Set(knownIds), deletedIds: new Set(deletedIds) };
}

function ledgerEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'entry-1',
    invoiceId: 'invoice-1',
    cardId: 'card-1',
    workspaceId: 'ws-1',
    type: 'purchase',
    amountCents: 5000,
    effectiveAt: new Date('2026-07-01'),
    idempotencyKey: 'txn-1_purchase_1',
    sourceTransactionId: 'txn-1',
    createdBy: 'user-1',
    localSyncStatus: 'synced',
    ...overrides
  };
}

const oneInvoice: InvoiceLedgerRef[] = [{ id: 'invoice-1', cardId: 'card-1' }];
const twoInvoices: InvoiceLedgerRef[] = [
  { id: 'invoice-1', cardId: 'card-1' },
  { id: 'invoice-2', cardId: 'card-1' }
];

describe('useInvoiceLedger', () => {
  beforeEach(() => {
    cardMocks.fetchDeletedTransactionIds.mockReset();
    cardMocks.fetchDeletedTransactionIds.mockResolvedValue([]);
  });

  // Regressão: excluir uma compra no cartão pelo Extrato (softDeleteTransaction marca
  // deletedAt, mas as regras do Firestore não deixam apagar o ledger da fatura) não
  // pode deixar o valor "preso" na fatura pra sempre.
  it('excludes ledger entries whose source transaction was soft-deleted', () => {
    cardMocks.subscribeInvoiceLedger.mockImplementation((_workspaceId, _cardId, _invoiceId, onNext) => {
      onNext([
        ledgerEntry(),
        ledgerEntry({ id: 'entry-2', type: 'payment', sourceTransactionId: 'txn-2', amountCents: 2000 })
      ]);
      return vi.fn();
    });

    const { result, rerender } = renderHook(
      ({ transactionIndex }: { transactionIndex: TransactionDeletionIndex }) =>
        useInvoiceLedger('ws-1', oneInvoice, transactionIndex),
      { initialProps: { transactionIndex: index() } }
    );

    expect(result.current.map((e) => e.id)).toEqual(['entry-1', 'entry-2']);

    rerender({ transactionIndex: index(['txn-1']) });

    expect(result.current.map((e) => e.id)).toEqual(['entry-2']);
  });

  // Regressão: antecipar uma parcela futura (InvoicePage) cria um débito
  // 'installment_anticipation' na fatura atual E um crédito 'installment_anticipation_credit'
  // na fatura futura, os dois com o `sourceTransactionId` da compra original — excluir a
  // compra original depois de antecipada precisa limpar os DOIS lados, não só o crédito.
  it('excludes an installment_anticipation debit tied to a deleted transaction, not just its credit counterpart', () => {
    cardMocks.subscribeInvoiceLedger.mockImplementation((_workspaceId, _cardId, invoiceId, onNext) => {
      if (invoiceId === 'invoice-1') {
        onNext([ledgerEntry({ id: 'debit-1', type: 'installment_anticipation', invoiceId: 'invoice-1', amountCents: 5000 })]);
      } else {
        onNext([
          ledgerEntry({ id: 'credit-1', type: 'installment_anticipation_credit', invoiceId: 'invoice-2', amountCents: 5000 })
        ]);
      }
      return vi.fn();
    });

    const { result, rerender } = renderHook(
      ({ transactionIndex }: { transactionIndex: TransactionDeletionIndex }) =>
        useInvoiceLedger('ws-1', twoInvoices, transactionIndex),
      { initialProps: { transactionIndex: index() } }
    );

    expect(result.current.find((e) => e.id === 'debit-1')).toBeDefined();

    rerender({ transactionIndex: index(['txn-1']) });

    expect(result.current.find((e) => e.id === 'debit-1')).toBeUndefined();
    expect(result.current.find((e) => e.id === 'credit-1')).toBeUndefined();
  });

  describe('compra excluída fora da janela de `subscribeTransactions` (limit 300)', () => {
    beforeEach(() => {
      cardMocks.subscribeInvoiceLedger.mockImplementation((_workspaceId, _cardId, _invoiceId, onNext) => {
        // A compra que gerou este lançamento é antiga: saiu das 300 transações mais
        // recentes, então `knownIds` não a contém.
        onNext([ledgerEntry({ id: 'entry-antiga', sourceTransactionId: 'txn-antiga', amountCents: 5000 })]);
        return vi.fn();
      });
    });

    // Regressão: `deletedIds` só enxerga a janela de 300 transações. Uma compra no cartão
    // excluída que saia dessa janela sumia do conjunto, e o valor dela VOLTAVA a somar na
    // fatura — que podia até deixar de estar paga. As faturas cobrem 24 ciclos, então uma
    // parcela de 2 anos atrás continua relevante muito depois de a compra sair da janela.
    it('busca o estado da transação no servidor e remove o lançamento se ela foi excluída', async () => {
      cardMocks.fetchDeletedTransactionIds.mockResolvedValue(['txn-antiga']);

      const { result } = renderHook(() => useInvoiceLedger('ws-1', oneInvoice, index([], ['txn-recente'])));

      expect(result.current.map((e) => e.id)).toEqual(['entry-antiga']);

      await waitFor(() => expect(result.current.map((e) => e.id)).toEqual([]));
      expect(cardMocks.fetchDeletedTransactionIds).toHaveBeenCalledWith('ws-1', ['txn-antiga']);
    });

    // O lado seguro: se a consulta não confirma a exclusão, o lançamento fica. Sumir com
    // ele apagaria uma dívida real da fatura.
    it('mantém o lançamento quando a transação fora da janela não está excluída', async () => {
      cardMocks.fetchDeletedTransactionIds.mockResolvedValue([]);

      const { result } = renderHook(() => useInvoiceLedger('ws-1', oneInvoice, index([], ['txn-recente'])));

      await waitFor(() => expect(cardMocks.fetchDeletedTransactionIds).toHaveBeenCalled());
      expect(result.current.map((e) => e.id)).toEqual(['entry-antiga']);
    });

    it('mantém o lançamento quando a consulta falha (offline sem cache)', async () => {
      cardMocks.fetchDeletedTransactionIds.mockRejectedValue(new Error('offline'));

      const { result } = renderHook(() => useInvoiceLedger('ws-1', oneInvoice, index([], ['txn-recente'])));

      await waitFor(() => expect(cardMocks.fetchDeletedTransactionIds).toHaveBeenCalled());
      expect(result.current.map((e) => e.id)).toEqual(['entry-antiga']);
    });

    it('não reconsulta a mesma transação a cada snapshot de ledger', async () => {
      cardMocks.fetchDeletedTransactionIds.mockResolvedValue([]);

      const { rerender } = renderHook(
        ({ transactionIndex }: { transactionIndex: TransactionDeletionIndex }) =>
          useInvoiceLedger('ws-1', oneInvoice, transactionIndex),
        { initialProps: { transactionIndex: index([], ['txn-recente']) } }
      );

      await waitFor(() => expect(cardMocks.fetchDeletedTransactionIds).toHaveBeenCalledTimes(1));
      rerender({ transactionIndex: index([], ['txn-recente']) });
      await waitFor(() => expect(cardMocks.fetchDeletedTransactionIds).toHaveBeenCalledTimes(1));
    });

    it('não consulta nada quando a janela já cobre a transação', async () => {
      const { result } = renderHook(() => useInvoiceLedger('ws-1', oneInvoice, index([], ['txn-antiga'])));

      await waitFor(() => expect(result.current.map((e) => e.id)).toEqual(['entry-antiga']));
      expect(cardMocks.fetchDeletedTransactionIds).not.toHaveBeenCalled();
    });
  });
});
