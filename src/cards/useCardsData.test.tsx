import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useCardsData } from './useCardsData';

const cardMocks = vi.hoisted(() => ({
  subscribeCards: vi.fn(),
  subscribeInvoices: vi.fn(),
  markClosedInvoices: vi.fn()
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
    cardMocks.markClosedInvoices.mockClear();
    cardMocks.subscribeCards.mockImplementation((_workspaceId, onNext) => {
      onNext([{ id: 'card-1', workspaceId: 'ws-1', name: 'Cartão', isActive: true, closingDay: 10, localSyncStatus: 'synced' }]);
      return vi.fn();
    });
    cardMocks.subscribeInvoices.mockImplementation((_workspaceId, _cardId, onNext) => {
      onNext([invoice()]);
      return vi.fn();
    });
  });

  // Regressão: a chamada a markClosedInvoices foi acrescentada à mão dentro do callback de
  // subscribeInvoices (arrow function viraram block body) — sem este teste, um refactor que
  // derrubasse a chamada, trocasse a ordem dos argumentos ou passasse card.dueDay em vez de
  // card.closingDay passaria por todo o resto da suíte sem quebrar nada.
  it('chama markClosedInvoices com a fatura recebida e o closingDay do cartão certo', () => {
    renderHook(() => useCardsData('ws-1'));

    expect(cardMocks.markClosedInvoices).toHaveBeenCalledWith('ws-1', [invoice()], 10);
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

  // Regressão: o Dashboard calcula "Disponível"/"Comprometido" descontando o saldo das
  // faturas — se `loading` virasse false assim que o CARTÃO chegasse (sem esperar a
  // FATURA), o Dashboard calculava por um instante como se a fatura fosse zero (valor
  // inflado) e corrigia um instante depois, um "piscar" visível pro usuário.
  it('mantém loading=true até a fatura de todo cartão ativo chegar, não só o cartão', () => {
    let deliverInvoice: (() => void) | undefined;
    cardMocks.subscribeInvoices.mockImplementation((_workspaceId, _cardId, onNext) => {
      deliverInvoice = () => onNext([invoice()]);
      return vi.fn();
    });

    const { result } = renderHook(() => useCardsData('ws-1'));

    // O cartão já chegou (via subscribeCards, síncrono no mock), mas a fatura ainda não.
    expect(result.current.cards.map((c) => c.id)).toEqual(['card-1']);
    expect(result.current.loading).toBe(true);

    act(() => {
      deliverInvoice?.();
    });

    expect(result.current.loading).toBe(false);
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
