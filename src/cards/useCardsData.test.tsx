import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useCardsData, type TransactionDeletionIndex } from './useCardsData';

const cardMocks = vi.hoisted(() => ({
  subscribeCards: vi.fn(),
  subscribeInvoices: vi.fn(),
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

describe('useCardsData', () => {
  beforeEach(() => {
    cardMocks.fetchDeletedTransactionIds.mockReset();
    cardMocks.fetchDeletedTransactionIds.mockResolvedValue([]);
    cardMocks.subscribeCards.mockImplementation((_workspaceId, onNext) => {
      onNext([{ id: 'card-1', workspaceId: 'ws-1', name: 'Cartão', isActive: true, localSyncStatus: 'synced' }]);
      return vi.fn();
    });
    cardMocks.subscribeInvoices.mockImplementation((_workspaceId, _cardId, onNext) => {
      onNext([
        {
          id: 'invoice-1',
          cardId: 'card-1',
          workspaceId: 'ws-1',
          referenceMonth: '2026-07',
          status: 'open',
          localSyncStatus: 'synced'
        }
      ]);
      return vi.fn();
    });
  });

  // Regressão: excluir uma compra no cartão pelo Extrato (softDeleteTransaction marca
  // deletedAt, mas as regras do Firestore não deixam apagar o ledger da fatura) não
  // pode deixar o valor "preso" na fatura pra sempre.
  it('excludes ledger entries whose source transaction was soft-deleted from invoice totals and lists', () => {
    cardMocks.subscribeInvoiceLedger.mockImplementation((_workspaceId, _cardId, _invoiceId, onNext) => {
      onNext([
        ledgerEntry(),
        ledgerEntry({ id: 'entry-2', type: 'payment', sourceTransactionId: 'txn-2', amountCents: 2000 })
      ]);
      return vi.fn();
    });

    const { result, rerender } = renderHook(
      ({ transactionIndex }: { transactionIndex: TransactionDeletionIndex }) => useCardsData('ws-1', transactionIndex),
      { initialProps: { transactionIndex: index() } }
    );

    const beforeInvoice = result.current.invoices.find((inv) => inv.id === 'invoice-1');
    expect(beforeInvoice?.purchasesTotalCents).toBe(5000);
    expect(beforeInvoice?.ledgerEntries.map((e) => e.id)).toEqual(['entry-1', 'entry-2']);

    rerender({ transactionIndex: index(['txn-1']) });

    const afterInvoice = result.current.invoices.find((inv) => inv.id === 'invoice-1');
    expect(afterInvoice?.purchasesTotalCents).toBe(0);
    expect(afterInvoice?.ledgerEntries.map((e) => e.id)).toEqual(['entry-2']);
  });

  // Regressão: antecipar uma parcela futura (InvoicePage) cria um débito
  // 'installment_anticipation' na fatura atual E um crédito 'installment_anticipation_credit'
  // na fatura futura, os dois com o `sourceTransactionId` da compra original (cardService.ts
  // deixou de somar tudo num único débito sem esse vínculo — antes disso, excluir a compra
  // original depois de antecipada deixava o débito "fantasma" preso na fatura atual, mesmo
  // com o crédito da fatura futura sendo limpo corretamente).
  it('excludes an installment_anticipation debit tied to a deleted transaction, not just its credit counterpart', () => {
    cardMocks.subscribeInvoices.mockImplementation((_workspaceId, _cardId, onNext) => {
      onNext([
        { id: 'invoice-1', cardId: 'card-1', workspaceId: 'ws-1', referenceMonth: '2026-07', status: 'open', localSyncStatus: 'synced' },
        { id: 'invoice-2', cardId: 'card-1', workspaceId: 'ws-1', referenceMonth: '2026-08', status: 'open', localSyncStatus: 'synced' }
      ]);
      return vi.fn();
    });
    cardMocks.subscribeInvoiceLedger.mockImplementation((_workspaceId, _cardId, invoiceId, onNext) => {
      if (invoiceId === 'invoice-1') {
        onNext([
          ledgerEntry({ id: 'debit-1', type: 'installment_anticipation', invoiceId: 'invoice-1', amountCents: 5000 })
        ]);
      } else {
        onNext([
          ledgerEntry({ id: 'credit-1', type: 'installment_anticipation_credit', invoiceId: 'invoice-2', amountCents: 5000 })
        ]);
      }
      return vi.fn();
    });

    const { result, rerender } = renderHook(
      ({ transactionIndex }: { transactionIndex: TransactionDeletionIndex }) => useCardsData('ws-1', transactionIndex),
      { initialProps: { transactionIndex: index() } }
    );

    const invoice1Before = result.current.invoices.find((inv) => inv.id === 'invoice-1');
    expect(invoice1Before?.purchasesTotalCents).toBe(5000);

    rerender({ transactionIndex: index(['txn-1']) });

    const invoice1After = result.current.invoices.find((inv) => inv.id === 'invoice-1');
    const invoice2After = result.current.invoices.find((inv) => inv.id === 'invoice-2');
    expect(invoice1After?.purchasesTotalCents).toBe(0);
    expect(invoice2After?.creditsTotalCents).toBe(0);
  });

  // Regressão: `deleteCard` é soft-delete (isActive: false) e `subscribeCards` não
  // filtra — o cartão continuava listado em /app/cards depois de excluído, e as faturas
  // dele seguiam entrando no "Comprometido" do Dashboard e no cálculo de limite.
  it('drops soft-deleted cards and their invoices', () => {
    cardMocks.subscribeCards.mockImplementation((_workspaceId, onNext) => {
      onNext([
        { id: 'card-1', workspaceId: 'ws-1', name: 'Ativo', isActive: true, localSyncStatus: 'synced' },
        { id: 'card-morto', workspaceId: 'ws-1', name: 'Excluído', isActive: false, localSyncStatus: 'synced' }
      ]);
      return vi.fn();
    });
    cardMocks.subscribeInvoices.mockImplementation((_workspaceId, cardId, onNext) => {
      onNext([
        { id: `invoice-${cardId}`, cardId, workspaceId: 'ws-1', referenceMonth: '2026-07', status: 'closed', localSyncStatus: 'synced' }
      ]);
      return vi.fn();
    });
    cardMocks.subscribeInvoiceLedger.mockImplementation((_workspaceId, cardId, invoiceId, onNext) => {
      onNext([ledgerEntry({ id: `entry-${cardId}`, cardId, invoiceId, amountCents: 30000 })]);
      return vi.fn();
    });

    const { result } = renderHook(() => useCardsData('ws-1', index()));

    expect(result.current.cards.map((card) => card.id)).toEqual(['card-1']);
    expect(result.current.invoices.map((invoice) => invoice.cardId)).toEqual(['card-1']);
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

      const { result } = renderHook(() => useCardsData('ws-1', index([], ['txn-recente'])));

      expect(result.current.invoices[0]?.purchasesTotalCents).toBe(5000);

      await waitFor(() => expect(result.current.invoices[0]?.purchasesTotalCents).toBe(0));
      expect(cardMocks.fetchDeletedTransactionIds).toHaveBeenCalledWith('ws-1', ['txn-antiga']);
    });

    // O lado seguro: se a consulta não confirma a exclusão, o lançamento fica. Sumir com
    // ele apagaria uma dívida real da fatura.
    it('mantém o lançamento quando a transação fora da janela não está excluída', async () => {
      cardMocks.fetchDeletedTransactionIds.mockResolvedValue([]);

      const { result } = renderHook(() => useCardsData('ws-1', index([], ['txn-recente'])));

      await waitFor(() => expect(cardMocks.fetchDeletedTransactionIds).toHaveBeenCalled());
      expect(result.current.invoices[0]?.purchasesTotalCents).toBe(5000);
    });

    it('mantém o lançamento quando a consulta falha (offline sem cache)', async () => {
      cardMocks.fetchDeletedTransactionIds.mockRejectedValue(new Error('offline'));

      const { result } = renderHook(() => useCardsData('ws-1', index([], ['txn-recente'])));

      await waitFor(() => expect(cardMocks.fetchDeletedTransactionIds).toHaveBeenCalled());
      expect(result.current.invoices[0]?.purchasesTotalCents).toBe(5000);
    });

    it('não reconsulta a mesma transação a cada snapshot de ledger', async () => {
      cardMocks.fetchDeletedTransactionIds.mockResolvedValue([]);

      const { rerender } = renderHook(
        ({ transactionIndex }: { transactionIndex: TransactionDeletionIndex }) => useCardsData('ws-1', transactionIndex),
        { initialProps: { transactionIndex: index([], ['txn-recente']) } }
      );

      await waitFor(() => expect(cardMocks.fetchDeletedTransactionIds).toHaveBeenCalledTimes(1));
      rerender({ transactionIndex: index([], ['txn-recente']) });
      await waitFor(() => expect(cardMocks.fetchDeletedTransactionIds).toHaveBeenCalledTimes(1));
    });

    it('não consulta nada quando a janela já cobre a transação', async () => {
      const { result } = renderHook(() => useCardsData('ws-1', index([], ['txn-antiga'])));

      await waitFor(() => expect(result.current.invoices[0]?.purchasesTotalCents).toBe(5000));
      expect(cardMocks.fetchDeletedTransactionIds).not.toHaveBeenCalled();
    });
  });
});
