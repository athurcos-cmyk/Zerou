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
  get: () => Promise<{ docs: FakeDoc[] }>;
}

function fakeDoc(id: string, record: Record<string, unknown>): FakeDoc {
  return { id, data: () => record };
}

function fakeQuery(docs: FakeDoc[]): FakeCollection {
  const self: FakeCollection = {
    docs,
    get: async () => ({ docs }),
  };
  self.where = () => self;
  return self;
}

// Mock DB: maps collection path -> docs. Since where() is a no-op in the mock,
// all queries to the same path return the same docs. For account balance sub-queries
// (which query transactions with accountId filter), we share the same transactions array.
// Set up test data with matching accountId so balance calculation is coherent.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockDb(collections: Record<string, FakeDoc[]>): any {
  return {
    collection: (path: string) => {
      const docs = collections[path] ?? [];
      return fakeQuery(docs);
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
    const db = mockDb({
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

    const context = await buildFinancialContext(db, 'ws1');

    expect(context).toContain('Alimentacao');
    expect(context).toContain('Transporte');
    expect(context).toContain('Carteira');
    expect(context).toContain('RESUMO');
    expect(context).toMatch(/R\$\s*50[,.]00/);
  });

  it('counts card_purchase transactions as spending', async () => {
    const db = mockDb({
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

    const context = await buildFinancialContext(db, 'ws1');

    expect(context).toMatch(/R\$\s*45[,.]00/);
    expect(context).toContain('Alimentacao');
  });

  it('falls back with || when competenceMonth is empty string', async () => {
    const db = mockDb({
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

    const context = await buildFinancialContext(db, 'ws1');
    expect(context).toMatch(/R\$\s*12[,.]34/);
  });

  it('skips deleted transactions', async () => {
    const db = mockDb({
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

    const context = await buildFinancialContext(db, 'ws1');
    expect(context).not.toMatch(/R\$\s*99[,.]99/);
  });

  it('includes upcoming bills in committed section', async () => {
    const tomorrow = makeDateFuture(1);
    const db = mockDb({
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

    const context = await buildFinancialContext(db, 'ws1');
    expect(context).toContain('Aluguel');
    expect(context).toContain('COMPROMETIDO');
    expect(context).toMatch(/R\$\s*1[.]?500[,.]00/);
  });

  it('includes overdue bills', async () => {
    const yesterday = makeDate(1);
    const db = mockDb({
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

    const context = await buildFinancialContext(db, 'ws1');
    expect(context).toContain('Conta vencida');
    expect(context).toContain('VENCIDA');
  });

  it('includes recurring rules as despesas fixas', async () => {
    const nextWeek = makeDateFuture(7);
    const db = mockDb({
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

    const context = await buildFinancialContext(db, 'ws1');
    expect(context).toContain('Netflix');
    expect(context).toContain('Despesas fixas');
    expect(context).toMatch(/R\$\s*39[,.]90/);
  });

  it('includes total comprometido', async () => {
    const tomorrow = makeDateFuture(1);
    const nextWeek = makeDateFuture(7);
    const db = mockDb({
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

    const context = await buildFinancialContext(db, 'ws1');

    // Should show the committed total: 120000 + 3990 = 123990
    expect(context).toContain('Total comprometido');
    expect(context).toMatch(/R\$\s*1[.]?239[,.]90/);
  });

  it('includes account balances', async () => {
    const db = mockDb({
      ...emptyCollections,
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [
        fakeDoc('txn1', {
          type: 'expense', amountCents: 3000, accountId: 'acct1',
          categoryId: undefined, competenceMonth: currentMonth,
          date: Timestamp.fromDate(makeDate(1)),
        }),
      ],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [
        fakeDoc('acct1', { id: 'acct1', name: 'Carteira', type: 'wallet', isActive: true, openingBalanceCents: 50000 }),
      ],
    });

    const context = await buildFinancialContext(db, 'ws1');

    // Balance = 50000 - 3000 = 47000
    expect(context).toContain('Carteira');
    expect(context).toMatch(/R\$\s*470[,.]00/);
  });

  it('handles empty workspace gracefully', async () => {
    const db = mockDb({
      ...emptyCollections,
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [],
    });

    const context = await buildFinancialContext(db, 'ws1');
    expect(context).toContain('RESUMO');
    expect(context).toContain('COMPROMETIDO');
  });

  it('skips bills with null dueDate instead of crashing', async () => {
    const db = mockDb({
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

    const context = await buildFinancialContext(db, 'ws1');
    expect(context).toContain('Conta com data');
    expect(context).not.toContain('Conta sem data');
  });
});
