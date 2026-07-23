import { describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';

const firestoreMocks = vi.hoisted(() => ({
  updateDoc: vi.fn().mockResolvedValue(undefined),
  doc: vi.fn().mockReturnValue({ id: 'doc-ref' }),
  serverTimestamp: vi.fn().mockReturnValue('server-timestamp'),
  getDoc: vi.fn(),
  batch: { set: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) },
  writeBatch: vi.fn()
}));

firestoreMocks.writeBatch.mockReturnValue(firestoreMocks.batch);

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: firestoreMocks.doc,
  updateDoc: firestoreMocks.updateDoc,
  serverTimestamp: firestoreMocks.serverTimestamp,
  getDoc: firestoreMocks.getDoc,
  writeBatch: firestoreMocks.writeBatch
}));

vi.mock('../firebase/config', () => ({
  getFirebaseDb: vi.fn().mockReturnValue({})
}));

const { addCardPurchaseToBatch, markClosedInvoices, registerOngoingInstallments, updateCardPurchase } = await import('./cardService');

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

describe('registerOngoingInstallments', () => {
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

  // Regressão do bug relatado por usuárias: toda compra lançada por "Lançar compra parcelada
  // que já começou" caía sempre no dia 1º do mês da PRÓXIMA parcela (`nextDueMonth`), ignorando
  // a data de compra informada — tanto na transaction quanto no ledger (o que também fazia a
  // tela de detalhes da fatura mostrar o vencimento do cartão como se fosse a data da compra).
  it('usa a data de compra informada — não o mês da próxima parcela — na transaction e no ledger', async () => {
    mockCardAndNoExistingInvoices();
    firestoreMocks.batch.set.mockClear();

    const purchaseDate = new Date(2026, 1, 14); // 14/fev/2026 — bem antes do mês da próxima parcela
    await registerOngoingInstallments('ws1', 'user1', {
      cardId: 'card-1',
      description: 'Óculos',
      installmentValueCents: 30000,
      currentInstallment: 7,
      totalInstallments: 10,
      nextDueMonth: new Date(2026, 8, 1), // setembro/2026 — só decide em qual fatura cai
      purchaseDate
    });

    const transactionCall = firestoreMocks.batch.set.mock.calls.find(([, payload]) => payload.type === 'card_purchase');
    expect(transactionCall?.[1].date).toEqual(Timestamp.fromDate(purchaseDate));

    const ledgerCalls = firestoreMocks.batch.set.mock.calls.filter(([, payload]) => payload.type === 'purchase');
    expect(ledgerCalls.length).toBeGreaterThan(0);
    ledgerCalls.forEach(([, payload]) => {
      expect(payload.effectiveAt).toEqual(Timestamp.fromDate(purchaseDate));
    });
  });
});

describe('updateCardPurchase', () => {
  // Regressão de um bug real encontrado ao vivo (2026-07-23): a versão anterior desta função
  // fazia soft-delete + recriava as N parcelas pra poder editar o VALOR — mas isso reabria
  // saldo devedor numa fatura já FECHADA/PAGA quando o valor mudava (o pagamento já registrado
  // não mudava, mas o valor da parcela recriada sim). Corrigido restringindo a edição a
  // descrição/categoria — puro metadado de exibição, nunca gravado no ledger (a fatura e a
  // Análise sempre resolvem os dois ao vivo a partir da transação via `sourceTransactionId`) —
  // então um `updateDoc` simples na transação já existente basta, sem tocar em nenhuma parcela
  // nem em Cloud Function nenhuma.
  function mockExistingCardPurchase() {
    firestoreMocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'txn-old',
      data: () => ({
        type: 'card_purchase',
        cardId: 'card-1',
        amountCents: 30000,
        description: 'Compra antiga',
        categoryId: 'cat-old'
      })
    });
  }

  it('atualiza só descrição e categoria da transação existente, sem tocar em ledger ou batch', async () => {
    mockExistingCardPurchase();
    firestoreMocks.updateDoc.mockClear();
    firestoreMocks.writeBatch.mockClear();

    await updateCardPurchase('ws1', 'user1', 'txn-old', {
      description: 'Compra editada',
      categoryId: 'cat-new'
    });

    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        description: 'Compra editada',
        categoryId: 'cat-new',
        updatedBy: 'user1'
      })
    );
    // Nunca cria um batch (não há soft-delete, não há parcela nova) — a Pendência 1a
    // (reverseCardPurchaseOnDelete) não é acionada, porque a transação nunca ganha deletedAt.
    expect(firestoreMocks.writeBatch).not.toHaveBeenCalled();
  });

  it('rejeita editar uma transação que não é card_purchase', async () => {
    firestoreMocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'txn-expense',
      data: () => ({ type: 'expense', accountId: 'acc-1' })
    });

    await expect(
      updateCardPurchase('ws1', 'user1', 'txn-expense', { description: 'x' })
    ).rejects.toThrow();
  });
});
