import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useCardsData } from './useCardsData';

const cardMocks = vi.hoisted(() => ({
  subscribeCards: vi.fn(),
  subscribeInvoicesWindow: vi.fn(),
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
    // Duas assinaturas por cartão agora: `future` (>= mês atual) e `past` (< mês atual).
    cardMocks.subscribeInvoicesWindow.mockImplementation((_ws, _cardId, invoiceWindow, _month, onNext) => {
      onNext(invoiceWindow === 'future' ? [invoice()] : []);
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
    cardMocks.subscribeInvoicesWindow.mockImplementation((_ws, _cardId, invoiceWindow, _month, onNext) => {
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
  // Desde 07/08/2026 são DUAS assinaturas por cartão (janela futura e passada, direções opostas),
  // e o cartão só conta como resolvido quando as duas respondem — senão o Dashboard calcularia o
  // Comprometido com metade das faturas.
  it('mantém loading=true até as DUAS janelas de fatura chegarem', () => {
    const deliver = new Map<string, () => void>();
    cardMocks.subscribeInvoicesWindow.mockImplementation((_ws, _cardId, invoiceWindow, _month, onNext) => {
      deliver.set(invoiceWindow, () => onNext(invoiceWindow === 'future' ? [invoice()] : []));
      return vi.fn();
    });

    const { result } = renderHook(() => useCardsData('ws-1'));

    // O cartão já chegou (via subscribeCards, síncrono no mock), mas nenhuma fatura ainda.
    expect(result.current.cards.map((c) => c.id)).toEqual(['card-1']);
    expect(result.current.loading).toBe(true);

    act(() => {
      deliver.get('future')?.();
    });

    // Só metade respondeu — ainda carregando.
    expect(result.current.loading).toBe(true);

    act(() => {
      deliver.get('past')?.();
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
    cardMocks.subscribeInvoicesWindow.mockImplementation((_ws, cardId, invoiceWindow, _month, onNext) => {
      onNext([invoice({ id: `invoice-${cardId}`, cardId })]);
      return vi.fn();
    });

    const { result } = renderHook(() => useCardsData('ws-1'));

    expect(result.current.cards.map((card) => card.id)).toEqual(['card-1']);
    expect(result.current.invoices.map((inv) => inv.cardId)).toEqual(['card-1']);
  });
});

// ⚠️ O bug que as duas janelas existem pra matar: com uma query só (`asc + limit(24)`) o corte era
// sempre no FUTURO, em qualquer número de limite. Aqui a garantia é que as duas metades coexistem
// e saem ordenadas, sem uma apagar a outra.
describe('useCardsData — união das duas janelas de fatura', () => {
  function inv(id: string, referenceMonth: string) {
    return {
      id,
      cardId: 'card-1',
      workspaceId: 'ws-1',
      referenceMonth,
      status: 'open',
      purchasesTotalCents: 1000,
      paymentsTotalCents: 0,
      creditsTotalCents: 0,
      feesTotalCents: 0,
      outstandingBalanceCents: 1000,
      overpaidCreditCents: 0,
      localSyncStatus: 'synced'
    };
  }

  beforeEach(() => {
    cardMocks.subscribeCards.mockImplementation((_ws: unknown, onNext: (c: unknown[]) => void) => {
      onNext([{ id: 'card-1', workspaceId: 'ws-1', name: 'Cartão', isActive: true, closingDay: 2, localSyncStatus: 'synced' }]);
      return vi.fn();
    });
  });

  it('mantém passado E futuro juntos — uma janela não apaga a outra', () => {
    cardMocks.subscribeInvoicesWindow.mockImplementation((_ws, _cardId, invoiceWindow, _month, onNext) => {
      onNext(
        invoiceWindow === 'future'
          ? [inv('i-2026-08', '2026-08'), inv('i-2027-09', '2027-09')]
          : [inv('i-2026-07', '2026-07'), inv('i-2026-06', '2026-06')]
      );
      return vi.fn();
    });

    const { result } = renderHook(() => useCardsData('ws-1'));

    expect(result.current.invoices.map((i) => i.referenceMonth)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2027-09'
    ]);
  });

  it('ordena por referenceMonth asc mesmo com o passado chegando depois (a tela renderiza na ordem de chegada)', () => {
    const deliver = new Map<string, () => void>();
    cardMocks.subscribeInvoicesWindow.mockImplementation((_ws, _cardId, invoiceWindow, _month, onNext) => {
      deliver.set(invoiceWindow, () =>
        onNext(invoiceWindow === 'future' ? [inv('i-2026-08', '2026-08')] : [inv('i-2026-05', '2026-05')])
      );
      return vi.fn();
    });

    const { result } = renderHook(() => useCardsData('ws-1'));
    act(() => {
      deliver.get('future')?.();
    });
    act(() => {
      deliver.get('past')?.();
    });

    expect(result.current.invoices.map((i) => i.referenceMonth)).toEqual(['2026-05', '2026-08']);
  });

  it('passa o mês corrente e as duas direções pra query', () => {
    renderHook(() => useCardsData('ws-1'));

    // `mock.calls` pode acumular entre re-renders do hook — o que importa é que as DUAS direções
    // foram assinadas e que as duas usam o mesmo mês de fronteira.
    const windows = new Set(cardMocks.subscribeInvoicesWindow.mock.calls.map((c: unknown[]) => c[2]));
    const months = new Set(cardMocks.subscribeInvoicesWindow.mock.calls.map((c: unknown[]) => c[3]));
    expect([...windows].sort()).toEqual(['future', 'past']);
    expect(months.size).toBe(1);
    expect([...months][0]).toMatch(/^\d{4}-\d{2}$/);
  });
});
