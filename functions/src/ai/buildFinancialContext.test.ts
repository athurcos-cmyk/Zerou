import { describe, expect, it } from 'vitest';
import { buildFinancialContext } from './buildFinancialContext.js';
import { Timestamp } from 'firebase-admin/firestore';

function makeDate(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
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
  where?: (field: string, op: string, value: unknown) => FakeCollection;
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

  it('builds context with spending and categories', async () => {
    const db = mockDb({
      'workspaces/ws1/categories': [
        fakeDoc('cat_alimentacao', { id: 'cat_alimentacao', name: 'Alimentação', isActive: true }),
        fakeDoc('cat_transporte', { id: 'cat_transporte', name: 'Transporte', isActive: true }),
      ],
      'workspaces/ws1/transactions': [
        fakeDoc('txn1', {
          type: 'expense',
          amountCents: 5000,
          categoryId: 'cat_alimentacao',
          competenceMonth: currentMonth,
          date: Timestamp.fromDate(makeDate(1)),
        }),
        fakeDoc('txn2', {
          type: 'expense',
          amountCents: 2000,
          categoryId: 'cat_transporte',
          competenceMonth: currentMonth,
          date: Timestamp.fromDate(makeDate(2)),
        }),
        fakeDoc('txn3', {
          type: 'expense',
          amountCents: 3000,
          categoryId: 'cat_alimentacao',
          competenceMonth: prevMonth,
          date: Timestamp.fromDate(makeDate(35)),
        }),
      ],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [
        fakeDoc('acct1', { id: 'acct1', name: 'Carteira', type: 'wallet', isActive: true, openingBalanceCents: 10000 }),
      ],
    });

    const context = await buildFinancialContext(db, 'ws1');

    expect(context).toContain('Alimentação');
    expect(context).toContain('Transporte');
    expect(context).toMatch(/R\$\s*50[,.]00/);
    expect(context).toMatch(/R\$\s*20[,.]00/);
    expect(context).toContain('Carteira');
  });

  it('skips deleted transactions', async () => {
    const db = mockDb({
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [
        fakeDoc('txn1', {
          type: 'expense',
          amountCents: 9999,
          categoryId: undefined,
          competenceMonth: currentMonth,
          date: Timestamp.fromDate(makeDate(1)),
          deletedAt: Timestamp.fromDate(makeDate(0)),
        }),
      ],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [],
    });

    const context = await buildFinancialContext(db, 'ws1');

    expect(context).not.toMatch(/R\$\s*99[,.]99/);
    expect(context).toContain('Nenhum gasto');
  });

  it('includes upcoming bills', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const db = mockDb({
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [],
      'workspaces/ws1/bills': [
        fakeDoc('bill1', {
          description: 'Aluguel',
          amountCents: 150000,
          status: 'pending',
          dueDate: Timestamp.fromDate(tomorrow),
        }),
      ],
      'workspaces/ws1/accounts': [],
    });

    const context = await buildFinancialContext(db, 'ws1');

    expect(context).toContain('Aluguel');
    expect(context).toMatch(/R\$\s*1[.]?500[,.]00/);
  });

  it('handles empty workspace gracefully', async () => {
    const db = mockDb({
      'workspaces/ws1/categories': [],
      'workspaces/ws1/transactions': [],
      'workspaces/ws1/bills': [],
      'workspaces/ws1/accounts': [],
    });

    const context = await buildFinancialContext(db, 'ws1');

    expect(context).toContain('Nenhum gasto');
    expect(context).toContain('Nenhuma conta');
  });
});
