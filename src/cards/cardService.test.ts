import { describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  updateDoc: vi.fn().mockResolvedValue(undefined),
  doc: vi.fn().mockReturnValue({ id: 'doc-ref' }),
  serverTimestamp: vi.fn().mockReturnValue('server-timestamp'),
  getDoc: vi.fn()
}));

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: firestoreMocks.doc,
  updateDoc: firestoreMocks.updateDoc,
  serverTimestamp: firestoreMocks.serverTimestamp,
  getDoc: firestoreMocks.getDoc
}));

vi.mock('../firebase/config', () => ({
  getFirebaseDb: vi.fn().mockReturnValue({})
}));

const { addCardPurchaseToBatch, markClosedInvoices } = await import('./cardService');

function invoice(id: string, status: 'open' | 'closed' | 'paid', referenceMonth: string) {
  return { id, cardId: 'card-1', status, referenceMonth };
}

describe('markClosedInvoices', () => {
  const fixedToday = new Date();
  const pastReferenceMonth = (() => {
    const past = new Date(fixedToday.getFullYear(), fixedToday.getMonth() - 1, 1);
    return `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}`;
  })();
  const futureReferenceMonth = (() => {
    const future = new Date(fixedToday.getFullYear(), fixedToday.getMonth() + 1, 1);
    return `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}`;
  })();

  it('fecha fatura open cujo dia de fechamento já passou', () => {
    firestoreMocks.updateDoc.mockClear();

    markClosedInvoices('workspace-1', [invoice('inv-past', 'open', pastReferenceMonth)], 10);

    expect(firestoreMocks.updateDoc).toHaveBeenCalledTimes(1);
    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'closed' })
    );
  });

  it('não mexe em fatura open cujo dia de fechamento ainda não chegou', () => {
    firestoreMocks.updateDoc.mockClear();

    markClosedInvoices('workspace-1', [invoice('inv-future', 'open', futureReferenceMonth)], 10);

    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });

  it('não mexe em fatura que já não está open', () => {
    firestoreMocks.updateDoc.mockClear();

    markClosedInvoices('workspace-1', [invoice('inv-paid', 'paid', pastReferenceMonth)], 10);

    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });

  // Regressão: o dia de fechamento inteiro ainda pertence ao ciclo atual (mesma regra de
  // resolveInstallmentCycle — uma compra à tarde no dia de fechamento ainda cai nesta fatura).
  // Fechar a partir do meio-dia desse mesmo dia fecharia a fatura horas antes de ela realmente
  // parar de aceitar compra nova.
  it('não fecha a fatura no próprio dia de fechamento, mesmo à tarde', () => {
    firestoreMocks.updateDoc.mockClear();
    const closingDay = fixedToday.getDate();
    const currentReferenceMonth = `${fixedToday.getFullYear()}-${String(fixedToday.getMonth() + 1).padStart(2, '0')}`;

    markClosedInvoices('workspace-1', [invoice('inv-today', 'open', currentReferenceMonth)], closingDay);

    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });
});

describe('addCardPurchaseToBatch', () => {
  function fakeBatch() {
    return { set: vi.fn(), update: vi.fn() };
  }

  function mockCardAndNoExistingInvoices() {
    firestoreMocks.getDoc
      // 1ª chamada: loadCard
      .mockResolvedValueOnce({
        exists: () => true,
        id: 'card-1',
        data: () => ({ closingDay: 10, dueDay: 20, name: 'Nubank', brand: 'Mastercard' })
      })
      // Chamadas seguintes: checagem de existência da fatura — sempre "não existe" ainda.
      .mockResolvedValue({ exists: () => false });
  }

  it('usa o transactionId explícito quando fornecido, em vez de gerar um novo (idempotência)', async () => {
    mockCardAndNoExistingInvoices();
    const batch = fakeBatch();

    const result = await addCardPurchaseToBatch(
      batch as never,
      'ws1',
      'user1',
      { cardId: 'card-1', description: 'Netflix', amountCents: 3990, purchaseDate: new Date(2026, 6, 5), installments: 1 },
      { transactionId: 'custom-txn-id' }
    );

    expect(result.transactionId).toBe('custom-txn-id');
    const transactionCall = batch.set.mock.calls.find(([, payload]) => payload.type === 'card_purchase');
    expect(transactionCall?.[1]).toEqual(expect.objectContaining({ id: 'custom-txn-id' }));
  });

  it('gera um transactionId novo quando nenhum é fornecido', async () => {
    mockCardAndNoExistingInvoices();
    const batch = fakeBatch();

    const result = await addCardPurchaseToBatch(batch as never, 'ws1', 'user1', {
      cardId: 'card-1',
      description: 'Spotify',
      amountCents: 1990,
      purchaseDate: new Date(2026, 6, 5),
      installments: 1
    });

    expect(result.transactionId).toBeTruthy();
    expect(result.transactionId).not.toBe('custom-txn-id');
  });
});
