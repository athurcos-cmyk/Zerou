import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useCardsData } from './useCardsData';

const cardMocks = vi.hoisted(() => ({
  subscribeCards: vi.fn(),
  subscribeInvoices: vi.fn()
}));

vi.mock('./cardService', () => cardMocks);

function invoice(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'invoice-1',
    cardId: 'card-1',
    workspaceId: 'ws-1',
    referenceMonth: '2026-07',
    status: 'open',
    purchasesTotalCents: 5000,
    paymentsTotalCents: 0,
    creditsTotalCents: 0,
    feesTotalCents: 0,
    outstandingBalanceCents: 5000,
    overpaidCreditCents: 0,
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
      onNext([invoice()]);
      return vi.fn();
    });
  });

  it('exposes cards and invoices with totals já persistidos, sem recalcular do ledger', () => {
    const { result } = renderHook(() => useCardsData('ws-1'));

    expect(result.current.cards.map((c) => c.id)).toEqual(['card-1']);
    const inv = result.current.invoices.find((i) => i.id === 'invoice-1');
    expect(inv?.purchasesTotalCents).toBe(5000);
    expect(inv?.outstandingBalanceCents).toBe(5000);
  });

  it('calcula o status fino a partir dos totais persistidos (fatura aberta continua "open")', () => {
    const { result } = renderHook(() => useCardsData('ws-1'));
    const inv = result.current.invoices.find((i) => i.id === 'invoice-1');
    expect(inv?.status).toBe('open');
  });

  it('calcula status "paid" pra fatura fechada e totalmente quitada', () => {
    cardMocks.subscribeInvoices.mockImplementation((_workspaceId, _cardId, onNext) => {
      onNext([
        invoice({
          status: 'closed',
          purchasesTotalCents: 5000,
          paymentsTotalCents: 5000,
          outstandingBalanceCents: 0
        })
      ]);
      return vi.fn();
    });

    const { result } = renderHook(() => useCardsData('ws-1'));
    const inv = result.current.invoices.find((i) => i.id === 'invoice-1');
    expect(inv?.status).toBe('paid');
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
      onNext([invoice({ id: `invoice-${cardId}`, cardId })]);
      return vi.fn();
    });

    const { result } = renderHook(() => useCardsData('ws-1'));

    expect(result.current.cards.map((card) => card.id)).toEqual(['card-1']);
    expect(result.current.invoices.map((inv) => inv.cardId)).toEqual(['card-1']);
  });
});
