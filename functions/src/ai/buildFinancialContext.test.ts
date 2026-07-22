import { describe, expect, it } from 'vitest';
import { buildFinancialContext } from './buildFinancialContext.js';
import { Timestamp } from 'firebase-admin/firestore';

function makeDate(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d;
}

function makeDateFuture(daysAhead: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

interface FakeDoc {
  id: string;
  data: () => Record<string, unknown>;
}

interface FakeCollection {
  docs: FakeDoc[];
  where?: () => FakeCollection;
  limit?: () => FakeCollection;
  get: () => Promise<{ docs: FakeDoc[]; empty: boolean }>;
}

function fakeDoc(id: string, record: Record<string, unknown>): FakeDoc {
  return { id, data: () => record };
}

function fakeQuery(docs: FakeDoc[]): FakeCollection {
  const self: FakeCollection = {
    docs,
    get: async () => ({ docs, empty: docs.length === 0 }),
  };
  self.where = () => self;
  self.limit = () => self;
  return self;
}

// Mock DB: maps collection path -> docs. Since where() is a no-op in the mock,
// all queries to the same path return the same docs. For account balance sub-queries
// (which query transactions with accountId filter), we share the same transactions array.
// Set up test data with matching accountId so balance calculation is coherent.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockDb(docs: Record<string, Record<string, unknown>>, collections: Record<string, FakeDoc[]>): any {
  return {
    doc: (path: string) => {
      const data = docs[path];
      return {
        get: async () => ({
          exists: data !== undefined,
          data: () => data ?? {},
        }),
      };
    },
    collection: (path: string) => {
      const colDocs = collections[path] ?? [];
      return fakeQuery(colDocs);
    },
  };
}

describe('buildFinancialContext', () => {
  const now = new Date();
  const currentMonth = monthKey(now);
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = monthKey(prevMonthDate);

  const emptyCollections = {
    'workspaces/ws1/recurring': [],
    'workspaces/ws1/cards': [],
  };

  it('builds context with spending, categories, and balance', async () => {
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [
        fakeDoc('cat_alimentacao', { id: 'cat_alimentacao', name: 'Alimentacao', isActive: true }),
        fakeDoc('cat_transporte', { id: 'cat_transporte', name: 'Transporte', isActive: true }),
      ],
      'workspaces/ws1/transactions': [
        fakeDoc('txn1', {
          type: 'expense', amountCents: 5000, accountId: 'acct1',
          categoryId: 'cat_alimentacao', competenceMonth: currentMonth,
          date: Timestamp.fromDate(makeDate(1)),
        }),
        fakeDoc('txn2', {
          type: 'expense', amountCents: 2000, accountId: 'acct1',
          categoryId: 'cat_transporte', competenceMonth: currentMonth,
          date: Timestamp.fromDate(makeDate(2)),
        }),
        fakeDoc('txn3', {
          type: 'expense', amountCents: 3000, accountId: 'acct1',
          categoryId: 'cat_alimentacao', competenceMonth: prevMonth,
          date: Timestamp.fromDate(makeDate(35)),
        }),
      ],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [
        fakeDoc('acct1', { id: 'acct1', name: 'Carteira', type: 'wallet', isActive: true, openingBalanceCents: 50000 }),
      ],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');

    expect(context).toContain('Alimentacao');
    expect(context).toContain('Transporte');
    expect(context).toContain('Carteira');
    expect(context).toContain('RESUMO');
    expect(context).toMatch(/R\$\s*50[,.]00/);
  });

  it('counts card_purchase transactions as spending', async () => {
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [
        fakeDoc('cat_alimentacao', { id: 'cat_alimentacao', name: 'Alimentacao', isActive: true }),
      ],
      'workspaces/ws1/transactions': [
        fakeDoc('txn1', {
          type: 'card_purchase', amountCents: 4500, accountId: undefined,
          categoryId: 'cat_alimentacao', competenceMonth: currentMonth,
          date: Timestamp.fromDate(makeDate(1)),
        }),
      ],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');

    expect(context).toMatch(/R\$\s*45[,.]00/);
    expect(context).toContain('Alimentacao');
  });

  it('falls back with || when competenceMonth is empty string', async () => {
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [
        fakeDoc('txn1', {
          type: 'expense', amountCents: 1234, accountId: undefined,
          categoryId: '', competenceMonth: '', cashMonth: '',
          date: Timestamp.fromDate(makeDate(1)),
        }),
      ],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).toMatch(/R\$\s*12[,.]34/);
  });

  it('skips deleted transactions', async () => {
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [
        fakeDoc('txn1', {
          type: 'expense', amountCents: 9999, accountId: undefined,
          categoryId: undefined, competenceMonth: currentMonth,
          date: Timestamp.fromDate(makeDate(1)),
          deletedAt: Timestamp.fromDate(makeDate(0)),
        }),
      ],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).not.toMatch(/R\$\s*99[,.]99/);
  });

  it('includes upcoming bills in committed section', async () => {
    const tomorrow = makeDateFuture(1);
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [],
      'workspaces/ws1/bills': [
        fakeDoc('bill1', {
          description: 'Aluguel', amountCents: 150000, status: 'pending',
          dueDate: Timestamp.fromDate(tomorrow),
        }),
      ],
      'workspaces/ws1/accounts': [],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).toContain('Aluguel');
    expect(context).toContain('COMPROMETIDO');
    expect(context).toMatch(/R\$\s*1[.]?500[,.]00/);
  });

  it('includes overdue bills', async () => {
    const yesterday = makeDate(1);
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [],
      'workspaces/ws1/bills': [
        fakeDoc('bill_overdue', {
          description: 'Conta vencida', amountCents: 8000, status: 'overdue',
          dueDate: Timestamp.fromDate(yesterday),
        }),
      ],
      'workspaces/ws1/accounts': [],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).toContain('Conta vencida');
    expect(context).toContain('VENCIDA');
  });

  it('includes recurring rules in contas a pagar', async () => {
    const nextWeek = makeDateFuture(7);
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/recurring': [
        fakeDoc('rec1', {
          id: 'rec1', description: 'Netflix', amountCents: 3990,
          frequency: 'monthly', nextOccurrenceAt: Timestamp.fromDate(nextWeek),
          isActive: true,
        }),
      ],
      'workspaces/ws1/cards': [],
      'workspaces/ws1/accounts': [],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).toContain('Netflix');
    expect(context).toContain('se repete');
    expect(context).toMatch(/R\$\s*39[,.]90/);
  });

  it('includes total comprometido', async () => {
    const tomorrow = makeDateFuture(1);
    const nextWeek = makeDateFuture(7);
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [],
      'workspaces/ws1/bills': [
        fakeDoc('bill1', {
          description: 'Aluguel', amountCents: 120000, status: 'pending',
          dueDate: Timestamp.fromDate(tomorrow),
        }),
      ],
      'workspaces/ws1/recurring': [
        fakeDoc('rec1', {
          id: 'rec1', description: 'Netflix', amountCents: 3990,
          frequency: 'monthly', nextOccurrenceAt: Timestamp.fromDate(nextWeek),
          isActive: true,
        }),
      ],
      'workspaces/ws1/cards': [],
      'workspaces/ws1/accounts': [
        fakeDoc('acct1', { id: 'acct1', name: 'Carteira', type: 'wallet', isActive: true, openingBalanceCents: 200000 }),
      ],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');

    // Should show the committed total: 120000 + 3990 = 123990
    expect(context).toContain('Total comprometido');
    expect(context).toMatch(/R\$\s*1[.]?239[,.]90/);
  });

  it('includes account balances lidos de currentBalanceCents (mantido incrementalmente)', async () => {
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [
        fakeDoc('acct1', {
          id: 'acct1', name: 'Carteira', type: 'wallet', isActive: true,
          openingBalanceCents: 50000, currentBalanceCents: 47000,
        }),
      ],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');

    expect(context).toContain('Carteira');
    expect(context).toMatch(/R\$\s*470[,.]00/);
  });

  it('cai pro openingBalanceCents quando currentBalanceCents ainda não existe (pré-backfill)', async () => {
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [
        fakeDoc('acct1', { id: 'acct1', name: 'Carteira', type: 'wallet', isActive: true, openingBalanceCents: 50000 }),
      ],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');

    expect(context).toContain('Carteira');
    expect(context).toMatch(/R\$\s*500[,.]00/);
  });

  it('handles empty workspace gracefully', async () => {
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).toContain('RESUMO');
    expect(context).toContain('COMPROMETIDO');
  });

  it('skips bills with null dueDate instead of crashing', async () => {
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [],
      'workspaces/ws1/bills': [
        fakeDoc('bill_null', {
          description: 'Conta sem data', amountCents: 5000, status: 'pending',
          dueDate: null,
        }),
        fakeDoc('bill_ok', {
          description: 'Conta com data', amountCents: 10000, status: 'pending',
          dueDate: Timestamp.fromDate(makeDateFuture(1)),
        }),
      ],
      'workspaces/ws1/accounts': [],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).toContain('Conta com data');
    expect(context).not.toContain('Conta sem data');
  });

  it('includes payday info from user profile', async () => {
    const db = mockDb(
      { 'users/user1': { payday: { type: 'fixed_day', day: 5 }, availableMode: 'until_payday', committedWindowDays: 30 } },
      {
        ...emptyCollections,
        'workspaces/ws1/categories': [],
        'workspaces/ws1/transactions': [],
        'workspaces/ws1/bills': [],
        'workspaces/ws1/accounts': [],
      },
    );

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).toContain('SEU CICLO');
    expect(context).toContain('Recebe dia 5');
  });

  it('includes the declared onboarding goal/challenge in SEU CICLO, translated to a readable label', async () => {
    const db = mockDb(
      { 'users/user1': { onboardingGoal: 'metas', onboardingChallenge: 'prazos' } },
      {
        ...emptyCollections,
        'workspaces/ws1/categories': [],
        'workspaces/ws1/transactions': [],
        'workspaces/ws1/bills': [],
        'workspaces/ws1/accounts': [],
      },
    );

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).toContain('SEU CICLO');
    expect(context).toContain('Objetivo declarado: definir metas para guardar dinheiro.');
    expect(context).toContain('Maior desafio declarado: esquecer de pagar contas no prazo.');
  });

  it('ignores an unknown/stale onboarding answer id instead of leaking the raw id into the context', async () => {
    const db = mockDb(
      { 'users/user1': { onboardingGoal: 'algum-id-antigo-removido' } },
      {
        ...emptyCollections,
        'workspaces/ws1/categories': [],
        'workspaces/ws1/transactions': [],
        'workspaces/ws1/bills': [],
        'workspaces/ws1/accounts': [],
      },
    );

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).not.toContain('Objetivo declarado');
    expect(context).not.toContain('algum-id-antigo-removido');
  });

  it('handles missing user profile gracefully', async () => {
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).toContain('RESUMO');
    expect(context).not.toContain('SEU CICLO');
  });

  it('usa o cutoff real (não mais 30 dias fixo): uma receita futura já lançada estende o Comprometido além de 30 dias', async () => {
    // Achado do /plan-eng-review: buildFinancialContext usava uma janela fixa de 30 dias,
    // ignorando o AvailableMode/receita futura já lançada — divergindo do Dashboard
    // (resolveCommittedCutoff). Uma conta vencendo em 45 dias, com renda lançada em 50
    // dias, precisa contar como comprometido (o Dashboard já faz isso).
    const in45Days = makeDateFuture(45);
    const in50Days = makeDateFuture(50);
    const db = mockDb(
      { 'users/user1': { availableMode: 'until_payday' } },
      {
        ...emptyCollections,
        'workspaces/ws1/categories': [],
        'workspaces/ws1/transactions': [
          fakeDoc('txn_income', { type: 'income', amountCents: 300000, date: Timestamp.fromDate(in50Days) }),
        ],
        'workspaces/ws1/bills': [
          fakeDoc('bill_far', { description: 'IPVA', amountCents: 90000, status: 'pending', dueDate: Timestamp.fromDate(in45Days) }),
        ],
        'workspaces/ws1/accounts': [],
      },
    );

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).toContain('IPVA');
    expect(context).toContain('Tem uma receita futura ja lancada');
  });

  it('conta vencendo depois da receita futura já lançada NÃO entra no Comprometido', async () => {
    const in50Days = makeDateFuture(50);
    const in60Days = makeDateFuture(60);
    const db = mockDb(
      { 'users/user1': { availableMode: 'until_payday' } },
      {
        ...emptyCollections,
        'workspaces/ws1/categories': [],
        'workspaces/ws1/transactions': [
          fakeDoc('txn_income', { type: 'income', amountCents: 300000, date: Timestamp.fromDate(in50Days) }),
        ],
        'workspaces/ws1/bills': [
          fakeDoc('bill_far', { description: 'Seguro Anual', amountCents: 50000, status: 'pending', dueDate: Timestamp.fromDate(in60Days) }),
        ],
        'workspaces/ws1/accounts': [],
      },
    );

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).not.toContain('Seguro Anual');
  });

  it('modo conservador respeita committedWindowDays do perfil, não 30 dias fixo', async () => {
    const in20Days = makeDateFuture(20);
    const db = mockDb(
      { 'users/user1': { availableMode: 'conservative', committedWindowDays: 10 } },
      {
        ...emptyCollections,
        'workspaces/ws1/categories': [],
        'workspaces/ws1/transactions': [],
        'workspaces/ws1/bills': [
          fakeDoc('bill_20d', { description: 'Fatura anual', amountCents: 30000, status: 'pending', dueDate: Timestamp.fromDate(in20Days) }),
        ],
        'workspaces/ws1/accounts': [],
      },
    );

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).not.toContain('Fatura anual');
    expect(context).toContain('Janela de 10 dias');
  });

  it('fatura de cartão em aberto vencendo além do cutoff NÃO entra no Comprometido', async () => {
    // Antes desta correção, toda fatura com saldo devedor entrava incondicionalmente —
    // agora só entra se `closed` (sempre) ou o vencimento real cair até o cutoff.
    const in90Days = makeDateFuture(90);
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [],
      'workspaces/ws1/cards': [fakeDoc('card1', { name: 'Nubank' })],
      'workspaces/ws1/cards/card1/invoices': [
        fakeDoc('inv_far', {
          cardId: 'card1', referenceMonth: '2027-01', status: 'open',
          outstandingBalanceCents: 40000, dueDate: Timestamp.fromDate(in90Days),
        }),
      ],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).not.toContain('Nubank');
    expect(context).not.toMatch(/R\$\s*400[,.]00/);
  });

  it('fatura fechada sempre entra no Comprometido, mesmo com vencimento além do cutoff', async () => {
    const in90Days = makeDateFuture(90);
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [],
      'workspaces/ws1/cards': [fakeDoc('card1', { name: 'Nubank' })],
      'workspaces/ws1/cards/card1/invoices': [
        fakeDoc('inv_closed', {
          cardId: 'card1', referenceMonth: '2027-01', status: 'closed',
          outstandingBalanceCents: 40000, dueDate: Timestamp.fromDate(in90Days),
        }),
      ],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).toContain('Nubank');
    expect(context).toMatch(/R\$\s*400[,.]00/);
  });

  it('includes budget progress with percentage', async () => {
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [
        fakeDoc('cat_mercado', { id: 'cat_mercado', name: 'Mercado', isActive: true }),
      ],
      'workspaces/ws1/transactions': [
        fakeDoc('txn1', {
          type: 'expense', amountCents: 40000, accountId: 'acct1',
          categoryId: 'cat_mercado', competenceMonth: currentMonth,
          date: Timestamp.fromDate(makeDate(1)),
        }),
      ],
      'workspaces/ws1/budgets': [
        fakeDoc('cat_mercado', { id: 'cat_mercado', categoryId: 'cat_mercado', limitCents: 100000, isActive: true }),
      ],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [
        fakeDoc('acct1', { id: 'acct1', name: 'Carteira', type: 'wallet', isActive: true, openingBalanceCents: 100000 }),
      ],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).toContain('ORCAMENTOS');
    expect(context).toContain('Mercado');
    expect(context).toContain('40%');
  });

  it('includes goals with progress', async () => {
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [],
      'workspaces/ws1/goals': [
        fakeDoc('goal1', { id: 'goal1', name: 'Viagem', kind: 'save', targetCents: 300000, savedCents: 150000, isActive: true }),
      ],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).toContain('METAS');
    expect(context).toContain('Viagem');
    expect(context).toContain('50%');
  });

  it('includes 6-month trend when data exists', async () => {
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [
        fakeDoc('cat_alimentacao', { id: 'cat_alimentacao', name: 'Alimentacao', isActive: true }),
      ],
      'workspaces/ws1/transactions': [
        fakeDoc('txn1', {
          type: 'expense', amountCents: 5000, accountId: 'acct1',
          categoryId: 'cat_alimentacao', competenceMonth: currentMonth,
          date: Timestamp.fromDate(makeDate(1)),
        }),
        fakeDoc('txn2', {
          type: 'expense', amountCents: 3000, accountId: 'acct1',
          categoryId: 'cat_alimentacao', competenceMonth: prevMonth,
          date: Timestamp.fromDate(makeDate(35)),
        }),
      ],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [
        fakeDoc('acct1', { id: 'acct1', name: 'Carteira', type: 'wallet', isActive: true, openingBalanceCents: 50000 }),
      ],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).toContain('TENDENCIA');
  });

  it('includes couple goals when couple workspace exists', async () => {
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/goals': [],
      'workspaces/ws1/accounts': [],
      'users/user1/workspaceRefs': [
        fakeDoc('couple_ws', { status: 'active', type: 'couple' }),
      ],
      'workspaces/couple_ws/goals': [
        fakeDoc('goal_couple', { id: 'goal_couple', name: 'Casa nova', kind: 'save', targetCents: 5000000, savedCents: 1250000, isActive: true }),
      ],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).toContain('CASAL');
    expect(context).toContain('Casa nova');
    expect(context).toContain('25%');
  });

  it('does not include couple section when no couple workspace', async () => {
    const db = mockDb({}, {
      ...emptyCollections,
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [],
      'users/user1/workspaceRefs': [],
    });

    const context = await buildFinancialContext(db, 'ws1', 'user1');
    expect(context).not.toContain('CASAL');
  });
});
