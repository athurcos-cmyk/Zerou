import { describe, expect, it, vi } from 'vitest';
import { Timestamp, deleteField } from 'firebase/firestore';

const firestoreMocks = vi.hoisted(() => ({
  updateDoc: vi.fn().mockResolvedValue(undefined),
  doc: vi.fn().mockReturnValue({ id: 'doc-ref' }),
  serverTimestamp: vi.fn().mockReturnValue('server-timestamp'),
  batch: { set: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) },
  writeBatch: vi.fn()
}));

firestoreMocks.writeBatch.mockReturnValue(firestoreMocks.batch);

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: firestoreMocks.doc,
  updateDoc: firestoreMocks.updateDoc,
  serverTimestamp: firestoreMocks.serverTimestamp,
  writeBatch: firestoreMocks.writeBatch
}));

vi.mock('../firebase/config', () => ({
  getFirebaseDb: vi.fn().mockReturnValue({})
}));

const cardServiceMocks = vi.hoisted(() => ({
  addCardPurchaseToBatch: vi.fn().mockResolvedValue({ transactionId: 'txn-card', firstInvoiceId: 'inv-1', cardId: 'card-1' })
}));

vi.mock('../cards/cardService', () => ({
  addCardPurchaseToBatch: cardServiceMocks.addCardPurchaseToBatch
}));

const { markOverdueBills, payBill, recordRecurringPayment, recurringOccurrenceTransactionId, updateBill } = await import(
  './financeService'
);

function bill(id: string, status: 'pending' | 'paid' | 'overdue' | 'cancelled', daysFromToday: number) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + daysFromToday);
  return { id, status, dueDate: Timestamp.fromDate(dueDate) };
}

describe('markOverdueBills', () => {
  it('marca como overdue apenas bills pending com vencimento em dia anterior a hoje', () => {
    firestoreMocks.updateDoc.mockClear();

    markOverdueBills('workspace-1', [
      bill('past-pending', 'pending', -2),
      bill('today-pending', 'pending', 0),
      bill('future-pending', 'pending', 3),
      bill('past-paid', 'paid', -2),
      bill('past-already-overdue', 'overdue', -2),
      bill('past-cancelled', 'cancelled', -2)
    ]);

    expect(firestoreMocks.updateDoc).toHaveBeenCalledTimes(1);
    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'overdue' })
    );
  });

  it('não escreve nada quando não há bill pending vencida', () => {
    firestoreMocks.updateDoc.mockClear();

    markOverdueBills('workspace-1', [bill('today-pending', 'pending', 0), bill('future-pending', 'pending', 1)]);

    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
  });
});

describe('updateBill', () => {
  it('grava só os campos definidos no patch', () => {
    firestoreMocks.updateDoc.mockClear();

    const dueDate = new Date(2026, 7, 20);
    updateBill('workspace-1', 'bill-1', { description: 'Aluguel novo', amountCents: 150000, dueDate });

    expect(firestoreMocks.updateDoc).toHaveBeenCalledTimes(1);
    const [, updates] = firestoreMocks.updateDoc.mock.calls[0];
    expect(updates).toEqual(
      expect.objectContaining({
        description: 'Aluguel novo',
        amountCents: 150000,
        dueDate: Timestamp.fromDate(dueDate)
      })
    );
    expect(updates).not.toHaveProperty('categoryId');
    expect(updates).not.toHaveProperty('accountId');
  });

  it('limpa categoryId/accountId com null via deleteField(), não com a string "null"', () => {
    firestoreMocks.updateDoc.mockClear();

    updateBill('workspace-1', 'bill-1', { categoryId: null, accountId: null });

    const [, updates] = firestoreMocks.updateDoc.mock.calls[0];
    expect(updates.categoryId).toEqual(deleteField());
    expect(updates.accountId).toEqual(deleteField());
  });
});

const billBase = {
  id: 'bill-1',
  description: 'Aluguel',
  amountCents: 150000,
  categoryId: 'cat-1',
  accountId: undefined as string | undefined,
  cardId: undefined as string | undefined,
  installments: undefined as number | undefined
};

describe('payBill', () => {
  it('branch de conta bancária: cria transação expense e aplica efeito de saldo (regressão da assinatura async)', async () => {
    firestoreMocks.batch.set.mockClear();
    firestoreMocks.batch.update.mockClear();
    cardServiceMocks.addCardPurchaseToBatch.mockClear();

    await payBill('workspace-1', 'user-1', { ...billBase, accountId: 'acct-1' }, {});

    expect(cardServiceMocks.addCardPurchaseToBatch).not.toHaveBeenCalled();
    const txnCall = firestoreMocks.batch.set.mock.calls.find(([, payload]) => payload.type === 'expense');
    expect(txnCall?.[1]).toEqual(expect.objectContaining({ accountId: 'acct-1', amountCents: 150000 }));
    expect(firestoreMocks.batch.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'paid' }));
    expect(firestoreMocks.batch.commit).toHaveBeenCalled();
  });

  it('branch de cartão: chama addCardPurchaseToBatch no mesmo batch, sem criar transação expense', async () => {
    firestoreMocks.batch.set.mockClear();
    cardServiceMocks.addCardPurchaseToBatch.mockClear();

    await payBill('workspace-1', 'user-1', { ...billBase, cardId: 'card-1', installments: 3 }, {});

    expect(cardServiceMocks.addCardPurchaseToBatch).toHaveBeenCalledWith(
      firestoreMocks.batch,
      'workspace-1',
      'user-1',
      expect.objectContaining({ cardId: 'card-1', installments: 3, amountCents: 150000 })
    );
    expect(firestoreMocks.batch.set.mock.calls.some(([, payload]) => payload?.type === 'expense')).toBe(false);
  });

  it('nem accountId nem cardId: bill vira paid sem criar nenhuma transação (regressão)', async () => {
    firestoreMocks.batch.set.mockClear();
    cardServiceMocks.addCardPurchaseToBatch.mockClear();

    await payBill('workspace-1', 'user-1', { ...billBase }, {});

    expect(firestoreMocks.batch.set).not.toHaveBeenCalled();
    expect(cardServiceMocks.addCardPurchaseToBatch).not.toHaveBeenCalled();
    expect(firestoreMocks.batch.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'paid' }));
  });
});

describe('recordRecurringPayment', () => {
  function rule(overrides: Partial<{ accountId?: string; cardId?: string }> = {}) {
    return {
      id: 'rec-1',
      description: 'Netflix',
      amountCents: 3990,
      categoryId: 'cat-1',
      accountId: undefined as string | undefined,
      cardId: undefined as string | undefined,
      frequency: 'monthly' as const,
      nextOccurrenceAt: Timestamp.fromDate(new Date(2026, 6, 10)),
      anchorDay: 10,
      ...overrides
    };
  }

  it('branch de conta bancária: cria transação expense e avança nextOccurrenceAt (regressão da assinatura async)', async () => {
    firestoreMocks.batch.set.mockClear();
    firestoreMocks.batch.update.mockClear();
    cardServiceMocks.addCardPurchaseToBatch.mockClear();

    await recordRecurringPayment('workspace-1', 'user-1', rule({ accountId: 'acct-1' }), {});

    expect(cardServiceMocks.addCardPurchaseToBatch).not.toHaveBeenCalled();
    const txnCall = firestoreMocks.batch.set.mock.calls.find(([, payload]) => payload.type === 'expense');
    expect(txnCall?.[1]).toEqual(expect.objectContaining({ accountId: 'acct-1', amountCents: 3990 }));
    expect(firestoreMocks.batch.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nextOccurrenceAt: expect.anything() })
    );
  });

  it('branch de cartão: chama addCardPurchaseToBatch com transactionId determinístico (protege contra clique duplo)', async () => {
    cardServiceMocks.addCardPurchaseToBatch.mockClear();
    const ruleWithCard = rule({ cardId: 'card-1' });
    const expectedId = recurringOccurrenceTransactionId(ruleWithCard.id, ruleWithCard.nextOccurrenceAt.toDate());

    await recordRecurringPayment('workspace-1', 'user-1', ruleWithCard, {});

    expect(cardServiceMocks.addCardPurchaseToBatch).toHaveBeenCalledWith(
      firestoreMocks.batch,
      'workspace-1',
      'user-1',
      expect.objectContaining({ cardId: 'card-1', installments: 1 }),
      { transactionId: expectedId }
    );
  });

  it('nem accountId nem cardId: avança a data sem criar nenhuma transação (regressão)', async () => {
    firestoreMocks.batch.set.mockClear();
    cardServiceMocks.addCardPurchaseToBatch.mockClear();

    await recordRecurringPayment('workspace-1', 'user-1', rule(), {});

    expect(firestoreMocks.batch.set).not.toHaveBeenCalled();
    expect(cardServiceMocks.addCardPurchaseToBatch).not.toHaveBeenCalled();
  });
});
