import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { InvoiceLedgerEntry, InvoiceLedgerEntryType, Transaction } from '../types/contracts';
import { calculateInvoice } from '../domain/invoices/calculateInvoice';
import {
  billsByCategoryForMonth,
  committedByCategoryForMonth,
  lastCommittedMonth,
  ongoingInstallmentPurchases,
  projectedRecurringForMonth,
  recurringByCategoryForMonth,
  signedCharge,
  spendingByCategoryForMonth as spendingByCategoryForMonthRaw,
  spendingByCategoryAcrossMonths as spendingByCategoryAcrossMonthsRaw,
  monthlyTotals as monthlyTotalsRaw,
  computeCategoryTrend,
  rollUpByParent,
  NO_CATEGORY,
  installmentShiftBySource,
  reversedSourceIds,
  recognizedExpenseByMonth,
  installmentPurchaseIds,
  type BillForCommitment,
  type InvoiceForSpending,
  type PurchaseMonthOf,
  type RecurringForProjection
} from './spendingAnalysis';

// `excludedAccountIds` é obrigatório na função real de propósito (ver o comentário lá), pra que
// uma tela nova não esqueça de passá-lo. Aqui a maioria dos casos não tem conta "fora do saldo",
// então estes wrappers deixam o argumento implícito — os testes que exercitam a exclusão passam
// o Set explicitamente.
// `purchaseMonthOf` (2026-08-05) segue a mesma lógica: obrigatório na função real, implícito
// aqui. O default `() => undefined` faz a compra cair no fallback do `effectiveAt` da parcela 1
// — que é o comportamento de produção quando a transação está fora da janela carregada. Os
// testes de ancoragem passam o callback explicitamente.
type CategoryOf = (transactionId: string | undefined) => string | undefined;
const noPurchaseMonth: PurchaseMonthOf = () => undefined;

const spendingByCategoryForMonth = (
  month: string,
  transactions: Transaction[],
  invoices: InvoiceForSpending[],
  categoryOf: CategoryOf,
  excludedAccountIds: ReadonlySet<string> = new Set(),
  purchaseMonthOf: PurchaseMonthOf = noPurchaseMonth
) => spendingByCategoryForMonthRaw(month, transactions, invoices, categoryOf, excludedAccountIds, purchaseMonthOf);

const spendingByCategoryAcrossMonths = (
  months: string[],
  transactions: Transaction[],
  invoices: InvoiceForSpending[],
  categoryOf: CategoryOf,
  excludedAccountIds: ReadonlySet<string> = new Set(),
  purchaseMonthOf: PurchaseMonthOf = noPurchaseMonth
) => spendingByCategoryAcrossMonthsRaw(months, transactions, invoices, categoryOf, excludedAccountIds, purchaseMonthOf);

const monthlyTotals = (
  months: string[],
  transactions: Transaction[],
  invoices: InvoiceForSpending[],
  excludedAccountIds: ReadonlySet<string> = new Set(),
  purchaseMonthOf: PurchaseMonthOf = noPurchaseMonth
) => monthlyTotalsRaw(months, transactions, invoices, excludedAccountIds, purchaseMonthOf);

// Stepper espelhando `nextOccurrenceDate` de financeService (evita importar firebase no teste).
function step(date: Date, frequency: 'weekly' | 'biweekly' | 'monthly' | 'yearly', anchorDay?: number): Date {
  if (frequency === 'weekly' || frequency === 'biweekly') {
    const next = new Date(date);
    next.setDate(next.getDate() + (frequency === 'weekly' ? 7 : 14));
    return next;
  }
  const day = anchorDay ?? date.getDate();
  const targetYear = frequency === 'yearly' ? date.getFullYear() + 1 : date.getFullYear();
  const targetMonth = frequency === 'yearly' ? date.getMonth() : date.getMonth() + 1;
  const daysInTarget = new Date(targetYear, targetMonth + 1, 0).getDate();
  return new Date(targetYear, targetMonth, Math.min(day, daysInTarget));
}

function rule(overrides: Partial<RecurringForProjection> & Pick<RecurringForProjection, 'id' | 'nextOccurrenceAt'>): RecurringForProjection {
  return {
    description: 'Regra',
    categoryId: undefined,
    amountCents: 10000,
    frequency: 'monthly',
    anchorDay: overrides.nextOccurrenceAt.getDate(),
    isActive: true,
    ...overrides
  };
}

function txn(overrides: Partial<Transaction> & Pick<Transaction, 'id'>): Transaction {
  return {
    workspaceId: 'ws',
    createdBy: 'u',
    updatedBy: 'u',
    type: 'expense',
    amountCents: 0,
    description: '',
    categoryId: '',
    date: Timestamp.fromDate(new Date('2026-07-15')),
    competenceMonth: '2026-07',
    cashMonth: '2026-07',
    tags: [],
    isRecurring: false,
    clientMutationId: overrides.id,
    syncStatus: 'synced',
    version: 1,
    ...overrides
  } as Transaction;
}

function entry(overrides: Partial<InvoiceLedgerEntry> & Pick<InvoiceLedgerEntry, 'id' | 'type' | 'amountCents'>): InvoiceLedgerEntry {
  return {
    invoiceId: 'inv',
    cardId: 'card',
    workspaceId: 'ws',
    effectiveAt: Timestamp.fromDate(new Date('2026-07-15')),
    idempotencyKey: overrides.id,
    createdBy: 'u',
    ...overrides
  } as InvoiceLedgerEntry;
}

/** Compra de R$3.000 em 10x: 1 transação (valor cheio no mês da compra) + 10 parcelas no ledger. */
function build3000In10x(): { purchaseTxn: Transaction; invoices: InvoiceForSpending[] } {
  const purchaseTxn = txn({
    id: 'buy3000',
    type: 'card_purchase',
    amountCents: 300000,
    categoryId: 'compras',
    cardId: 'card',
    competenceMonth: '2026-07',
    cashMonth: '2026-07'
  });
  const invoices: InvoiceForSpending[] = tenMonthsFrom(2026, 7).map((month, i) => ({
    referenceMonth: month,
    ledgerEntries: [
      entry({
        id: `buy3000_p${i + 1}`,
        type: 'purchase',
        amountCents: 30000,
        sourceTransactionId: 'buy3000',
        installmentNumber: i + 1,
        installmentTotal: 10
      })
    ]
  }));
  return { purchaseTxn, invoices };
}

// Meses reais a partir de (year, month1), month1 em base 1. Ex.: (2026, 7) → jul/2026 … abr/2027.
function tenMonthsFrom(year: number, month1: number): string[] {
  return Array.from({ length: 10 }, (_, i) => {
    const d = new Date(year, month1 - 1 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

describe('spendingByCategoryForMonth', () => {
  it('conta a parcela do mês (R$300), não a compra cheia (R$3.000)', () => {
    const purchaseTxn = txn({ id: 'buy3000', type: 'card_purchase', amountCents: 300000, categoryId: 'compras' });
    const months = tenMonthsFrom(2026, 7);
    const invoices: InvoiceForSpending[] = months.map((month, i) => ({
      referenceMonth: month,
      ledgerEntries: [entry({ id: `p${i + 1}`, type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy3000', installmentNumber: i + 1, installmentTotal: 10 })]
    }));
    const catOf = (id?: string) => (id === 'buy3000' ? 'compras' : undefined);

    const julho = spendingByCategoryForMonth('2026-07', [purchaseTxn], invoices, catOf);
    expect(julho.get('compras')).toBe(30000);

    const setembro = spendingByCategoryForMonth('2026-09', [purchaseTxn], invoices, catOf);
    expect(setembro.get('compras')).toBe(30000);
  });

  it('soma despesa fora do cartão com a parcela do cartão no mesmo mês', () => {
    const mercado = txn({ id: 'm', type: 'expense', amountCents: 5000, categoryId: 'mercado', competenceMonth: '2026-07', cashMonth: '2026-07' });
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-07', ledgerEntries: [entry({ id: 'p1', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentTotal: 10 })] }
    ];
    const catOf = (id?: string) => (id === 'buy' ? 'compras' : undefined);

    const result = spendingByCategoryForMonth('2026-07', [mercado], invoices, catOf);
    expect(result.get('mercado')).toBe(5000);
    expect(result.get('compras')).toBe(30000);
  });

  it('antecipar move a parcela pro mês atual e zera o mês futuro', () => {
    const catOf = () => 'compras';
    // Fatura atual (jul): parcela normal + a parcela de dez antecipada (débito).
    const julho: InvoiceForSpending = {
      referenceMonth: '2026-07',
      ledgerEntries: [
        entry({ id: 'jul_p', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentTotal: 10 }),
        entry({ id: 'jul_ant', type: 'installment_anticipation', amountCents: 30000, sourceTransactionId: 'buy' })
      ]
    };
    // Fatura de dez: a parcela original continua lá, mas com crédito que a zera.
    const dezembro: InvoiceForSpending = {
      referenceMonth: '2026-12',
      ledgerEntries: [
        entry({ id: 'dez_p', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentTotal: 10 }),
        entry({ id: 'dez_credit', type: 'installment_anticipation_credit', amountCents: 30000, sourceTransactionId: 'buy' })
      ]
    };

    expect(spendingByCategoryForMonth('2026-07', [], [julho, dezembro], catOf).get('compras')).toBe(60000);
    expect(spendingByCategoryForMonth('2026-12', [], [julho, dezembro], catOf).get('compras') ?? 0).toBe(0);
  });

  it('parcela sem categoria cai em NO_CATEGORY', () => {
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-07', ledgerEntries: [entry({ id: 'p1', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentTotal: 2 })] }
    ];
    const result = spendingByCategoryForMonth('2026-07', [], invoices, () => undefined);
    expect(result.get(NO_CATEGORY)).toBe(30000);
  });

  it('ignora pagamento da fatura (não é gasto)', () => {
    const invoices: InvoiceForSpending[] = [
      {
        referenceMonth: '2026-07',
        ledgerEntries: [
          entry({ id: 'p1', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentTotal: 2 }),
          entry({ id: 'pay', type: 'payment', amountCents: 30000, sourceTransactionId: 'buy' })
        ]
      }
    ];
    expect(spendingByCategoryForMonth('2026-07', [], invoices, () => 'compras').get('compras')).toBe(30000);
  });

  it('estorno/reembolso/ajuste entram como crédito negativo na categoria, não como gasto', () => {
    const compra = txn({ id: 'c', type: 'expense', amountCents: 10000, categoryId: 'mercado', competenceMonth: '2026-07', cashMonth: '2026-07' });
    const estorno = txn({ id: 'r', type: 'refund', amountCents: 4000, categoryId: 'mercado', competenceMonth: '2026-07', cashMonth: '2026-07' });
    const reembolso = txn({ id: 're', type: 'reimbursement', amountCents: 1000, categoryId: 'saude', competenceMonth: '2026-07', cashMonth: '2026-07' });
    const ajuste = txn({ id: 'a', type: 'adjustment', amountCents: 500, categoryId: 'mercado', competenceMonth: '2026-07', cashMonth: '2026-07' });

    const result = spendingByCategoryForMonth('2026-07', [compra, estorno, reembolso, ajuste], [], () => undefined);

    expect(result.get('mercado')).toBe(10000 - 4000 - 500);
    expect(result.get('saude')).toBe(-1000);
  });
});

describe('monthlyTotals', () => {
  it('espalha a compra parcelada pelos meses das faturas, não no mês da compra', () => {
    const { purchaseTxn, invoices } = build3000In10x();
    const months = ['2026-07', '2026-08', '2026-09'];
    const totals = monthlyTotals(months, [purchaseTxn], invoices);
    expect(totals.find((m) => m.month === '2026-07')?.expenseCents).toBe(30000);
    expect(totals.find((m) => m.month === '2026-08')?.expenseCents).toBe(30000);
    expect(totals.find((m) => m.month === '2026-09')?.expenseCents).toBe(30000);
  });

  it('receita entra como entrada e despesa comum como saída', () => {
    const salario = txn({ id: 's', type: 'income', amountCents: 500000, cashMonth: '2026-07', competenceMonth: '2026-07' });
    const aluguel = txn({ id: 'a', type: 'expense', amountCents: 150000, cashMonth: '2026-07', competenceMonth: '2026-07' });
    const totals = monthlyTotals(['2026-07'], [salario, aluguel], []);
    expect(totals[0]).toMatchObject({ month: '2026-07', incomeCents: 500000, expenseCents: 150000 });
  });

  // Retirada de meta cria uma transação `income` de verdade (pra creditar a conta) — mas
  // ela não é "receita" pro resumo mensal, senão uma retirada infla Entradas/Saídas do
  // gráfico de Análise igual um aporte a meta já não infla Despesas.
  it('retirada de meta (income + tags: meta) não entra como receita do mês', () => {
    const salario = txn({ id: 's', type: 'income', amountCents: 500000, cashMonth: '2026-07', competenceMonth: '2026-07' });
    const retirada = txn({ id: 'r', type: 'income', amountCents: 100000, tags: ['meta'], cashMonth: '2026-07', competenceMonth: '2026-07' });
    const totals = monthlyTotals(['2026-07'], [salario, retirada], []);
    expect(totals[0]).toMatchObject({ month: '2026-07', incomeCents: 500000, expenseCents: 0 });
  });
});

describe('ongoingInstallmentPurchases', () => {
  it('mostra o valor cheio (10x de R$300 = R$3.000) e o que falta', () => {
    const months = tenMonthsFrom(2026, 7);
    const invoices: InvoiceForSpending[] = months.map((month, i) => ({
      referenceMonth: month,
      ledgerEntries: [entry({ id: `p${i + 1}`, type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentNumber: i + 1, installmentTotal: 10 })]
    }));

    const [purchase] = ongoingInstallmentPurchases('2026-09', invoices, () => 'Notebook');
    expect(purchase.fullAmountCents).toBe(300000);
    expect(purchase.installmentTotal).toBe(10);
    expect(purchase.installmentValueCents).toBe(30000);
    // Faturas de set/2026 a abr/2027 = 8 parcelas restantes.
    expect(purchase.remainingCount).toBe(8);
    expect(purchase.remainingCents).toBe(240000);
    expect(purchase.description).toBe('Notebook');
  });

  it('conta parcela antecipada como ainda não paga (só reagendou, não quitou), sem duplicar a parcela original que ela substituiu', () => {
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-07', ledgerEntries: [
        entry({ id: 'p1', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentNumber: 1, installmentTotal: 3 }),
        entry({ id: 'ant', type: 'installment_anticipation', amountCents: 30000, sourceTransactionId: 'buy' })
      ] },
      { referenceMonth: '2026-08', ledgerEntries: [
        entry({ id: 'p2', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentNumber: 2, installmentTotal: 3 })
      ] },
      { referenceMonth: '2026-09', ledgerEntries: [
        entry({ id: 'p3', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentNumber: 3, installmentTotal: 3 }),
        entry({ id: 'cred', type: 'installment_anticipation_credit', amountCents: 30000, sourceTransactionId: 'buy' })
      ] }
    ];
    // Set/2026 foi antecipada (crédito cancela SÓ a parcela 3 original, sem duplicar) — mas o
    // débito de antecipação (jul) continua contando: nada foi pago, só reagendado. Resta:
    // parcela 1 (jul) + antecipação da parcela 3 (jul) + parcela 2 (ago) = R$900, 3 parcelas.
    const [purchase] = ongoingInstallmentPurchases('2026-07', invoices, () => 'Óculos');
    expect(purchase.remainingCents).toBe(90000);
    expect(purchase.remainingCount).toBe(3);
  });

  it('ignora compra à vista (1x)', () => {
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-07', ledgerEntries: [entry({ id: 'p1', type: 'purchase', amountCents: 5000, sourceTransactionId: 'buy' })] }
    ];
    expect(ongoingInstallmentPurchases('2026-07', invoices, () => 'Café')).toHaveLength(0);
  });

  it('ignora compra parcelada já quitada (sem parcela futura)', () => {
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-01', ledgerEntries: [entry({ id: 'p1', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentTotal: 2 })] },
      { referenceMonth: '2026-02', ledgerEntries: [entry({ id: 'p2', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentTotal: 2 })] }
    ];
    expect(ongoingInstallmentPurchases('2026-07', invoices, () => 'Antiga')).toHaveLength(0);
  });

  it('compra excluída (com estorno no ledger) some, mas a recadastrada certa fica (regressão)', () => {
    // ERRADA em 3x: parcelas + estorno de cada uma (excluída). CERTA em 3x recadastrada no lugar,
    // nas mesmas faturas — o saldo devedor não zera, então sem o fix a errada continuava aparecendo.
    const invoices: InvoiceForSpending[] = ['2026-07', '2026-08', '2026-09'].map((month, i) => ({
      referenceMonth: month,
      ledgerEntries: [
        entry({ id: `bad_p${i + 1}`, type: 'purchase', amountCents: 10000, sourceTransactionId: 'bad', installmentNumber: i + 1, installmentTotal: 3 }),
        entry({ id: `bad_rev${i + 1}`, type: 'purchase_reversal', amountCents: 10000, sourceTransactionId: 'bad' }),
        entry({ id: `good_p${i + 1}`, type: 'purchase', amountCents: 20000, sourceTransactionId: 'good', installmentNumber: i + 1, installmentTotal: 3 })
      ]
    }));
    const result = ongoingInstallmentPurchases('2026-07', invoices, (id) => (id === 'good' ? 'Certa' : 'Errada'));
    expect(result).toHaveLength(1);
    expect(result[0].sourceTransactionId).toBe('good');
  });

  // Regressão: pagar a fatura no app NUNCA muda `status` (só `reconcileInvoice`, manual,
  // faz isso — o fluxo normal de "pagar fatura" só zera `outstandingBalanceCents` via Cloud
  // Function). Sem olhar esse saldo, "andamento" só sumia quando o calendário passava do mês
  // da fatura — nunca quando a pessoa de fato pagava.
  it('some da lista assim que outstandingBalanceCents zera (fatura paga de verdade), mesmo antes do mês virar', () => {
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-07', outstandingBalanceCents: 0, ledgerEntries: [
        entry({ id: 'p1', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentNumber: 1, installmentTotal: 3 }),
        entry({ id: 'ant', type: 'installment_anticipation', amountCents: 60000, sourceTransactionId: 'buy' })
      ] }
    ];
    expect(ongoingInstallmentPurchases('2026-07', invoices, () => 'Tênis')).toHaveLength(0);
  });

  it('some da lista se status foi reconciliado manualmente pra paid/overpaid', () => {
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-07', status: 'paid', ledgerEntries: [
        entry({ id: 'p1', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentNumber: 1, installmentTotal: 3 })
      ] }
    ];
    expect(ongoingInstallmentPurchases('2026-07', invoices, () => 'Tênis')).toHaveLength(0);
  });

  it('continua contando fatura fechada mas com saldo ainda em aberto', () => {
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-07', status: 'closed', outstandingBalanceCents: 30000, ledgerEntries: [
        entry({ id: 'p1', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentNumber: 1, installmentTotal: 3 })
      ] }
    ];
    const [purchase] = ongoingInstallmentPurchases('2026-07', invoices, () => 'Tênis');
    expect(purchase.remainingCents).toBe(30000);
  });
});

describe('billsByCategoryForMonth', () => {
  const bills: BillForCommitment[] = [
    { categoryId: 'moradia', amountCents: 150000, status: 'pending', dueMonth: '2026-09' },
    { categoryId: 'moradia', amountCents: 20000, status: 'overdue', dueMonth: '2026-09' },
    { categoryId: 'lazer', amountCents: 5000, status: 'paid', dueMonth: '2026-09' }, // paga não conta
    { categoryId: 'moradia', amountCents: 99900, status: 'pending', dueMonth: '2026-10' } // outro mês
  ];

  it('soma só contas em aberto que vencem no mês, por categoria', () => {
    const result = billsByCategoryForMonth('2026-09', bills);
    expect(result.get('moradia')).toBe(170000); // 1500 pendente + 200 atrasada
    expect(result.has('lazer')).toBe(false); // paga
  });

  it('conta sem categoria cai em NO_CATEGORY', () => {
    const result = billsByCategoryForMonth('2026-09', [{ amountCents: 8000, status: 'pending', dueMonth: '2026-09' }]);
    expect(result.get(NO_CATEGORY)).toBe(8000);
  });
});

describe('committedByCategoryForMonth', () => {
  it('junta parcela de cartão + conta a pagar do mês', () => {
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-09', ledgerEntries: [entry({ id: 'p', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentTotal: 10 })] }
    ];
    const bills: BillForCommitment[] = [{ categoryId: 'moradia', amountCents: 150000, status: 'pending', dueMonth: '2026-09' }];
    const result = committedByCategoryForMonth('2026-09', invoices, bills, (id) => (id === 'buy' ? 'compras' : undefined), noPurchaseMonth);
    expect(result.get('compras')).toBe(30000);
    expect(result.get('moradia')).toBe(150000);
  });
});

describe('lastCommittedMonth', () => {
  it('vai até o mês da parcela mais distante', () => {
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-08', ledgerEntries: [entry({ id: 'p1', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentTotal: 3 })] },
      { referenceMonth: '2027-01', ledgerEntries: [entry({ id: 'p2', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentTotal: 3 })] }
    ];
    expect(lastCommittedMonth('2026-07', invoices, [], noPurchaseMonth)).toBe('2027-01');
  });

  it('considera conta a pagar futura mais distante que a parcela', () => {
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-08', ledgerEntries: [entry({ id: 'p1', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentTotal: 2 })] }
    ];
    const bills: BillForCommitment[] = [{ amountCents: 5000, status: 'pending', dueMonth: '2026-12' }];
    expect(lastCommittedMonth('2026-07', invoices, bills, noPurchaseMonth)).toBe('2026-12');
  });

  it('sem nada comprometido à frente, fica no mês atual', () => {
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-05', ledgerEntries: [entry({ id: 'p1', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentTotal: 2 })] }
    ];
    expect(lastCommittedMonth('2026-07', invoices, [], noPurchaseMonth)).toBe('2026-07');
  });

  it('ignora fatura futura sem cobrança líquida (toda antecipada)', () => {
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-09', ledgerEntries: [
        entry({ id: 'p', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentTotal: 3 }),
        entry({ id: 'c', type: 'installment_anticipation_credit', amountCents: 30000, sourceTransactionId: 'buy' })
      ] }
    ];
    expect(lastCommittedMonth('2026-07', invoices, [], noPurchaseMonth)).toBe('2026-07');
  });
});

describe('projectedRecurringForMonth', () => {
  it('recorrência mensal cai uma vez no mês futuro', () => {
    const rules = [rule({ id: 'aluguel', description: 'Aluguel', categoryId: 'moradia', amountCents: 150000, nextOccurrenceAt: new Date(2026, 6, 5) })];
    const set = projectedRecurringForMonth('2026-09', rules, step);
    expect(set).toHaveLength(1);
    expect(set[0]).toMatchObject({ id: 'aluguel', amountCents: 150000, categoryId: 'moradia' });
  });

  it('recorrência semanal soma as ocorrências do mês', () => {
    // Toda quarta a partir de 01/07/2026; agosto/2026 tem quartas em 5,12,19,26 = 4 ocorrências.
    const rules = [rule({ id: 'feira', amountCents: 8000, frequency: 'weekly', nextOccurrenceAt: new Date(2026, 6, 1) })];
    const set = projectedRecurringForMonth('2026-08', rules, step);
    expect(set[0].amountCents).toBe(32000);
  });

  it('recorrência anual só aparece no mês do aniversário', () => {
    const rules = [rule({ id: 'seguro', amountCents: 60000, frequency: 'yearly', nextOccurrenceAt: new Date(2026, 2, 10), anchorDay: 10 })];
    expect(projectedRecurringForMonth('2027-03', rules, step)[0].amountCents).toBe(60000);
    expect(projectedRecurringForMonth('2027-04', rules, step)).toHaveLength(0);
  });

  it('ignora regra inativa ou sem valor', () => {
    const rules = [
      rule({ id: 'off', amountCents: 5000, isActive: false, nextOccurrenceAt: new Date(2026, 6, 5) }),
      rule({ id: 'zero', amountCents: 0, nextOccurrenceAt: new Date(2026, 6, 5) })
    ];
    expect(projectedRecurringForMonth('2026-09', rules, step)).toHaveLength(0);
  });

  it('não conta recorrência que só começa depois do mês', () => {
    const rules = [rule({ id: 'futura', amountCents: 5000, nextOccurrenceAt: new Date(2026, 10, 5) })]; // começa nov/2026
    expect(projectedRecurringForMonth('2026-09', rules, step)).toHaveLength(0);
  });

  it('recurringByCategoryForMonth soma por categoria', () => {
    const rules = [
      rule({ id: 'a', categoryId: 'moradia', amountCents: 150000, nextOccurrenceAt: new Date(2026, 6, 5) }),
      rule({ id: 'b', categoryId: 'moradia', amountCents: 20000, nextOccurrenceAt: new Date(2026, 6, 10) }),
      rule({ id: 'c', amountCents: 4000, nextOccurrenceAt: new Date(2026, 6, 15) })
    ];
    const totals = recurringByCategoryForMonth('2026-09', rules, step);
    expect(totals.get('moradia')).toBe(170000);
    expect(totals.get(NO_CATEGORY)).toBe(4000);
  });
});

describe('spendingByCategoryAcrossMonths', () => {
  const months = ['2026-05', '2026-06', '2026-07'];

  it('soma a categoria por mês (despesa fora do cartão)', () => {
    const txns = [
      txn({ id: 'a', amountCents: 5000, categoryId: 'mercado', cashMonth: '2026-05', competenceMonth: '2026-05' }),
      txn({ id: 'b', amountCents: 7000, categoryId: 'mercado', cashMonth: '2026-06', competenceMonth: '2026-06' })
    ];
    const byCat = spendingByCategoryAcrossMonths(months, txns, [], () => undefined);
    expect(byCat.get('mercado')?.get('2026-05')).toBe(5000);
    expect(byCat.get('mercado')?.get('2026-06')).toBe(7000);
    // Mês sem gasto na categoria não entra no mapa interno (a série preenche 0 na hora de exibir).
    expect(byCat.get('mercado')?.has('2026-07')).toBe(false);
  });

  it('espalha a parcela de cartão pelos meses das faturas (via ledger)', () => {
    const purchaseTxn = txn({ id: 'buy', type: 'card_purchase', amountCents: 90000, categoryId: 'compras', cardId: 'card', cashMonth: '2026-05', competenceMonth: '2026-05' });
    const invoices: InvoiceForSpending[] = months.map((month, i) => ({
      referenceMonth: month,
      ledgerEntries: [entry({ id: `p${i + 1}`, type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentNumber: i + 1, installmentTotal: 3 })]
    }));
    const byCat = spendingByCategoryAcrossMonths(months, [purchaseTxn], invoices, (id) => (id === 'buy' ? 'compras' : undefined));
    expect(byCat.get('compras')?.get('2026-05')).toBe(30000);
    expect(byCat.get('compras')?.get('2026-06')).toBe(30000);
    expect(byCat.get('compras')?.get('2026-07')).toBe(30000);
  });

  it('mês só de estorno (líquido ≤ 0) não vira gasto — categoria ausente naquele mês', () => {
    const txns = [
      txn({ id: 'c', type: 'expense', amountCents: 10000, categoryId: 'mercado', cashMonth: '2026-05', competenceMonth: '2026-05' }),
      txn({ id: 'r', type: 'refund', amountCents: 4000, categoryId: 'mercado', cashMonth: '2026-06', competenceMonth: '2026-06' })
    ];
    const byCat = spendingByCategoryAcrossMonths(months, txns, [], () => undefined);
    expect(byCat.get('mercado')?.get('2026-05')).toBe(10000);
    expect(byCat.get('mercado')?.has('2026-06')).toBe(false); // só estorno → -4000 filtrado
  });

  it('compra no cartão sem categoria cai em NO_CATEGORY', () => {
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-07', ledgerEntries: [entry({ id: 'p', type: 'purchase', amountCents: 30000, sourceTransactionId: 'buy', installmentTotal: 2 })] }
    ];
    const byCat = spendingByCategoryAcrossMonths(months, [], invoices, () => undefined);
    expect(byCat.get(NO_CATEGORY)?.get('2026-07')).toBe(30000);
  });
});

describe('computeCategoryTrend', () => {
  const months = ['2026-05', '2026-06', '2026-07'];
  const currentMonth = '2026-07';

  it('média usa só os meses fechados (exclui o atual) e o veredito compara o atual a ela', () => {
    const byCat = new Map([['mercado', new Map([['2026-05', 30000], ['2026-06', 41000], ['2026-07', 31800]])]]);
    const trend = computeCategoryTrend('mercado', months, currentMonth, byCat);

    expect(trend.averageCents).toBe(35500);          // (30000 + 41000) / 2, sem o julho parcial
    expect(trend.currentCents).toBe(31800);
    expect(trend.vsAveragePct).toBe(-10);            // round((31800 - 35500) / 35500 * 100)
    expect(trend.totalCents).toBe(102800);
    expect(trend.maxMonth).toEqual({ month: '2026-06', amountCents: 41000 });
    expect(trend.minMonth).toEqual({ month: '2026-05', amountCents: 30000 });
    expect(trend.series).toHaveLength(3);
    expect(trend.series[2]).toMatchObject({ month: '2026-07', isCurrent: true });
    expect(trend.series[0].isCurrent).toBe(false);
  });

  it('veredito positivo quando o mês atual está acima da média', () => {
    const byCat = new Map([['mercado', new Map([['2026-05', 10000], ['2026-06', 10000], ['2026-07', 15000]])]]);
    const trend = computeCategoryTrend('mercado', months, currentMonth, byCat);
    expect(trend.averageCents).toBe(10000);
    expect(trend.vsAveragePct).toBe(50);
  });

  it('sem meses fechados com gasto (categoria nova), veredito é null e a série preenche 0', () => {
    const byCat = new Map([['mercado', new Map([['2026-07', 5000]])]]); // só o mês atual tem gasto
    const trend = computeCategoryTrend('mercado', months, currentMonth, byCat);
    expect(trend.vsAveragePct).toBeNull();           // sem base → não divide por ~0
    expect(trend.currentCents).toBe(5000);
    expect(trend.series[0].amountCents).toBe(0);     // mês sem gasto vira 0 na série
    expect(trend.maxMonth).toBeNull();               // só o mês atual (parcial) tem gasto → sem maior/menor mês fechado
  });
});

describe('cartão à vista conta pela data da compra (regime de competência)', () => {
  // Caso real do dono: cartão fecha dia 2, então uma compra de domingo 26/07 cai na fatura
  // de agosto. Antes aparecia só em agosto; agora conta em JULHO (mês da compra).
  function ride99() {
    const purchaseTxn = txn({
      id: 'ride99',
      type: 'card_purchase',
      amountCents: 1660,
      categoryId: 'transporte',
      cardId: 'card',
      competenceMonth: '2026-07',
      cashMonth: '2026-07'
    });
    // Fatura de AGOSTO (a compra de 26/07 caiu no ciclo que fecha em 02/08). À vista: sem installmentTotal.
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-08', ledgerEntries: [entry({ id: 'ride99_p1', type: 'purchase', amountCents: 1660, sourceTransactionId: 'ride99' })] }
    ];
    const catOf = (id?: string) => (id === 'ride99' ? 'transporte' : undefined);
    return { purchaseTxn, invoices, catOf };
  }

  it('conta no mês da COMPRA (julho), não no mês da fatura (agosto)', () => {
    const { purchaseTxn, invoices, catOf } = ride99();
    const julho = spendingByCategoryForMonth('2026-07', [purchaseTxn], invoices, catOf);
    const agosto = spendingByCategoryForMonth('2026-08', [purchaseTxn], invoices, catOf);
    expect(julho.get('transporte')).toBe(1660);   // aparece em julho
    expect(agosto.get('transporte')).toBeUndefined(); // NÃO aparece em agosto (era o comportamento antigo)
  });

  it('não conta duas vezes (transação + ledger)', () => {
    const { purchaseTxn, invoices, catOf } = ride99();
    const total = [...spendingByCategoryForMonth('2026-07', [purchaseTxn], invoices, catOf).values()]
      .concat([...spendingByCategoryForMonth('2026-08', [purchaseTxn], invoices, catOf).values()])
      .reduce((a, b) => a + b, 0);
    expect(total).toBe(1660); // uma vez só, no total dos dois meses
  });

  it('monthlyTotals: saída de julho inclui a compra à vista; agosto não', () => {
    const { purchaseTxn, invoices } = ride99();
    const totals = monthlyTotals(['2026-07', '2026-08'], [purchaseTxn], invoices);
    expect(totals.find((m) => m.month === '2026-07')?.expenseCents).toBe(1660);
    expect(totals.find((m) => m.month === '2026-08')?.expenseCents).toBe(0);
  });

  it('parcelada continua pela fatura, mesmo sem installmentTotal no ledger (detecta por ocorrência)', () => {
    // Compra antiga em 3x sem o campo installmentTotal: 1 ocorrência por fatura em 3 meses.
    const purchaseTxn = txn({ id: 'legacy3x', type: 'card_purchase', amountCents: 30000, categoryId: 'compras', cashMonth: '2026-07', competenceMonth: '2026-07' });
    const invoices: InvoiceForSpending[] = ['2026-07', '2026-08', '2026-09'].map((month, i) => ({
      referenceMonth: month,
      ledgerEntries: [entry({ id: `legacy3x_p${i + 1}`, type: 'purchase', amountCents: 10000, sourceTransactionId: 'legacy3x' })]
    }));
    const catOf = (id?: string) => (id === 'legacy3x' ? 'compras' : undefined);
    // Não conta os R$300 cheios em julho: conta R$100 por fatura (parcela detectada por ocorrência > 1).
    expect(spendingByCategoryForMonth('2026-07', [purchaseTxn], invoices, catOf).get('compras')).toBe(10000);
    expect(spendingByCategoryForMonth('2026-08', [purchaseTxn], invoices, catOf).get('compras')).toBe(10000);
  });
});

describe('signedCharge sincronizado com calculateInvoice (trava anti-drift dos tipos de ledger)', () => {
  // Se um tipo novo for adicionado só num dos dois classificadores, este teste quebra —
  // é a defesa contra a classe de bug que deixou purchase_reversal fora do signedCharge.
  // Exaustivo POR CONSTRUÇÃO: `satisfies Record<InvoiceLedgerEntryType, true>` vira erro de
  // compilação se um tipo novo entrar no enum sem ser listado aqui — sem isso, um tipo novo
  // passaria despercebido no teste (a exata classe de drift que este teste existe pra travar).
  const ALL_TYPES_MAP = {
    purchase: true, payment: true, advance_payment: true, refund_credit: true,
    chargeback_credit: true, manual_credit: true, manual_debit: true, interest: true,
    fine: true, iof: true, fee: true, installment_anticipation: true,
    installment_anticipation_credit: true, purchase_reversal: true, anticipation_credit_reversal: true
  } satisfies Record<InvoiceLedgerEntryType, true>;
  const ALL_TYPES = Object.keys(ALL_TYPES_MAP) as InvoiceLedgerEntryType[];

  it.each(ALL_TYPES)('tipo %s: signedCharge == contribuição de recognizedExpense do calculateInvoice', (type) => {
    const amountCents = 1000;
    const viaSpending = signedCharge({ type, amountCents });
    const viaInvoice = calculateInvoice([
      { id: 't', type, amountCents, effectiveAt: new Date('2026-07-15'), idempotencyKey: 't' }
    ]).recognizedExpenseCents;
    expect(viaSpending).toBe(viaInvoice);
  });
});

describe('exclusão de compra no cartão some da Análise (regressão do purchase_reversal)', () => {
  it('parcelada excluída: parcela + estorno se anulam em cada mês da fatura', () => {
    const catOf = (id?: string) => (id === 'p3x' ? 'compras' : undefined);
    const invoices: InvoiceForSpending[] = ['2026-07', '2026-08', '2026-09'].map((month, i) => ({
      referenceMonth: month,
      ledgerEntries: [
        entry({ id: `p3x_p${i + 1}`, type: 'purchase', amountCents: 10000, sourceTransactionId: 'p3x', installmentNumber: i + 1, installmentTotal: 3 }),
        entry({ id: `p3x_rev${i + 1}`, type: 'purchase_reversal', amountCents: 10000, sourceTransactionId: 'p3x' })
      ]
    }));
    for (const month of ['2026-07', '2026-08', '2026-09']) {
      expect(spendingByCategoryForMonth(month, [], invoices, catOf).get('compras') ?? 0).toBe(0);
    }
  });

  it('à vista excluída: some do mês da compra E não deixa crédito fantasma no mês da fatura', () => {
    const deleted = txn({
      id: 'av1', type: 'card_purchase', amountCents: 1660, categoryId: 'transporte', cardId: 'card',
      cashMonth: '2026-07', competenceMonth: '2026-07', deletedAt: Timestamp.fromDate(new Date('2026-07-27'))
    });
    const invoices: InvoiceForSpending[] = [{
      referenceMonth: '2026-08',
      ledgerEntries: [
        entry({ id: 'av1_p1', type: 'purchase', amountCents: 1660, sourceTransactionId: 'av1' }),
        entry({ id: 'av1_rev', type: 'purchase_reversal', amountCents: 1660, sourceTransactionId: 'av1' })
      ]
    }];
    const catOf = (id?: string) => (id === 'av1' ? 'transporte' : undefined);
    expect(spendingByCategoryForMonth('2026-07', [deleted], invoices, catOf).get('transporte')).toBeUndefined();
    expect(spendingByCategoryForMonth('2026-08', [deleted], invoices, catOf).get('transporte')).toBeUndefined();
  });

  it('parcela antecipada de compra excluída: crédito de antecipação + seu estorno se anulam', () => {
    const catOf = (id?: string) => (id === 'antp' ? 'compras' : undefined);
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-09', ledgerEntries: [
        entry({ id: 'antp_credit', type: 'installment_anticipation_credit', amountCents: 10000, sourceTransactionId: 'antp' }),
        entry({ id: 'antp_credit_rev', type: 'anticipation_credit_reversal', amountCents: 10000, sourceTransactionId: 'antp' })
      ] }
    ];
    expect(spendingByCategoryForMonth('2026-09', [], invoices, catOf).get('compras') ?? 0).toBe(0);
  });
});

/**
 * Roll-up pai↔filha — só a Análise (donut + lista) usa. Ver `[D1]`/`[D8]` em
 * `docs/planning/SUBCATEGORIAS.md`.
 */
describe('rollUpByParent', () => {
  /**
   *  Casa (pai)          Transporte (folha)
   *   ├── Energia
   *   └── Água
   */
  const cats = new Map<string, { parentCategoryId?: string }>([
    ['casa', {}],
    ['energia', { parentCategoryId: 'casa' }],
    ['agua', { parentCategoryId: 'casa' }],
    ['transporte', {}]
  ]);

  it('soma as filhas no pai e guarda cada uma na expansão', () => {
    const rolled = rollUpByParent(new Map([['energia', 50000], ['agua', 20000]]), cats);

    expect(rolled.get('casa')?.totalCents).toBe(70000);
    expect([...(rolled.get('casa')?.children ?? [])]).toEqual([['energia', 50000], ['agua', 20000]]);
    // O pai não aparece como linha própria além do bucket — quem soma é ele.
    expect([...rolled.keys()]).toEqual(['casa']);
  });

  it('folha continua linha de primeiro nível, sem expansão', () => {
    const rolled = rollUpByParent(new Map([['transporte', 30000]]), cats);

    expect(rolled.get('transporte')).toEqual({ totalCents: 30000, children: new Map() });
  });

  // [D11]: lançamentos feitos em Casa ANTES de ela virar agrupamento continuam apontando pra ela.
  it('gasto direto no pai vira a linha "· geral" dentro da expansão', () => {
    const rolled = rollUpByParent(new Map([['casa', 10000], ['energia', 50000]]), cats);
    const casa = rolled.get('casa')!;

    expect(casa.totalCents).toBe(60000);
    expect(casa.children.get('casa')).toBe(10000); // chave = id do próprio pai
    // Os percentuais da expansão fecham 100% do pai.
    expect([...casa.children.values()].reduce((s, c) => s + c, 0)).toBe(casa.totalCents);
  });

  it('pai SEM filha no período não ganha linha "geral" — seria uma linha sozinha dentro dela mesma', () => {
    const rolled = rollUpByParent(new Map([['casa', 10000]]), cats);

    expect(rolled.get('casa')).toEqual({ totalCents: 10000, children: new Map() });
  });

  it('sem categoria e categoria desconhecida ficam no primeiro nível', () => {
    const rolled = rollUpByParent(new Map([[NO_CATEGORY, 5000], ['fantasma', 900]]), cats);

    expect(rolled.get(NO_CATEGORY)?.totalCents).toBe(5000);
    expect(rolled.get('fantasma')?.totalCents).toBe(900);
  });

  // Perder o agrupamento é aceitável; sumir com o gasto não.
  it('filha órfã (pai excluído do mapa) vira linha de primeiro nível', () => {
    const semCasa = new Map([['energia', { parentCategoryId: 'casa' }]]);
    const rolled = rollUpByParent(new Map([['energia', 50000]]), semCasa);

    expect(rolled.get('energia')?.totalCents).toBe(50000);
    expect(rolled.has('casa')).toBe(false);
  });

  it('ciclo trivial (categoria apontando pra si mesma) não entra em loop nem se auto-soma', () => {
    const cíclica = new Map([['casa', { parentCategoryId: 'casa' }]]);
    const rolled = rollUpByParent(new Map([['casa', 10000]]), cíclica);

    expect(rolled.get('casa')).toEqual({ totalCents: 10000, children: new Map() });
  });

  // [D8]: `spendingByCategoryForMonth` devolve negativo em mês só de estorno. O roll-up NÃO
  // filtra — quem exibe é que decide. Aqui só se prova que o total pode chegar a zero, que é o
  // divisor do "% relativo ao pai" e viraria "NaN%" na tela sem a guarda.
  it('preserva negativo e deixa o total do pai chegar a zero', () => {
    const rolled = rollUpByParent(new Map([['energia', -50000], ['agua', 50000]]), cats);

    expect(rolled.get('casa')?.totalCents).toBe(0);
    expect(rolled.get('casa')?.children.get('energia')).toBe(-50000);
  });

  it('mapa vazio devolve mapa vazio', () => {
    expect(rollUpByParent(new Map(), cats).size).toBe(0);
  });

  it('não perde nem inventa centavo: a soma dos primeiros níveis é a soma da entrada', () => {
    const entrada = new Map([['energia', 50000], ['agua', 20000], ['casa', 10000], ['transporte', 30000], [NO_CATEGORY, 700]]);
    const rolled = rollUpByParent(entrada, cats);

    const antes = [...entrada.values()].reduce((s, c) => s + c, 0);
    const depois = [...rolled.values()].reduce((s, b) => s + b.totalCents, 0);
    expect(depois).toBe(antes);
  });
});

/**
 * `[D9]` — a fonte crua não pode agrupar filha no pai. Nem todo consumidor quer roll-up
 * (ver o aviso em `rollUpByParent`):
 *
 *   • annualSummaryCalculations → "Top categorias" mudaria de número (teste irmão lá).
 *   • orçamento → a Análise só desenha a barra de limite em categoria FOLHA justamente porque
 *     o valor da linha do pai já é o roll-up, e o limite significa gasto DIRETO
 *     (`SearchPage.tsx`, `leafBudget`/`groupBudget`). Se o mapa cru também viesse somado, não
 *     sobraria nenhum lugar de onde tirar o gasto direto — um limite em "Casa" passaria a
 *     estourar por causa de Energia, sem ninguém ter decidido isso. Decisão de produto ainda
 *     em aberto; segue em aberto porque este teste impede que ela aconteça por acidente.
 *     (O `BudgetAlertBanner` era o terceiro consumidor citado aqui — removido em 06/08/2026,
 *     ver `docs/history/2026-08.md`. O motivo dele constar não morreu com ele: mudou de tela.)
 *
 * O teste é a tripwire: hoje a função nem recebe as categorias, então não TEM como agrupar.
 * No dia em que alguém passar esse mapa pra cá, ele falha e a decisão volta pra mesa.
 */
describe('spendingByCategoryForMonth NÃO agrupa subcategoria no pai [D9]', () => {
  it('gasto na filha fica na filha; o pai só tem o que foi lançado nele', () => {
    const energia = txn({ id: 'e', type: 'expense', amountCents: 50000, categoryId: 'energia' });
    const casa = txn({ id: 'c', type: 'expense', amountCents: 10000, categoryId: 'casa' });

    const result = spendingByCategoryForMonth('2026-07', [energia, casa], [], () => undefined);

    expect(result.get('energia')).toBe(50000);
    expect(result.get('casa')).toBe(10000); // não 60000
  });

  it('gasto só na filha não cria linha nenhuma pro pai', () => {
    const energia = txn({ id: 'e', type: 'expense', amountCents: 50000, categoryId: 'energia' });

    const result = spendingByCategoryForMonth('2026-07', [energia], [], () => undefined);

    expect(result.has('casa')).toBe(false);
  });
});

// Conta "fora do saldo" (`Account.excludeFromTotals`): vale-refeição, vale-alimentação, cartão
// presente. O gasto existe e aparece no Extrato, mas não pode entrar em agregado nenhum da
// Análise — foi exatamente pra isso que `excludedAccountIds` virou parâmetro obrigatório.
describe('contas fora do saldo (excludeFromTotals)', () => {
  const VR = new Set(['acc-vr']);

  it('despesa em conta excluída não entra no gasto por categoria', () => {
    const banco = txn({ id: 'a', amountCents: 5000, categoryId: 'alimentacao', accountId: 'acc-banco' });
    const vale = txn({ id: 'b', amountCents: 3000, categoryId: 'alimentacao', accountId: 'acc-vr' });

    expect(spendingByCategoryForMonth('2026-07', [banco, vale], [], () => undefined).get('alimentacao')).toBe(8000);
    expect(spendingByCategoryForMonth('2026-07', [banco, vale], [], () => undefined, VR).get('alimentacao')).toBe(5000);
  });

  it('receita em conta excluída não infla as entradas do mês', () => {
    const salario = txn({ id: 's', type: 'income', amountCents: 500000, accountId: 'acc-banco' });
    const creditoDoVale = txn({ id: 'v', type: 'income', amountCents: 80000, accountId: 'acc-vr' });

    const [semFiltro] = monthlyTotals(['2026-07'], [salario, creditoDoVale], []);
    expect(semFiltro.incomeCents).toBe(580000);

    const [comFiltro] = monthlyTotals(['2026-07'], [salario, creditoDoVale], [], VR);
    expect(comFiltro.incomeCents).toBe(500000);
  });

  it('despesa em conta excluída sai também das saídas do mês', () => {
    const mercado = txn({ id: 'm', amountCents: 12000, accountId: 'acc-banco' });
    const almoco = txn({ id: 'a', amountCents: 4000, accountId: 'acc-vr' });

    expect(monthlyTotals(['2026-07'], [mercado, almoco], [], VR)[0].expenseCents).toBe(12000);
  });

  it('compra no cartão NÃO é afetada pela exclusão de conta (card_purchase não tem accountId)', () => {
    // Regressão: `card_purchase` grava `cardId`, nunca `accountId` (ver src/cards/cardService.ts).
    // Se a exclusão olhasse outro campo, ter um vale-refeição no workspace apagaria gasto de
    // cartão da Análise inteira.
    const compra = txn({ id: 'c', type: 'card_purchase', amountCents: 20000, categoryId: 'compras', cardId: 'card' });

    expect(spendingByCategoryForMonth('2026-07', [compra], [], () => undefined, VR).get('compras')).toBe(20000);
  });

  it('a tendência por categoria enxerga o mesmo recorte do donut', () => {
    const meses = ['2026-05', '2026-06', '2026-07'];
    const banco = txn({ id: 'a', amountCents: 5000, categoryId: 'alimentacao', accountId: 'acc-banco', cashMonth: '2026-06', competenceMonth: '2026-06' });
    const vale = txn({ id: 'b', amountCents: 9000, categoryId: 'alimentacao', accountId: 'acc-vr', cashMonth: '2026-06', competenceMonth: '2026-06' });

    const byCat = spendingByCategoryAcrossMonths(meses, [banco, vale], [], () => undefined, VR);
    expect(byCat.get('alimentacao')?.get('2026-06')).toBe(5000);
  });

  it('Set vazio deixa tudo como sempre foi (nenhuma conta marcada)', () => {
    const vale = txn({ id: 'b', amountCents: 3000, categoryId: 'alimentacao', accountId: 'acc-vr' });

    expect(spendingByCategoryForMonth('2026-07', [vale], [], () => undefined, new Set()).get('alimentacao')).toBe(3000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ancoragem da parcela no mês da COMPRA (2026-08-05)
//
// Caso que originou tudo: o dono comprou um jogo à vista e um presente parcelado no MESMO dia
// (04/08), no MESMO cartão, e os dois caíram na MESMA fatura (referência 09, cartão fecha dia
// 2). Na Análise o jogo apareceu em agosto e o presente só em setembro. Mesma fatura, dois meses.
// ─────────────────────────────────────────────────────────────────────────────

/** Mês 'yyyy-MM' a n meses de distância de (year, month1), month1 em base 1. */
function mesEm(year: number, month1: number, offset: number): string {
  const d = new Date(year, month1 - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Parcela `purchase` de compra parcelada, com a data da COMPRA no `effectiveAt` — é assim que
 * `addCardPurchaseToBatch` grava (a mesma data em todas as parcelas). */
function parcela(
  id: string,
  sourceTransactionId: string,
  installmentNumber: number,
  installmentTotal: number,
  amountCents: number,
  purchaseDate: string
): InvoiceLedgerEntry {
  return entry({
    id,
    type: 'purchase',
    amountCents,
    sourceTransactionId,
    installmentNumber,
    installmentTotal,
    effectiveAt: Timestamp.fromDate(new Date(purchaseDate))
  });
}

describe('parcela ancora no mês da COMPRA', () => {
  // Cartão fecha dia 2 → compra em 04/08 cai na fatura de referência 09.
  const COMPRA = '2026-08-04T12:00:00';
  const compradoEmAgosto: PurchaseMonthOf = () => '2026-08';
  const catOf = (id?: string) => (id === 'presente' ? 'presentes' : id === 'jogo' ? 'lazer' : undefined);

  /** Presente: R$300 em 3x de R$100, comprado 04/08 → faturas 09, 10, 11. */
  function presente3x(): InvoiceForSpending[] {
    return [
      { referenceMonth: '2026-09', ledgerEntries: [parcela('pres_1', 'presente', 1, 3, 10000, COMPRA)] },
      { referenceMonth: '2026-10', ledgerEntries: [parcela('pres_2', 'presente', 2, 3, 10000, COMPRA)] },
      { referenceMonth: '2026-11', ledgerEntries: [parcela('pres_3', 'presente', 3, 3, 10000, COMPRA)] }
    ];
  }

  it('⭐ caso real do dono: jogo à vista e presente parcelado, mesma fatura, contam no MESMO mês', () => {
    const jogo = txn({
      id: 'jogo', type: 'card_purchase', amountCents: 12000, categoryId: 'lazer', cardId: 'card',
      competenceMonth: '2026-08', cashMonth: '2026-08'
    });
    const invoices = presente3x();
    // A compra à vista também gera lançamento na fatura de setembro (ignorado: conta pela transação).
    invoices[0].ledgerEntries.push(entry({
      id: 'jogo_p', type: 'purchase', amountCents: 12000, sourceTransactionId: 'jogo',
      effectiveAt: Timestamp.fromDate(new Date(COMPRA))
    }));

    const agosto = spendingByCategoryForMonth('2026-08', [jogo], invoices, catOf, new Set(), compradoEmAgosto);
    expect(agosto.get('lazer')).toBe(12000);
    expect(agosto.get('presentes')).toBe(10000); // ← antes desta mudança: undefined

    const setembro = spendingByCategoryForMonth('2026-09', [jogo], invoices, catOf, new Set(), compradoEmAgosto);
    expect(setembro.get('presentes')).toBe(10000); // a parcela 2, não a 1
    expect(setembro.get('lazer') ?? 0).toBe(0);

    expect(spendingByCategoryForMonth('2026-10', [jogo], invoices, catOf, new Set(), compradoEmAgosto).get('presentes')).toBe(10000);
    expect(spendingByCategoryForMonth('2026-11', [jogo], invoices, catOf, new Set(), compradoEmAgosto).get('presentes') ?? 0).toBe(0);
  });

  it('preserva o espaçamento mensal: 10x vira uma parcela por mês, sem buraco nem dobra', () => {
    const invoices: InvoiceForSpending[] = Array.from({ length: 10 }, (_, i) => ({
      referenceMonth: mesEm(2026, 9, i),
      ledgerEntries: [parcela(`p${i + 1}`, 'presente', i + 1, 10, 10000, COMPRA)]
    }));
    const meses = Array.from({ length: 12 }, (_, i) => mesEm(2026, 8, i));

    const porMes = meses.map((m) => spendingByCategoryForMonth(m, [], invoices, catOf, new Set(), compradoEmAgosto).get('presentes') ?? 0);
    expect(porMes).toEqual([10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 0, 0]);
    expect(porMes.reduce((a, b) => a + b, 0)).toBe(100000);
  });

  it('compra ANTES do fechamento já caía no mês certo — não desloca', () => {
    // Compra em 01/08 num cartão que fecha dia 2 → fatura de agosto mesmo. diff 0.
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-08', ledgerEntries: [parcela('p1', 'presente', 1, 2, 10000, '2026-08-01T12:00:00')] },
      { referenceMonth: '2026-09', ledgerEntries: [parcela('p2', 'presente', 2, 2, 10000, '2026-08-01T12:00:00')] }
    ];
    expect(spendingByCategoryForMonth('2026-08', [], invoices, catOf, new Set(), compradoEmAgosto).get('presentes')).toBe(10000);
    expect(spendingByCategoryForMonth('2026-09', [], invoices, catOf, new Set(), compradoEmAgosto).get('presentes')).toBe(10000);
  });

  it('⭐ compra já em andamento (registerOngoingInstallments) NÃO desloca — não tem parcela 1', () => {
    // Comprada em janeiro fora do app, cadastrada a partir da parcela 7. Um `clamp(diff, 0, 1)`
    // daria shift 1 aqui (diff = 8) e recuaria tudo um mês sem motivo nenhum.
    const invoices: InvoiceForSpending[] = [7, 8, 9, 10].map((n, i) => ({
      referenceMonth: mesEm(2026, 9, i),
      ledgerEntries: [parcela(`p${n}`, 'antiga', n, 10, 10000, '2026-01-15T12:00:00')]
    }));
    const catAntiga = (id?: string) => (id === 'antiga' ? 'presentes' : undefined);
    const compradoEmJaneiro: PurchaseMonthOf = () => '2026-01';

    expect(installmentShiftBySource(invoices, compradoEmJaneiro).size).toBe(0);
    expect(spendingByCategoryForMonth('2026-09', [], invoices, catAntiga, new Set(), compradoEmJaneiro).get('presentes')).toBe(10000);
    expect(spendingByCategoryForMonth('2026-08', [], invoices, catAntiga, new Set(), compradoEmJaneiro).get('presentes') ?? 0).toBe(0);
  });

  it('legado do registerOngoingInstallments antigo (effectiveAt = vencimento) não desloca', () => {
    // A versão antiga gravava `effectiveAt` = dueDate da parcela e `cashMonth` = 1º de
    // nextDueMonth. Pior caso: a compra TEM parcela 1, mas as duas datas mentem — o diff não
    // dá 1, então nada se move.
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-09', ledgerEntries: [parcela('p1', 'legado', 1, 3, 10000, '2026-09-10T12:00:00')] },
      { referenceMonth: '2026-10', ledgerEntries: [parcela('p2', 'legado', 2, 3, 10000, '2026-10-10T12:00:00')] }
    ];
    const catLegado = (id?: string) => (id === 'legado' ? 'presentes' : undefined);

    expect(installmentShiftBySource(invoices, () => '2026-09').size).toBe(0);
    expect(spendingByCategoryForMonth('2026-09', [], invoices, catLegado, new Set(), () => '2026-09').get('presentes')).toBe(10000);
  });

  it('parcela sem installmentNumber (dado antigo) não desloca', () => {
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-09', ledgerEntries: [entry({ id: 'p1', type: 'purchase', amountCents: 10000, sourceTransactionId: 'presente', installmentTotal: 3 })] }
    ];
    expect(installmentShiftBySource(invoices, compradoEmAgosto).size).toBe(0);
    expect(spendingByCategoryForMonth('2026-09', [], invoices, catOf, new Set(), compradoEmAgosto).get('presentes')).toBe(10000);
  });

  it('sem purchaseMonthOf, cai no effectiveAt da parcela 1 e ancora igual', () => {
    expect(spendingByCategoryForMonth('2026-08', [], presente3x(), catOf, new Set(), noPurchaseMonth).get('presentes')).toBe(10000);
  });

  it('nunca move mais de 1 mês: diff grande é ignorado', () => {
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-12', ledgerEntries: [parcela('p1', 'presente', 1, 2, 10000, '2026-01-04T12:00:00')] }
    ];
    expect(installmentShiftBySource(invoices, () => '2026-01').size).toBe(0);
    expect(spendingByCategoryForMonth('2026-12', [], invoices, catOf, new Set(), () => '2026-01').get('presentes')).toBe(10000);
  });

  it('diff negativo (dado torto) é ignorado', () => {
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-08', ledgerEntries: [parcela('p1', 'presente', 1, 2, 10000, '2026-10-04T12:00:00')] }
    ];
    expect(installmentShiftBySource(invoices, () => '2026-10').size).toBe(0);
  });

  it('monthlyTotals bate com o donut: saída de agosto inclui jogo + parcela 1', () => {
    const jogo = txn({
      id: 'jogo', type: 'card_purchase', amountCents: 12000, categoryId: 'lazer', cardId: 'card',
      competenceMonth: '2026-08', cashMonth: '2026-08'
    });
    const invoices = presente3x();
    invoices[0].ledgerEntries.push(entry({
      id: 'jogo_p', type: 'purchase', amountCents: 12000, sourceTransactionId: 'jogo',
      effectiveAt: Timestamp.fromDate(new Date(COMPRA))
    }));

    const totais = monthlyTotals(['2026-08', '2026-09'], [jogo], invoices, new Set(), compradoEmAgosto);
    expect(totais[0].expenseCents).toBe(22000);
    expect(totais[1].expenseCents).toBe(10000);
  });

  it('lastCommittedMonth acompanha a ancoragem (não sobra mês futuro vazio)', () => {
    expect(lastCommittedMonth('2026-08', presente3x(), [], compradoEmAgosto)).toBe('2026-10');
  });

  it('committedByCategoryForMonth de setembro recebe a parcela 2', () => {
    expect(committedByCategoryForMonth('2026-09', presente3x(), [], catOf, compradoEmAgosto).get('presentes')).toBe(10000);
  });

  it('a tendência por categoria enxerga a série ancorada', () => {
    const meses = ['2026-08', '2026-09', '2026-10', '2026-11'];
    const byCat = spendingByCategoryAcrossMonths(meses, [], presente3x(), catOf, new Set(), compradoEmAgosto);
    expect(byCat.get('presentes')?.get('2026-08')).toBe(10000);
    expect(byCat.get('presentes')?.get('2026-11')).toBeUndefined();
  });

  it('⭐ ongoingInstallmentPurchases NÃO é reancorada (responde caixa, não competência)', () => {
    // "Quanto ainda devo" conta pelas faturas 09/10/11, sem deslocar nada.
    const ongoing = ongoingInstallmentPurchases('2026-09', presente3x(), () => 'Presente');
    expect(ongoing).toHaveLength(1);
    expect(ongoing[0].remainingCount).toBe(3);
    expect(ongoing[0].remainingCents).toBe(30000);
    expect(ongoing[0].fullAmountCents).toBe(30000);
  });

  it('conserva o valor cheio: a soma de todos os meses continua sendo a compra inteira', () => {
    const meses = Array.from({ length: 8 }, (_, i) => mesEm(2026, 7, i));
    const invoices = presente3x();
    const soma = (fn: PurchaseMonthOf) =>
      meses.reduce((acc, m) => acc + (spendingByCategoryForMonth(m, [], invoices, catOf, new Set(), fn).get('presentes') ?? 0), 0);

    expect(soma(noPurchaseMonth)).toBe(30000);
    expect(soma(compradoEmAgosto)).toBe(30000);
  });
});

describe('antecipação sob a ancoragem', () => {
  const COMPRA = '2026-08-04T12:00:00';
  const compradoEmAgosto: PurchaseMonthOf = () => '2026-08';
  const catOf = () => 'presentes';

  /** R$500 em 5x de R$100, comprado 04/08 → faturas 09..01, ancoradas em ago..dez. */
  function cincoParcelas(): InvoiceForSpending[] {
    return Array.from({ length: 5 }, (_, i) => ({
      referenceMonth: mesEm(2026, 9, i),
      ledgerEntries: [parcela(`p${i + 1}`, 'presente', i + 1, 5, 10000, COMPRA)]
    }));
  }

  it('⭐ a tabela do dono: antecipar as 2 últimas em outubro joga o gasto pra outubro', () => {
    // Ancoragem sem antecipar: ago, set, out, nov, dez — R$100 em cada.
    const invoices = cincoParcelas();
    const meses = Array.from({ length: 5 }, (_, i) => mesEm(2026, 8, i));
    const semAntecipar = meses.map((m) => spendingByCategoryForMonth(m, [], invoices, catOf, new Set(), compradoEmAgosto).get('presentes') ?? 0);
    expect(semAntecipar).toEqual([10000, 10000, 10000, 10000, 10000]);

    // Em OUTUBRO antecipa as parcelas 4 e 5 (ancoradas em nov e dez).
    const antecipadoEm = Timestamp.fromDate(new Date('2026-10-20T12:00:00'));
    invoices[3].ledgerEntries.push(entry({ id: 'c4', type: 'installment_anticipation_credit', amountCents: 10000, sourceTransactionId: 'presente', effectiveAt: antecipadoEm }));
    invoices[4].ledgerEntries.push(entry({ id: 'c5', type: 'installment_anticipation_credit', amountCents: 10000, sourceTransactionId: 'presente', effectiveAt: antecipadoEm }));
    // Os dois débitos caem na fatura ATUAL (referência 11) — um por parcela, como grava
    // `anticipateInstallments`.
    invoices[2].ledgerEntries.push(entry({ id: 'd4', type: 'installment_anticipation', amountCents: 10000, sourceTransactionId: 'presente', effectiveAt: antecipadoEm }));
    invoices[2].ledgerEntries.push(entry({ id: 'd5', type: 'installment_anticipation', amountCents: 10000, sourceTransactionId: 'presente', effectiveAt: antecipadoEm }));

    const comAntecipacao = meses.map((m) => spendingByCategoryForMonth(m, [], invoices, catOf, new Set(), compradoEmAgosto).get('presentes') ?? 0);
    expect(comAntecipacao).toEqual([10000, 10000, 30000, 0, 0]);
    // Conservação: antecipar não cria nem destrói dinheiro.
    expect(comAntecipacao.reduce((a, b) => a + b, 0)).toBe(50000);
  });

  it('⭐ o débito da antecipação conta pelo mês em que se ANTECIPOU, não pelo da fatura', () => {
    // Antecipou em 20/10 com o cartão já fechado → o débito cai na fatura de referência 11.
    // Contando pela fatura, apareceria em novembro; pelo `effectiveAt`, em outubro (correto).
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-11', ledgerEntries: [entry({
        id: 'd', type: 'installment_anticipation', amountCents: 10000, sourceTransactionId: 'presente',
        effectiveAt: Timestamp.fromDate(new Date('2026-10-20T12:00:00'))
      })] }
    ];
    expect(spendingByCategoryForMonth('2026-10', [], invoices, catOf, new Set(), compradoEmAgosto).get('presentes')).toBe(10000);
    expect(spendingByCategoryForMonth('2026-11', [], invoices, catOf, new Set(), compradoEmAgosto).get('presentes') ?? 0).toBe(0);
  });

  it('⭐ antecipar e depois EXCLUIR a compra zera tudo (sem crédito fantasma)', () => {
    // `reverseCardPurchaseOnDelete` estorna TODO lançamento da compra: as parcelas e o débito
    // viram `purchase_reversal`; o crédito de antecipação vira `anticipation_credit_reversal`.
    const invoices = cincoParcelas();
    const antecipadoEm = Timestamp.fromDate(new Date('2026-10-20T12:00:00'));
    invoices[4].ledgerEntries.push(entry({ id: 'c5', type: 'installment_anticipation_credit', amountCents: 10000, sourceTransactionId: 'presente', effectiveAt: antecipadoEm }));
    invoices[2].ledgerEntries.push(entry({ id: 'd5', type: 'installment_anticipation', amountCents: 10000, sourceTransactionId: 'presente', effectiveAt: antecipadoEm }));

    const excluidoEm = Timestamp.fromDate(new Date('2026-11-05T12:00:00'));
    invoices.forEach((inv, i) => inv.ledgerEntries.push(entry({ id: `rev_p${i + 1}`, type: 'purchase_reversal', amountCents: 10000, sourceTransactionId: 'presente', effectiveAt: excluidoEm })));
    invoices[2].ledgerEntries.push(entry({ id: 'rev_d5', type: 'purchase_reversal', amountCents: 10000, sourceTransactionId: 'presente', effectiveAt: excluidoEm }));
    invoices[4].ledgerEntries.push(entry({ id: 'rev_c5', type: 'anticipation_credit_reversal', amountCents: 10000, sourceTransactionId: 'presente', effectiveAt: excluidoEm }));

    const meses = Array.from({ length: 8 }, (_, i) => mesEm(2026, 8, i));
    for (const m of meses) {
      expect(spendingByCategoryForMonth(m, [], invoices, catOf, new Set(), compradoEmAgosto).get('presentes') ?? 0).toBe(0);
    }
    expect(monthlyTotals(meses, [], invoices, new Set(), compradoEmAgosto).every((t) => t.expenseCents === 0)).toBe(true);
  });

  it('tarifa avulsa da fatura (sem sourceTransactionId) não é arrastada por uma compra excluída', () => {
    const invoices: InvoiceForSpending[] = [
      { referenceMonth: '2026-09', ledgerEntries: [
        parcela('p1', 'presente', 1, 3, 10000, COMPRA),
        entry({ id: 'rev', type: 'purchase_reversal', amountCents: 10000, sourceTransactionId: 'presente' }),
        entry({ id: 'anuidade', type: 'fee', amountCents: 2500 })
      ] }
    ];
    const result = spendingByCategoryForMonth('2026-09', [], invoices, (id) => (id ? 'presentes' : undefined), new Set(), compradoEmAgosto);
    expect(result.get('presentes') ?? 0).toBe(0);      // a compra excluída some inteira
    expect(result.get(NO_CATEGORY)).toBe(2500);         // a tarifa da fatura fica
  });

  it('reversedSourceIds e recognizedExpenseByMonth concordam com o donut', () => {
    const invoices = cincoParcelas();
    const parceled = installmentPurchaseIds(invoices);
    const shifts = installmentShiftBySource(invoices, compradoEmAgosto);
    const porMes = recognizedExpenseByMonth(invoices, parceled, shifts, reversedSourceIds(invoices));

    expect(porMes.get('2026-08')).toBe(10000);
    expect(porMes.get('2026-12')).toBe(10000);
    expect(porMes.get('2027-01')).toBeUndefined(); // a última parcela recuou pra dezembro
  });
});
