import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useCardsData } from './useCardsData';

const cardMocks = vi.hoisted(() => ({
  subscribeCards: vi.fn(),
  subscribeInvoices: vi.fn(),
  subscribeInvoiceLedger: vi.fn()
}));

vi.mock('./cardService', () => cardMocks);

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
      ({ deletedTransactionIds }: { deletedTransactionIds: Set<string> }) => useCardsData('ws-1', deletedTransactionIds),
      { initialProps: { deletedTransactionIds: new Set<string>() } }
    );

    const beforeInvoice = result.current.invoices.find((inv) => inv.id === 'invoice-1');
    expect(beforeInvoice?.purchasesTotalCents).toBe(5000);
    expect(beforeInvoice?.ledgerEntries.map((e) => e.id)).toEqual(['entry-1', 'entry-2']);

    rerender({ deletedTransactionIds: new Set(['txn-1']) });

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
      ({ deletedTransactionIds }: { deletedTransactionIds: Set<string> }) => useCardsData('ws-1', deletedTransactionIds),
      { initialProps: { deletedTransactionIds: new Set<string>() } }
    );

    const invoice1Before = result.current.invoices.find((inv) => inv.id === 'invoice-1');
    expect(invoice1Before?.purchasesTotalCents).toBe(5000);

    rerender({ deletedTransactionIds: new Set(['txn-1']) });

    const invoice1After = result.current.invoices.find((inv) => inv.id === 'invoice-1');
    const invoice2After = result.current.invoices.find((inv) => inv.id === 'invoice-2');
    expect(invoice1After?.purchasesTotalCents).toBe(0);
    expect(invoice2After?.creditsTotalCents).toBe(0);
  });
});
