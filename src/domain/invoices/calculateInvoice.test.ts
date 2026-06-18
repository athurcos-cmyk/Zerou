import { describe, expect, it } from 'vitest';
import { appendLedgerEntry, calculateInvoice, expenseRecognizedWithoutInvoicePayments } from './calculateInvoice';
import { ledgerEntry, payment, purchase } from './invoiceFixtures';

describe('invoice ledger calculations', () => {
  it('calculates purchases 1090, payments 550, outstanding 540', () => {
    const invoice = calculateInvoice([purchase(109000, 'p-1090'), payment(55000, 'pay-550')], 'closed');

    expect(invoice.purchasesTotalCents).toBe(109000);
    expect(invoice.paymentsTotalCents).toBe(55000);
    expect(invoice.outstandingBalanceCents).toBe(54000);
    expect(invoice.status).toBe('partial');
  });

  it('supports two partial payments and total payment after closing', () => {
    const partial = calculateInvoice([purchase(100000, 'p-1'), payment(30000, 'pay-1'), payment(20000, 'pay-2')], 'closed');
    const paid = calculateInvoice([...partial.appliedEntries, payment(50000, 'pay-3')], 'closed');

    expect(partial.outstandingBalanceCents).toBe(50000);
    expect(partial.status).toBe('partial');
    expect(paid.outstandingBalanceCents).toBe(0);
    expect(paid.status).toBe('paid');
  });

  it('keeps open invoice as open regardless of advance payments', () => {
    const withPartial = calculateInvoice([purchase(100000, 'p-1'), payment(30000, 'pay-advance')]);
    const fullyCovered = calculateInvoice([purchase(100000, 'p-1'), payment(100000, 'pay-full')]);

    expect(withPartial.status).toBe('open');
    expect(withPartial.outstandingBalanceCents).toBe(70000);
    expect(fullyCovered.status).toBe('open');
    expect(fullyCovered.outstandingBalanceCents).toBe(0);
  });

  it('tracks overpayment as excess credit', () => {
    const invoice = calculateInvoice([purchase(50000, 'p-1'), payment(70000, 'pay-over')]);

    expect(invoice.outstandingBalanceCents).toBe(0);
    expect(invoice.overpaidCreditCents).toBe(20000);
    expect(invoice.status).toBe('overpaid');
  });

  it('applies refunds before and after closing as credits', () => {
    const open = calculateInvoice([purchase(100000, 'p-1'), ledgerEntry('refund_credit', 25000, 'refund-before')]);
    const closed = calculateInvoice([...open.appliedEntries, ledgerEntry('refund_credit', 25000, 'refund-after')], 'closed');

    expect(open.creditsTotalCents).toBe(25000);
    expect(open.outstandingBalanceCents).toBe(75000);
    expect(closed.creditsTotalCents).toBe(50000);
    expect(closed.outstandingBalanceCents).toBe(50000);
  });

  it('handles chargeback, fees, interest, fine and IOF', () => {
    const invoice = calculateInvoice([
      purchase(100000, 'p-1'),
      ledgerEntry('chargeback_credit', 10000, 'chargeback'),
      ledgerEntry('fee', 500, 'fee'),
      ledgerEntry('interest', 700, 'interest'),
      ledgerEntry('fine', 300, 'fine'),
      ledgerEntry('iof', 100, 'iof')
    ]);

    expect(invoice.creditsTotalCents).toBe(10000);
    expect(invoice.feesTotalCents).toBe(1600);
    expect(invoice.outstandingBalanceCents).toBe(91600);
  });

  it('supports installments and installment anticipation', () => {
    const invoice = calculateInvoice([
      ledgerEntry('purchase', 40000, 'installment-1', {
        installmentGroupId: 'group-a',
        installmentNumber: 1,
        installmentsTotal: 4
      }),
      ledgerEntry('installment_anticipation', 120000, 'anticipate-remaining', {
        installmentGroupId: 'group-a'
      })
    ]);

    expect(invoice.purchasesTotalCents).toBe(160000);
    expect(invoice.outstandingBalanceCents).toBe(160000);
  });

  it('does not duplicate ledger when retry uses same idempotencyKey', () => {
    const first = appendLedgerEntry([], purchase(10000, 'same-key'));
    const retry = appendLedgerEntry(first.entries, purchase(10000, 'same-key'));

    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(calculateInvoice(retry.entries).purchasesTotalCents).toBe(10000);
  });

  it('does not count invoice payment as another expense', () => {
    const invoice = [purchase(80000, 'p-1'), payment(80000, 'pay-1')];

    expect(expenseRecognizedWithoutInvoicePayments(invoice)).toBe(80000);
  });
});
