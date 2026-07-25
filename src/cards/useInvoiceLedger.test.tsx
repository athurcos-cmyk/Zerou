import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { useInvoiceLedger, mergeInvoicesWithLedger, type InvoiceLedgerRef } from './useInvoiceLedger';
import type { TransactionDeletionIndex } from '../finance/useFinanceData';
import type { Invoice, InvoiceLedgerEntry } from '../types/contracts';

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

    expect(result.current.entries.map((e) => e.id)).toEqual(['entry-1', 'entry-2']);

    rerender({ transactionIndex: index(['txn-1']) });

    expect(result.current.entries.map((e) => e.id)).toEqual(['entry-2']);
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

    expect(result.current.entries.find((e) => e.id === 'debit-1')).toBeDefined();

    rerender({ transactionIndex: index(['txn-1']) });

    expect(result.current.entries.find((e) => e.id === 'debit-1')).toBeUndefined();
    expect(result.current.entries.find((e) => e.id === 'credit-1')).toBeUndefined();
  });

  // Regressão: excluir uma compra no cartão dispara `reverseCardPurchaseOnDelete`, que cria um
  // `purchase_reversal` no próprio ledger (mesmo sourceTransactionId da compra apagada) — ele
  // cancela a compra matematicamente (Valor a pagar fecha certo), mas o filtro de órfão daqui
  // escondia OS DOIS antes de `anticipatedAwayEntryIds` (InvoicePage) ter a chance de parear o
  // par e escondê-lo junto. Resultado: a linha sumia da lista, mas "Compras"/"Créditos" no
  // resumo ficavam inflados pra sempre com o valor da compra excluída.
  it('mantém visíveis a compra e seu estorno quando a exclusão já foi revertida no ledger', () => {
    cardMocks.subscribeInvoiceLedger.mockImplementation((_workspaceId, _cardId, _invoiceId, onNext) => {
      onNext([
        ledgerEntry({ id: 'purchase-1', type: 'purchase', sourceTransactionId: 'txn-1', amountCents: 15000 }),
        ledgerEntry({ id: 'reversal-1', type: 'purchase_reversal', sourceTransactionId: 'txn-1', amountCents: 15000 })
      ]);
      return vi.fn();
    });

    const { result, rerender } = renderHook(
      ({ transactionIndex }: { transactionIndex: TransactionDeletionIndex }) =>
        useInvoiceLedger('ws-1', oneInvoice, transactionIndex),
      { initialProps: { transactionIndex: index() } }
    );

    rerender({ transactionIndex: index(['txn-1']) });

    expect(result.current.entries.map((e) => e.id).sort()).toEqual(['purchase-1', 'reversal-1']);
  });

  // Sem estorno no ledger (dado antigo, ou exclusão que aconteceu antes de
  // `reverseCardPurchaseOnDelete` existir), o órfão continua escondido — não tem par pra
  // `anticipatedAwayEntryIds` esconder, então mostrar a compra sozinha voltaria a inflar
  // "Compras" sem nunca cancelar.
  it('continua escondendo o órfão quando não há estorno correspondente no ledger', () => {
    cardMocks.subscribeInvoiceLedger.mockImplementation((_workspaceId, _cardId, _invoiceId, onNext) => {
      onNext([ledgerEntry({ id: 'purchase-1', type: 'purchase', sourceTransactionId: 'txn-1', amountCents: 15000 })]);
      return vi.fn();
    });

    const { result, rerender } = renderHook(
      ({ transactionIndex }: { transactionIndex: TransactionDeletionIndex }) =>
        useInvoiceLedger('ws-1', oneInvoice, transactionIndex),
      { initialProps: { transactionIndex: index() } }
    );

    rerender({ transactionIndex: index(['txn-1']) });

    expect(result.current.entries).toEqual([]);
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

      expect(result.current.entries.map((e) => e.id)).toEqual(['entry-antiga']);

      await waitFor(() => expect(result.current.entries.map((e) => e.id)).toEqual([]));
      expect(cardMocks.fetchDeletedTransactionIds).toHaveBeenCalledWith('ws-1', ['txn-antiga']);
    });

    // O lado seguro: se a consulta não confirma a exclusão, o lançamento fica. Sumir com
    // ele apagaria uma dívida real da fatura.
    it('mantém o lançamento quando a transação fora da janela não está excluída', async () => {
      cardMocks.fetchDeletedTransactionIds.mockResolvedValue([]);

      const { result } = renderHook(() => useInvoiceLedger('ws-1', oneInvoice, index([], ['txn-recente'])));

      await waitFor(() => expect(cardMocks.fetchDeletedTransactionIds).toHaveBeenCalled());
      expect(result.current.entries.map((e) => e.id)).toEqual(['entry-antiga']);
    });

    it('mantém o lançamento quando a consulta falha (offline sem cache)', async () => {
      cardMocks.fetchDeletedTransactionIds.mockRejectedValue(new Error('offline'));

      const { result } = renderHook(() => useInvoiceLedger('ws-1', oneInvoice, index([], ['txn-recente'])));

      await waitFor(() => expect(cardMocks.fetchDeletedTransactionIds).toHaveBeenCalled());
      expect(result.current.entries.map((e) => e.id)).toEqual(['entry-antiga']);
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

      await waitFor(() => expect(result.current.entries.map((e) => e.id)).toEqual(['entry-antiga']));
      expect(cardMocks.fetchDeletedTransactionIds).not.toHaveBeenCalled();
    });
  });
});

// Regressão (2026-07-24): "Limite disponível"/"Fatura atual" demoravam a atualizar depois de
// lançar uma compra — outstandingBalanceCents só é recalculado pela Cloud Function
// (invoiceLedgerEntryTrigger.ts), que só roda quando a escrita chega ao servidor. Offline, ou
// nos segundos antes dela processar, o campo persistido fica desatualizado. mergeInvoicesWithLedger
// agora recalcula os totais a partir do ledger que a tela já tem em memória (calculateInvoice,
// a mesma função pura que a Cloud Function porta manualmente).
describe('mergeInvoicesWithLedger — totais ao vivo', () => {
  function invoice(overrides: Partial<Invoice> = {}): Invoice {
    return {
      id: 'invoice-1',
      cardId: 'card-1',
      workspaceId: 'ws-1',
      referenceMonth: '2026-08',
      dueDate: Timestamp.fromDate(new Date('2026-08-20')),
      status: 'open',
      purchasesTotalCents: 0,
      paymentsTotalCents: 0,
      creditsTotalCents: 0,
      feesTotalCents: 0,
      outstandingBalanceCents: 0,
      overpaidCreditCents: 0,
      version: 1,
      ...overrides
    };
  }

  function entry(overrides: Partial<InvoiceLedgerEntry> = {}): InvoiceLedgerEntry {
    return {
      id: 'entry-1',
      invoiceId: 'invoice-1',
      cardId: 'card-1',
      workspaceId: 'ws-1',
      type: 'purchase',
      amountCents: 5000,
      effectiveAt: Timestamp.fromDate(new Date('2026-08-01')),
      idempotencyKey: 'txn-1_purchase_1',
      createdBy: 'user-1',
      ...overrides
    };
  }

  it('reflete um lançamento recém-criado na hora, mesmo com o campo persistido ainda em zero (Cloud Function não processou — offline ou latência)', () => {
    // outstandingBalanceCents/purchasesTotalCents ainda em 0: simula a Cloud Function não ter
    // rodado ainda (offline, ou os poucos segundos antes dela processar em rede normal).
    const staleInvoice = invoice({ outstandingBalanceCents: 0, purchasesTotalCents: 0 });
    const pendingEntry = entry({ amountCents: 5000 });

    const [merged] = mergeInvoicesWithLedger([staleInvoice], [{ ...pendingEntry, localSyncStatus: 'pending' }]);

    expect(merged.outstandingBalanceCents).toBe(5000);
    expect(merged.purchasesTotalCents).toBe(5000);
  });

  it('bate com o total persistido quando está tudo sincronizado (não regride o caso comum)', () => {
    const syncedInvoice = invoice({ outstandingBalanceCents: 5000, purchasesTotalCents: 5000 });
    const syncedEntry = entry({ amountCents: 5000 });

    const [merged] = mergeInvoicesWithLedger([syncedInvoice], [{ ...syncedEntry, localSyncStatus: 'synced' }]);

    expect(merged.outstandingBalanceCents).toBe(5000);
  });

  it('desconta um pagamento pendente do saldo devedor na hora', () => {
    const staleInvoice = invoice({ outstandingBalanceCents: 5000, purchasesTotalCents: 5000 });
    const purchase = entry({ id: 'entry-1', type: 'purchase', amountCents: 5000 });
    const pendingPayment = entry({ id: 'entry-2', type: 'payment', amountCents: 2000, idempotencyKey: 'txn-2_payment' });

    const [merged] = mergeInvoicesWithLedger(
      [staleInvoice],
      [
        { ...purchase, localSyncStatus: 'synced' },
        { ...pendingPayment, localSyncStatus: 'pending' }
      ]
    );

    expect(merged.outstandingBalanceCents).toBe(3000);
    expect(merged.paymentsTotalCents).toBe(2000);
  });

  it('não mistura lançamentos de outra fatura no total', () => {
    const staleInvoice = invoice({ id: 'invoice-1' });
    const thisInvoiceEntry = entry({ invoiceId: 'invoice-1', amountCents: 5000 });
    const otherInvoiceEntry = entry({ id: 'entry-2', invoiceId: 'invoice-2', amountCents: 9999, idempotencyKey: 'txn-2_purchase_1' });

    const [merged] = mergeInvoicesWithLedger(
      [staleInvoice],
      [
        { ...thisInvoiceEntry, localSyncStatus: 'synced' },
        { ...otherInvoiceEntry, localSyncStatus: 'synced' }
      ]
    );

    expect(merged.outstandingBalanceCents).toBe(5000);
    expect(merged.ledgerEntries.map((e) => e.id)).toEqual(['entry-1']);
  });
});
