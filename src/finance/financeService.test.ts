import { describe, expect, it, vi } from 'vitest';
import { Timestamp, deleteField } from 'firebase/firestore';
// Cores vêm da paleta, nunca literais: o teste `noHardcodedColors` cobre todo o src/.
import { ACCENT_FOREGROUND, defaultCategoryColors } from '../theme/palette';

const firestoreMocks = vi.hoisted(() => ({
  updateDoc: vi.fn().mockResolvedValue(undefined),
  setDoc: vi.fn().mockResolvedValue(undefined),
  doc: vi.fn().mockReturnValue({ id: 'doc-ref' }),
  serverTimestamp: vi.fn().mockReturnValue('server-timestamp'),
  batch: { set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) },
  writeBatch: vi.fn()
}));

firestoreMocks.writeBatch.mockReturnValue(firestoreMocks.batch);

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: firestoreMocks.doc,
  updateDoc: firestoreMocks.updateDoc,
  setDoc: firestoreMocks.setDoc,
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

const { createCategory, deleteCategory, markOverdueBills, payBill, reconcileAccountBalance, recordRecurringPayment, recurringOccurrenceTransactionId, updateBill, updateCategory } = await import(
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

  it('branch de cartão: chama addCardPurchaseToBatch com transactionId determinístico e marca recurringId (anti-duplicidade + protege contra clique duplo)', async () => {
    cardServiceMocks.addCardPurchaseToBatch.mockClear();
    const ruleWithCard = rule({ cardId: 'card-1' });
    const expectedId = recurringOccurrenceTransactionId(ruleWithCard.id, ruleWithCard.nextOccurrenceAt.toDate());

    await recordRecurringPayment('workspace-1', 'user-1', ruleWithCard, {});

    // `recurringId` marca a compra como vinda desta recorrência — é o que o Comprometido
    // usa pra descontar a cobrança da fatura e não contar a assinatura duas vezes.
    expect(cardServiceMocks.addCardPurchaseToBatch).toHaveBeenCalledWith(
      firestoreMocks.batch,
      'workspace-1',
      'user-1',
      expect.objectContaining({ cardId: 'card-1', installments: 1 }),
      { transactionId: expectedId, recurringId: ruleWithCard.id }
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

describe('reconcileAccountBalance', () => {
  it('banco maior: cria adjustment pela diferença e credita o saldo (efeito +delta)', () => {
    firestoreMocks.batch.set.mockClear();
    firestoreMocks.batch.update.mockClear();

    // Caso real: app em 705,91, banco em 707,35 (rendimento não lançado) → +1,44.
    const result = reconcileAccountBalance('workspace-1', 'user-1', {
      accountId: 'acct-1',
      currentBalanceCents: 70591,
      targetBalanceCents: 70735
    });

    expect(result).toEqual({ applied: true, deltaCents: 144 });
    const [, payload] = firestoreMocks.batch.set.mock.calls[0];
    expect(payload).toEqual(
      expect.objectContaining({ type: 'adjustment', amountCents: 144, accountId: 'acct-1', tags: ['acerto'] })
    );
    // efeito de saldo: 1 update na conta (increment). adjustment credita.
    expect(firestoreMocks.batch.update).toHaveBeenCalledTimes(1);
    expect(firestoreMocks.batch.commit).toHaveBeenCalled();
  });

  it('banco menor: cria expense pela diferença absoluta e debita o saldo', () => {
    firestoreMocks.batch.set.mockClear();
    firestoreMocks.batch.update.mockClear();

    const result = reconcileAccountBalance('workspace-1', 'user-1', {
      accountId: 'acct-1',
      currentBalanceCents: 80000,
      targetBalanceCents: 79000
    });

    expect(result).toEqual({ applied: true, deltaCents: -1000 });
    const [, payload] = firestoreMocks.batch.set.mock.calls[0];
    // amountCents sempre positivo (a regra do Firestore exige >= 0); a direção vem do tipo.
    expect(payload).toEqual(expect.objectContaining({ type: 'expense', amountCents: 1000, accountId: 'acct-1' }));
    expect(firestoreMocks.batch.update).toHaveBeenCalledTimes(1);
  });

  it('saldo já bate: não grava nada e reporta applied=false', () => {
    firestoreMocks.batch.set.mockClear();
    firestoreMocks.batch.update.mockClear();

    const result = reconcileAccountBalance('workspace-1', 'user-1', {
      accountId: 'acct-1',
      currentBalanceCents: 50000,
      targetBalanceCents: 50000
    });

    expect(result).toEqual({ applied: false, deltaCents: 0 });
    expect(firestoreMocks.batch.set).not.toHaveBeenCalled();
    expect(firestoreMocks.batch.update).not.toHaveBeenCalled();
  });
});

/**
 * Subcategorias: a herança de cor é **copiada na gravação** e propagada quando o pai muda.
 *
 * Estes testes existem por um motivo específico: a propagação falhando é **silenciosa**. Nada
 * quebra, nenhum erro aparece — a filha só fica com a cor velha do pai. Foi apontado como o gap
 * crítico do plano (`docs/planning/SUBCATEGORIAS.md`).
 */
describe('createCategory — herança de cor', () => {
  it('copia a cor do pai, ignorando a cor recebida', () => {
    firestoreMocks.setDoc.mockClear();

    void createCategory('workspace-1', 'alice', {
      name: 'Energia',
      icon: 'zap',
      type: 'expense',
      color: ACCENT_FOREGROUND, // seria ignorada: quem manda é o pai
      parent: { id: 'casa', color: defaultCategoryColors.expense_home }
    });

    const payload = firestoreMocks.setDoc.mock.calls[0][1];
    expect(payload.color).toBe(defaultCategoryColors.expense_home);
    expect(payload.parentCategoryId).toBe('casa');
  });

  it('usa a cor escolhida quando não há pai, e não grava parentCategoryId', () => {
    firestoreMocks.setDoc.mockClear();

    void createCategory('workspace-1', 'alice', {
      name: 'Transporte',
      icon: 'car',
      type: 'expense',
      color: defaultCategoryColors.expense_transport
    });

    const payload = firestoreMocks.setDoc.mock.calls[0][1];
    expect(payload.color).toBe(defaultCategoryColors.expense_transport);
    expect('parentCategoryId' in payload).toBe(false);
  });

  // Categoria embutida não tem `color` própria — a cor vem do mapa por id. Se o pai for uma
  // dessas, a filha precisa herdar a cor RESOLVIDA, não `undefined`.
  it('resolve a cor de um pai embutido sem campo color', () => {
    firestoreMocks.setDoc.mockClear();

    void createCategory('workspace-1', 'alice', {
      name: 'Energia',
      icon: 'zap',
      type: 'expense',
      parent: { id: 'expense_home' } // Casa embutida: cor vem de defaultCategoryColors
    });

    expect(firestoreMocks.setDoc.mock.calls[0][1].color).toBe(defaultCategoryColors.expense_home);
  });
});

describe('updateCategory — propagação de cor pras filhas', () => {
  it('atualiza pai e TODAS as filhas no mesmo batch quando a cor muda', () => {
    firestoreMocks.batch.update.mockClear();
    firestoreMocks.batch.commit.mockClear();
    firestoreMocks.updateDoc.mockClear();

    void updateCategory('workspace-1', 'casa', { color: defaultCategoryColors.income_salary }, {
      children: [{ id: 'energia' }, { id: 'agua' }]
    });

    // 1 pai + 2 filhas, num commit só — atômico e offline-safe.
    expect(firestoreMocks.batch.update).toHaveBeenCalledTimes(3);
    expect(firestoreMocks.batch.commit).toHaveBeenCalledTimes(1);
    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();

    const coresGravadas = firestoreMocks.batch.update.mock.calls.map((c) => c[1].color);
    expect(coresGravadas).toEqual(Array(3).fill(defaultCategoryColors.income_salary));
  });

  it('NÃO propaga quando só o nome muda', () => {
    firestoreMocks.batch.update.mockClear();
    firestoreMocks.updateDoc.mockClear();

    void updateCategory('workspace-1', 'casa', { name: 'Moradia' }, {
      children: [{ id: 'energia' }, { id: 'agua' }]
    });

    expect(firestoreMocks.batch.update).not.toHaveBeenCalled();
    expect(firestoreMocks.updateDoc).toHaveBeenCalledTimes(1);
  });

  it('usa updateDoc simples quando a categoria não tem filhas', () => {
    firestoreMocks.batch.update.mockClear();
    firestoreMocks.updateDoc.mockClear();

    void updateCategory('workspace-1', 'transporte', { color: defaultCategoryColors.both_transfer });

    expect(firestoreMocks.updateDoc).toHaveBeenCalledTimes(1);
    expect(firestoreMocks.batch.update).not.toHaveBeenCalled();
  });

  it('limpa parentCategoryId com deleteField ao promover a categoria principal', () => {
    firestoreMocks.updateDoc.mockClear();

    void updateCategory('workspace-1', 'energia', { parentCategoryId: null });

    expect(firestoreMocks.updateDoc.mock.calls[0][1].parentCategoryId).toEqual(deleteField());
  });

  it('não toca em parentCategoryId quando não é informado', () => {
    firestoreMocks.updateDoc.mockClear();

    void updateCategory('workspace-1', 'energia', { name: 'Luz' });

    expect('parentCategoryId' in firestoreMocks.updateDoc.mock.calls[0][1]).toBe(false);
  });
});

/**
 * Regressão do bug achado pelo dono em produção (30/07/2026): ele excluiu uma categoria que tinha
 * limite de gasto, e o limite continuou vivo. Como `Budget.id === categoryId` e a tela de
 * orçamentos lista CATEGORIAS (não orçamentos), a categoria excluída ficava lá pra sempre — e
 * apagar o limite não a removia da lista, porque a linha vinha da categoria.
 */
describe('deleteCategory — leva o orçamento junto', () => {
  it('desativa a categoria E apaga o orçamento dela no mesmo batch', () => {
    firestoreMocks.batch.update.mockClear();
    firestoreMocks.batch.delete.mockClear();
    firestoreMocks.batch.commit.mockClear();

    void deleteCategory('ws-1', 'cat-alimentacao');

    expect(firestoreMocks.batch.update).toHaveBeenCalledTimes(1);
    expect(firestoreMocks.batch.update.mock.calls[0][1]).toMatchObject({ isActive: false });
    // O limite some de verdade (delete), não vira outro registro inativo pra alguém tropeçar.
    expect(firestoreMocks.batch.delete).toHaveBeenCalledTimes(1);
    expect(firestoreMocks.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('é um batch só — categoria e orçamento nunca ficam em estados diferentes', () => {
    firestoreMocks.batch.commit.mockClear();

    void deleteCategory('ws-1', 'cat-sem-orcamento');

    // `delete` em doc inexistente é no-op no Firestore: não precisa checar antes se havia limite.
    expect(firestoreMocks.batch.commit).toHaveBeenCalledTimes(1);
  });
});
