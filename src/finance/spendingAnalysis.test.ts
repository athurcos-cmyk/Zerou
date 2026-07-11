import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { InvoiceLedgerEntry, Transaction } from '../types/contracts';
import {
  monthlyTotals,
  ongoingInstallmentPurchases,
  spendingByCategoryForMonth,
  NO_CATEGORY,
  type InvoiceForSpending
} from './spendingAnalysis';

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

  it('não conta parcela já antecipada como restante', () => {
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
    // Set/2026 foi antecipada (crédito zera o mês); restam jul e ago = R$600, 2 parcelas.
    const [purchase] = ongoingInstallmentPurchases('2026-07', invoices, () => 'Óculos');
    expect(purchase.remainingCents).toBe(60000);
    expect(purchase.remainingCount).toBe(2);
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
});
