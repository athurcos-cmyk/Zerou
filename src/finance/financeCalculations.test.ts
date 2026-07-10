import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  buildUpcomingCommitments,
  calculateAccountBalances,
  calculateDashboardSummary,
  calculateTotalBalance,
  findNextIncomeDate
} from './financeCalculations';
import type { Account, Bill, Invoice, RecurringRule, Transaction } from '../types/contracts';

function account(id: string, openingBalanceCents = 0, overrides: Partial<Account> = {}): Account {
  return {
    id,
    workspaceId: 'workspaceA',
    name: id,
    type: 'checking',
    openingBalanceCents,
    isActive: true,
    createdBy: 'alice',
    ...overrides
  };
}

function transaction(overrides: Partial<Transaction>): Transaction {
  const date = Timestamp.fromDate(new Date('2026-06-14T12:00:00'));

  return {
    id: overrides.id ?? `tx-${Math.random()}`,
    workspaceId: 'workspaceA',
    createdBy: 'alice',
    updatedBy: 'alice',
    type: overrides.type ?? 'expense',
    amountCents: overrides.amountCents ?? 0,
    description: overrides.description ?? 'Movimento',
    accountId: 'accountId' in overrides ? overrides.accountId : 'checking',
    destinationAccountId: overrides.destinationAccountId,
    cardId: overrides.cardId,
    invoiceId: overrides.invoiceId,
    date: overrides.date ?? date,
    competenceMonth: overrides.competenceMonth ?? '2026-06',
    cashMonth: overrides.cashMonth ?? '2026-06',
    tags: overrides.tags ?? [],
    isRecurring: false,
    clientMutationId: overrides.clientMutationId ?? 'mutation-id',
    syncStatus: 'synced',
    version: 1,
    deletedAt: overrides.deletedAt
  };
}

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: overrides.id ?? 'bill-1',
    workspaceId: 'workspaceA',
    description: overrides.description ?? 'Conta',
    amountCents: overrides.amountCents ?? 10000,
    dueDate: overrides.dueDate ?? Timestamp.fromDate(new Date('2026-06-20T12:00:00')),
    status: overrides.status ?? 'pending',
    createdBy: 'alice',
    ...overrides
  };
}

function recurring(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: overrides.id ?? 'rec-1',
    workspaceId: 'workspaceA',
    description: overrides.description ?? 'Assinatura',
    amountCents: 'amountCents' in overrides ? overrides.amountCents : 5000,
    frequency: overrides.frequency ?? 'monthly',
    nextOccurrenceAt: overrides.nextOccurrenceAt ?? Timestamp.fromDate(new Date('2026-06-18T12:00:00')),
    isActive: overrides.isActive ?? true,
    createdBy: 'alice',
    ...overrides
  };
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: overrides.id ?? 'invoice-1',
    workspaceId: 'workspaceA',
    cardId: 'card-1',
    referenceMonth: overrides.referenceMonth ?? '2026-06',
    dueDate: overrides.dueDate ?? Timestamp.fromDate(new Date('2026-06-10T12:00:00')),
    status: overrides.status ?? 'open',
    outstandingBalanceCents: overrides.outstandingBalanceCents ?? 10000,
    createdBy: 'alice',
    ...overrides
  } as Invoice;
}

describe('financial calculations — movimentação de saldo', () => {
  it('increases balance with income and decreases with expense', () => {
    const total = calculateTotalBalance(
      [account('checking')],
      [
        transaction({ type: 'income', amountCents: 250050, accountId: 'checking' }),
        transaction({ type: 'expense', amountCents: 100025, accountId: 'checking' })
      ]
    );

    expect(total).toBe(150025);
  });

  it('increases balance with refund and reimbursement, like income', () => {
    const total = calculateTotalBalance(
      [account('checking', 10000)],
      [
        transaction({ type: 'refund', amountCents: 2000, accountId: 'checking' }),
        transaction({ type: 'reimbursement', amountCents: 3000, accountId: 'checking' })
      ]
    );

    expect(total).toBe(15000);
  });

  it('keeps consolidated net worth unchanged on transfers', () => {
    const total = calculateTotalBalance(
      [account('checking', 50000), account('wallet', 0)],
      [transaction({ type: 'transfer', amountCents: 12555, accountId: 'checking', destinationAccountId: 'wallet' })]
    );

    expect(total).toBe(50000);
  });

  it('moves money between the two accounts on transfer, not just the consolidated total', () => {
    const balances = calculateAccountBalances(
      [account('checking', 50000), account('wallet', 0)],
      [transaction({ type: 'transfer', amountCents: 12555, accountId: 'checking', destinationAccountId: 'wallet' })]
    );

    expect(balances.find((a) => a.id === 'checking')?.balanceCents).toBe(37445);
    expect(balances.find((a) => a.id === 'wallet')?.balanceCents).toBe(12555);
  });

  it('debits only the source when a transfer has no destination account', () => {
    const balances = calculateAccountBalances(
      [account('checking', 50000)],
      [transaction({ type: 'transfer', amountCents: 10000, accountId: 'checking', destinationAccountId: undefined })]
    );

    expect(balances.find((a) => a.id === 'checking')?.balanceCents).toBe(40000);
  });

  it('applies explicit adjustment and preserves cents (positive and negative)', () => {
    const increased = calculateTotalBalance(
      [account('checking', 10000)],
      [transaction({ type: 'adjustment', amountCents: 199, accountId: 'checking' })]
    );
    const decreased = calculateTotalBalance(
      [account('checking', 10000)],
      [transaction({ type: 'adjustment', amountCents: -199, accountId: 'checking' })]
    );

    expect(increased).toBe(10199);
    expect(decreased).toBe(9801);
  });

  it('ignores logically deleted transactions', () => {
    const total = calculateTotalBalance(
      [account('checking', 10000)],
      [
        transaction({
          type: 'expense',
          amountCents: 9999,
          accountId: 'checking',
          deletedAt: Timestamp.fromDate(new Date('2026-06-15T12:00:00'))
        })
      ]
    );

    expect(total).toBe(10000);
  });

  it('restores the balance when a purchase is deleted after being recorded (create → delete round trip)', () => {
    const purchase = transaction({ id: 'tx-1', type: 'expense', amountCents: 15000, accountId: 'checking' });

    const afterPurchase = calculateTotalBalance([account('checking', 100000)], [purchase]);
    expect(afterPurchase).toBe(85000);

    const afterSoftDelete = calculateTotalBalance(
      [account('checking', 100000)],
      [{ ...purchase, deletedAt: Timestamp.fromDate(new Date('2026-06-16T12:00:00')) }]
    );
    expect(afterSoftDelete).toBe(100000);
  });

  it('reflects only the new amount when a transaction is edited (same id, replaced snapshot)', () => {
    const original = transaction({ id: 'tx-1', type: 'expense', amountCents: 15000, accountId: 'checking' });
    const edited = { ...original, amountCents: 40000 };

    const totalBefore = calculateTotalBalance([account('checking', 100000)], [original]);
    const totalAfter = calculateTotalBalance([account('checking', 100000)], [edited]);

    expect(totalBefore).toBe(85000);
    expect(totalAfter).toBe(60000);
  });

  it('does not reduce cash balance when a card purchase is recorded', () => {
    const total = calculateTotalBalance(
      [account('checking', 100000)],
      [transaction({ type: 'card_purchase', amountCents: 25000, accountId: undefined, cardId: 'cardA', invoiceId: 'invoiceA' })]
    );

    expect(total).toBe(100000);
  });

  it('reduces cash balance once when an invoice payment is recorded', () => {
    const total = calculateTotalBalance(
      [account('checking', 100000)],
      [
        transaction({ type: 'card_purchase', amountCents: 25000, accountId: undefined, cardId: 'cardA', invoiceId: 'invoiceA' }),
        transaction({ type: 'card_payment', amountCents: 25000, accountId: 'checking', cardId: 'cardA', invoiceId: 'invoiceA' })
      ]
    );

    expect(total).toBe(75000);
  });

  it('ignores transactions pointing to an account that no longer exists', () => {
    const total = calculateTotalBalance(
      [account('checking', 10000)],
      [transaction({ type: 'expense', amountCents: 5000, accountId: 'closed-account' })]
    );

    expect(total).toBe(10000);
  });

  it('combines several accounts and mixed transaction types correctly', () => {
    const balances = calculateAccountBalances(
      [account('checking', 100000), account('wallet', 20000), account('savings', 0)],
      [
        transaction({ type: 'income', amountCents: 300000, accountId: 'checking' }),
        transaction({ type: 'expense', amountCents: 50000, accountId: 'checking' }),
        transaction({ type: 'transfer', amountCents: 40000, accountId: 'checking', destinationAccountId: 'savings' }),
        transaction({ type: 'expense', amountCents: 5000, accountId: 'wallet' }),
        transaction({ type: 'adjustment', amountCents: 1000, accountId: 'wallet' }),
        transaction({
          type: 'expense',
          amountCents: 99999,
          accountId: 'checking',
          deletedAt: Timestamp.fromDate(new Date('2026-06-16T12:00:00'))
        })
      ]
    );

    const byId = new Map(balances.map((b) => [b.id, b.balanceCents]));
    expect(byId.get('checking')).toBe(100000 + 300000 - 50000 - 40000);
    expect(byId.get('wallet')).toBe(20000 - 5000 + 1000);
    expect(byId.get('savings')).toBe(0 + 40000);
  });

  it('treats zero-amount transactions as a no-op', () => {
    const total = calculateTotalBalance(
      [account('checking', 10000)],
      [transaction({ type: 'expense', amountCents: 0, accountId: 'checking' })]
    );

    expect(total).toBe(10000);
  });
});

describe('findNextIncomeDate', () => {
  const now = new Date('2026-06-14T12:00:00');

  it('returns the earliest future income among several', () => {
    const next = findNextIncomeDate(
      [
        transaction({ type: 'income', date: Timestamp.fromDate(new Date('2026-07-01T12:00:00')) }),
        transaction({ type: 'income', date: Timestamp.fromDate(new Date('2026-06-20T12:00:00')) }),
        transaction({ type: 'income', date: Timestamp.fromDate(new Date('2026-08-01T12:00:00')) })
      ],
      now
    );

    expect(next?.toISOString().slice(0, 10)).toBe('2026-06-20');
  });

  it('ignores income dates already in the past', () => {
    const next = findNextIncomeDate(
      [transaction({ type: 'income', date: Timestamp.fromDate(new Date('2026-06-01T12:00:00')) })],
      now
    );

    expect(next).toBeNull();
  });

  it('ignores deleted income transactions', () => {
    const next = findNextIncomeDate(
      [
        transaction({
          type: 'income',
          date: Timestamp.fromDate(new Date('2026-06-20T12:00:00')),
          deletedAt: Timestamp.fromDate(new Date('2026-06-15T12:00:00'))
        })
      ],
      now
    );

    expect(next).toBeNull();
  });

  // Antes esta função contava uma receita datada de HOJE como "próximo recebimento".
  // Isso tinha dois problemas: a receita de hoje já está somada no saldo (o saldo não
  // filtra por data), então usá-la como corte encolhia o Comprometido pra "só o que
  // vence hoje"; e, como a comparação era contra o instante `now`, a mesma receita
  // (gravada ao meio-dia) contava de manhã e não contava à tarde. O corte agora é o
  // fim do dia de hoje: só receita de amanhã em diante é "próxima".
  it('does not treat an income dated today as the next income', () => {
    const next = findNextIncomeDate([transaction({ type: 'income', date: Timestamp.fromDate(now) })], now);

    expect(next).toBeNull();
  });
});

describe('buildUpcomingCommitments', () => {
  const cutoff = new Date('2026-07-14T12:00:00');
  const now = new Date('2026-06-14T12:00:00');

  it('includes pending and overdue bills, excludes paid/cancelled', () => {
    const commitments = buildUpcomingCommitments(
      [
        bill({ id: 'b-pending', status: 'pending' }),
        bill({ id: 'b-overdue', status: 'overdue' }),
        bill({ id: 'b-paid', status: 'paid' }),
        bill({ id: 'b-cancelled', status: 'cancelled' })
      ],
      [],
      cutoff
    );

    expect(commitments.map((c) => c.id).sort()).toEqual(['b-overdue', 'b-pending']);
  });

  it('excludes bills due after the cutoff', () => {
    const commitments = buildUpcomingCommitments(
      [bill({ id: 'b-far', dueDate: Timestamp.fromDate(new Date('2026-09-01T12:00:00')) })],
      [],
      cutoff
    );

    expect(commitments).toHaveLength(0);
  });

  it('excludes inactive recurring rules and rules without a forecast amount', () => {
    const commitments = buildUpcomingCommitments(
      [],
      [
        recurring({ id: 'r-inactive', isActive: false }),
        recurring({ id: 'r-no-amount', amountCents: undefined })
      ],
      cutoff
    );

    expect(commitments).toHaveLength(0);
  });

  it('always includes a closed invoice, regardless of reference month', () => {
    const commitments = buildUpcomingCommitments(
      [],
      [],
      cutoff,
      [invoice({ id: 'inv-closed-past', status: 'closed', referenceMonth: '2026-01', outstandingBalanceCents: 5000 })],
      now
    );

    expect(commitments.map((c) => c.id)).toEqual(['inv-closed-past']);
  });

  it('includes an open invoice whose due date falls on or before the cutoff', () => {
    const commitments = buildUpcomingCommitments(
      [],
      [],
      cutoff,
      [
        invoice({ id: 'inv-open-soon', status: 'open', dueDate: Timestamp.fromDate(new Date('2026-07-10T12:00:00')), outstandingBalanceCents: 5000 }),
        invoice({ id: 'inv-open-past-due', status: 'open', dueDate: Timestamp.fromDate(new Date('2026-06-05T12:00:00')), outstandingBalanceCents: 3000 })
      ],
      now
    );

    expect(commitments.map((c) => c.id).sort()).toEqual(['inv-open-past-due', 'inv-open-soon']);
  });

  // Regressão: o critério já foi "referenceMonth <= mês atual" (mês do CICLO da
  // compra). Isso contava uma fatura inteira como comprometida assim que a compra
  // entrava no ciclo — mesmo em cartões que fecham tarde e vencem só no mês
  // seguinte (fecha dia 25, vence dia 5), onde a cobrança de verdade só chega bem
  // depois. Critério agora é a data de vencimento real, igual bills/recorrências.
  it('excludes an open invoice whose real due date falls after the cutoff (future installment or "fecha tarde, vence mês que vem")', () => {
    const commitments = buildUpcomingCommitments(
      [],
      [],
      cutoff,
      [invoice({ id: 'inv-open-future', status: 'open', referenceMonth: '2026-06', dueDate: Timestamp.fromDate(new Date('2026-08-05T12:00:00')), outstandingBalanceCents: 5000 })],
      now
    );

    expect(commitments).toHaveLength(0);
  });

  it('excludes paid, overpaid and zero-balance invoices', () => {
    const commitments = buildUpcomingCommitments(
      [],
      [],
      cutoff,
      [
        invoice({ id: 'inv-paid', status: 'paid', referenceMonth: '2026-06', outstandingBalanceCents: 0 }),
        invoice({ id: 'inv-overpaid', status: 'overpaid', referenceMonth: '2026-06', outstandingBalanceCents: 0 }),
        invoice({ id: 'inv-zero', status: 'closed', referenceMonth: '2026-06', outstandingBalanceCents: 0 })
      ],
      now
    );

    expect(commitments).toHaveLength(0);
  });

  it('sorts bills, recurring rules and invoices together by due date', () => {
    const commitments = buildUpcomingCommitments(
      [bill({ id: 'b-1', dueDate: Timestamp.fromDate(new Date('2026-06-25T12:00:00')) })],
      [recurring({ id: 'r-1', nextOccurrenceAt: Timestamp.fromDate(new Date('2026-06-16T12:00:00')) })],
      cutoff,
      [invoice({ id: 'inv-1', status: 'closed', referenceMonth: '2026-06', dueDate: Timestamp.fromDate(new Date('2026-06-20T12:00:00')), outstandingBalanceCents: 1000 })],
      now
    );

    expect(commitments.map((c) => c.id)).toEqual(['r-1', 'inv-1', 'b-1']);
  });
});

describe('calculateDashboardSummary', () => {
  it('calculates free to spend from bills and recurring rules', () => {
    const summary = calculateDashboardSummary({
      accounts: [account('checking', 300000)],
      transactions: [],
      bills: [bill({ amountCents: 120000, dueDate: Timestamp.fromDate(new Date('2026-06-20T12:00:00')) })],
      recurringRules: [recurring({ amountCents: 10000, nextOccurrenceAt: Timestamp.fromDate(new Date('2026-06-18T12:00:00')) })],
      now: new Date('2026-06-14T12:00:00')
    });

    expect(summary.committedCents).toBe(130000);
    expect(summary.freeToSpendCents).toBe(170000);
    expect(summary.upcomingCommitments).toHaveLength(2);
  });

  it('sums the committed total across ALL commitments, even beyond the 3 shown on the dashboard', () => {
    const now = new Date('2026-06-14T12:00:00');
    const bills = [1, 2, 3, 4, 5].map((n) =>
      bill({ id: `b-${n}`, amountCents: 1000 * n, dueDate: Timestamp.fromDate(new Date(`2026-06-${15 + n}T12:00:00`)) })
    );

    const summary = calculateDashboardSummary({
      accounts: [account('checking', 1000000)],
      transactions: [],
      bills,
      recurringRules: [],
      now
    });

    const expectedTotal = bills.reduce((sum, b) => sum + b.amountCents, 0);
    expect(summary.upcomingCommitments).toHaveLength(3);
    expect(summary.committedCents).toBe(expectedTotal);
  });

  it('includes invoices in the committed total when provided', () => {
    const now = new Date('2026-06-14T12:00:00');
    const summary = calculateDashboardSummary({
      accounts: [account('checking', 500000)],
      transactions: [],
      bills: [],
      recurringRules: [],
      invoices: [invoice({ status: 'closed', referenceMonth: '2026-06', outstandingBalanceCents: 45000 })],
      now
    });

    expect(summary.committedCents).toBe(45000);
    expect(summary.freeToSpendCents).toBe(455000);
  });

  // Cenário real do dono: cartão fecha dia 25, vence dia 5 do mês seguinte. Uma
  // compra hoje (14 jun) fica no ciclo de junho (referenceMonth), mas só é cobrada
  // dia 5 de agosto — bem além do cutoff padrão de 30 dias (14 jul, sem salário
  // futuro lançado). "Disponível" não pode cair o valor inteiro da compra no mesmo
  // dia que ela foi feita, quase 2 meses antes do vencimento de verdade.
  it('keeps an open invoice due next month (closes-late/dues-next-month card) out of committed until it nears the due date', () => {
    const now = new Date('2026-06-14T12:00:00');
    const summary = calculateDashboardSummary({
      accounts: [account('checking', 500000)],
      transactions: [],
      bills: [],
      recurringRules: [],
      invoices: [
        invoice({
          status: 'open',
          referenceMonth: '2026-06',
          dueDate: Timestamp.fromDate(new Date('2026-08-05T12:00:00')),
          outstandingBalanceCents: 140000
        })
      ],
      now
    });

    expect(summary.committedCents).toBe(0);
    expect(summary.freeToSpendCents).toBe(500000);
  });

  // Renda variável (plantão, freela, autônomo): sem `payday`, uma janela de dias
  // configurável substitui o chute fixo de 30 dias — a mesma fatura do teste acima
  // (vence 5 ago) passa a contar se a pessoa alargar a janela o suficiente.
  it('uses a custom committedWindowDays instead of the 30-day default when there is no payday', () => {
    const now = new Date('2026-06-14T12:00:00');
    const invoices = [
      invoice({
        status: 'open',
        referenceMonth: '2026-06',
        dueDate: Timestamp.fromDate(new Date('2026-08-05T12:00:00')),
        outstandingBalanceCents: 140000
      })
    ];

    const withDefaultWindow = calculateDashboardSummary({
      accounts: [account('checking', 500000)],
      transactions: [],
      bills: [],
      recurringRules: [],
      invoices,
      now
    });
    expect(withDefaultWindow.committedCents).toBe(0);
    expect(withDefaultWindow.committedCutoffSource).toBe('window');

    const withWiderWindow = calculateDashboardSummary({
      accounts: [account('checking', 500000)],
      transactions: [],
      bills: [],
      recurringRules: [],
      invoices,
      committedWindowDays: 60,
      now
    });
    expect(withWiderWindow.committedCents).toBe(140000);
    expect(withWiderWindow.committedCutoffSource).toBe('window');
  });

  it('reports which source decided the committed cutoff: income, payday or the fallback window', () => {
    const now = new Date('2026-07-09T12:00:00');
    const base = {
      accounts: [account('checking', 500000)],
      bills: [],
      recurringRules: [],
      invoices: [],
      now
    };

    expect(calculateDashboardSummary({ ...base, transactions: [] }).committedCutoffSource).toBe('window');
    expect(
      calculateDashboardSummary({ ...base, transactions: [], payday: { type: 'fixed_day', day: 25 } }).committedCutoffSource
    ).toBe('payday');
    expect(
      calculateDashboardSummary({
        ...base,
        transactions: [transaction({ type: 'income', date: Timestamp.fromDate(new Date('2026-07-25T12:00:00')) })],
        payday: { type: 'fixed_day', day: 5 }
      }).committedCutoffSource
    ).toBe('income');
    // "Renda variável" é uma escolha explícita (plantão, freela, autônomo), mas não
    // resolve pra uma data — cai na janela igual quem nunca respondeu a pergunta.
    expect(
      calculateDashboardSummary({ ...base, transactions: [], payday: { type: 'variable_income' } }).committedCutoffSource
    ).toBe('window');
  });

  it('defaults committed invoices to zero when the invoices list is omitted', () => {
    const summary = calculateDashboardSummary({
      accounts: [account('checking', 500000)],
      transactions: [],
      bills: [],
      recurringRules: [],
      now: new Date('2026-06-14T12:00:00')
    });

    expect(summary.committedCents).toBe(0);
    expect(summary.freeToSpendCents).toBe(500000);
  });

  it('lists only the 5 most recent active transactions, most recent first', () => {
    const dates = ['2026-06-01', '2026-06-05', '2026-06-10', '2026-06-12', '2026-06-13', '2026-06-14'];
    const transactions = dates.map((d, i) =>
      transaction({ id: `tx-${i}`, date: Timestamp.fromDate(new Date(`${d}T12:00:00`)) })
    );

    const summary = calculateDashboardSummary({
      accounts: [account('checking', 100000)],
      transactions,
      bills: [],
      recurringRules: [],
      now: new Date('2026-06-14T12:00:00')
    });

    expect(summary.recentTransactions).toHaveLength(5);
    expect(summary.recentTransactions[0].id).toBe('tx-5');
    expect(summary.recentTransactions[4].id).toBe('tx-1');
  });

  // Regressão: `nextPaydayFrom` devolve meia-noite, mas contas e faturas são gravadas
  // ao meio-dia (`fromDateInputValue`). Comparando instantes, uma conta que vence no
  // PRÓPRIO dia do salário ficava depois do corte e sumia do Comprometido — o usuário
  // via "Disponível" alto justamente no dia em que precisava pagar a conta.
  it('counts a bill that falls exactly on payday as committed', () => {
    const summary = calculateDashboardSummary({
      accounts: [account('checking', 100000)],
      transactions: [],
      bills: [bill({ amountCents: 5000, dueDate: Timestamp.fromDate(new Date('2026-07-20T12:00:00')) })],
      recurringRules: [],
      payday: { type: 'fixed_day', day: 20 },
      now: new Date('2026-07-09T15:00:00')
    });

    expect(summary.committedCents).toBe(5000);
    expect(summary.committedCutoffSource).toBe('payday');
  });

  // Regressão: o corte é um DIA, não um instante. Com `addDays(now, 30)` cru, abrir o
  // app às 8h e às 20h dava Comprometidos diferentes para uma conta que vence no
  // 30º dia.
  it('keeps the 30-day window stable regardless of the hour the app is opened', () => {
    const dueOnLastWindowDay = Timestamp.fromDate(new Date('2026-08-08T12:00:00'));

    const morning = calculateDashboardSummary({
      accounts: [account('checking', 100000)],
      transactions: [],
      bills: [bill({ amountCents: 5000, dueDate: dueOnLastWindowDay })],
      recurringRules: [],
      now: new Date('2026-07-09T08:00:00')
    });
    const evening = calculateDashboardSummary({
      accounts: [account('checking', 100000)],
      transactions: [],
      bills: [bill({ amountCents: 5000, dueDate: dueOnLastWindowDay })],
      recurringRules: [],
      now: new Date('2026-07-09T20:00:00')
    });

    expect(morning.committedCents).toBe(5000);
    expect(evening.committedCents).toBe(morning.committedCents);
  });
});

// O modo é uma escolha explícita da pessoa (mini tutorial no Dashboard). As duas
// leituras são legítimas: `until_payday` assume que o próximo recebimento acontece;
// `conservative` nunca assume nada e conta toda dívida já assumida.
describe('calculateDashboardSummary — availableMode', () => {
  const now = new Date('2026-07-09T12:00:00');
  // R$ 1.000 na conta, fatura aberta de R$ 50 que só vence depois do próximo salário.
  const baseInput = {
    accounts: [account('checking', 100000)],
    transactions: [],
    bills: [],
    recurringRules: [],
    invoices: [
      invoice({
        status: 'open',
        outstandingBalanceCents: 5000,
        referenceMonth: '2026-08',
        dueDate: Timestamp.fromDate(new Date('2026-08-10T12:00:00'))
      })
    ],
    payday: { type: 'fixed_day' as const, day: 5 },
    now
  };

  it('until_payday: a fatura que vence depois do recebimento não compromete nada', () => {
    const summary = calculateDashboardSummary({ ...baseInput, availableMode: 'until_payday' });

    expect(summary.committedCents).toBe(0);
    expect(summary.freeToSpendCents).toBe(100000);
    expect(summary.committedCutoffSource).toBe('payday');
    expect(summary.committedCutoff).not.toBeNull();
  });

  it('conservative: a mesma fatura compromete desde já, sem data de corte', () => {
    const summary = calculateDashboardSummary({ ...baseInput, availableMode: 'conservative' });

    expect(summary.committedCents).toBe(5000);
    expect(summary.freeToSpendCents).toBe(95000);
    expect(summary.committedCutoffSource).toBe('all');
    expect(summary.committedCutoff).toBeNull();
  });

  it('defaults to until_payday when the profile never answered the tutorial', () => {
    const summary = calculateDashboardSummary(baseInput);

    expect(summary.committedCents).toBe(0);
    expect(summary.committedCutoffSource).toBe('payday');
  });

  // No conservador, parcelas de meses futuros são dívida já assumida — entram.
  it('conservative: counts future installment invoices as committed', () => {
    const summary = calculateDashboardSummary({
      ...baseInput,
      availableMode: 'conservative',
      invoices: [
        invoice({ id: 'i-08', referenceMonth: '2026-08', outstandingBalanceCents: 10000, dueDate: Timestamp.fromDate(new Date('2026-08-20T12:00:00')) }),
        invoice({ id: 'i-12', referenceMonth: '2026-12', outstandingBalanceCents: 10000, dueDate: Timestamp.fromDate(new Date('2026-12-20T12:00:00')) })
      ]
    });

    expect(summary.committedCents).toBe(20000);
  });

  it('conservative: still ignores paid invoices and settled balances', () => {
    const summary = calculateDashboardSummary({
      ...baseInput,
      availableMode: 'conservative',
      invoices: [
        invoice({ id: 'i-paid', status: 'paid', outstandingBalanceCents: 0 }),
        invoice({ id: 'i-zero', status: 'open', outstandingBalanceCents: 0 })
      ]
    });

    expect(summary.committedCents).toBe(0);
  });

  it('conservative: counts a bill due far beyond any window', () => {
    const summary = calculateDashboardSummary({
      ...baseInput,
      availableMode: 'conservative',
      invoices: [],
      bills: [bill({ amountCents: 7000, dueDate: Timestamp.fromDate(new Date('2027-03-01T12:00:00')) })]
    });

    expect(summary.committedCents).toBe(7000);
  });
});

describe('findNextIncomeDate — receita de hoje não é "próximo recebimento"', () => {
  // Regressão: comparar com o instante `now` fazia uma receita datada de hoje (gravada
  // ao meio-dia) contar como futura de manhã e não contar à tarde, mudando o corte do
  // Comprometido conforme a hora. Receita de hoje já entrou no saldo.
  it('ignores an income dated today, whatever the hour', () => {
    const todayIncome = [transaction({ type: 'income', date: Timestamp.fromDate(new Date('2026-06-14T12:00:00')) })];

    expect(findNextIncomeDate(todayIncome, new Date('2026-06-14T08:00:00'))).toBeNull();
    expect(findNextIncomeDate(todayIncome, new Date('2026-06-14T20:00:00'))).toBeNull();
  });

  it('still finds an income dated tomorrow', () => {
    const next = findNextIncomeDate(
      [transaction({ type: 'income', date: Timestamp.fromDate(new Date('2026-06-15T12:00:00')) })],
      new Date('2026-06-14T08:00:00')
    );

    expect(next?.toISOString().slice(0, 10)).toBe('2026-06-15');
  });
});
