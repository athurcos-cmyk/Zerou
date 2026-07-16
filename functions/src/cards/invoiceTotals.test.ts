import { describe, expect, it } from 'vitest';
import { invoiceTotalsDeltaForEntry, outstandingFromTotals } from './invoiceTotals.js';

describe('invoiceTotalsDeltaForEntry', () => {
  it('routes each type to the right bucket', () => {
    expect(invoiceTotalsDeltaForEntry('purchase', 1000).purchasesTotalCents).toBe(1000);
    expect(invoiceTotalsDeltaForEntry('manual_debit', 1000).purchasesTotalCents).toBe(1000);
    expect(invoiceTotalsDeltaForEntry('installment_anticipation', 1000).purchasesTotalCents).toBe(1000);
    expect(invoiceTotalsDeltaForEntry('installment_anticipation_credit', 1000).creditsTotalCents).toBe(1000);
    expect(invoiceTotalsDeltaForEntry('interest', 1000).feesTotalCents).toBe(1000);
    expect(invoiceTotalsDeltaForEntry('fine', 1000).feesTotalCents).toBe(1000);
    expect(invoiceTotalsDeltaForEntry('iof', 1000).feesTotalCents).toBe(1000);
    expect(invoiceTotalsDeltaForEntry('fee', 1000).feesTotalCents).toBe(1000);
    expect(invoiceTotalsDeltaForEntry('payment', 1000).paymentsTotalCents).toBe(1000);
    expect(invoiceTotalsDeltaForEntry('advance_payment', 1000).paymentsTotalCents).toBe(1000);
    expect(invoiceTotalsDeltaForEntry('refund_credit', 1000).creditsTotalCents).toBe(1000);
    expect(invoiceTotalsDeltaForEntry('chargeback_credit', 1000).creditsTotalCents).toBe(1000);
    expect(invoiceTotalsDeltaForEntry('manual_credit', 1000).creditsTotalCents).toBe(1000);
    expect(invoiceTotalsDeltaForEntry('purchase_reversal', 1000).creditsTotalCents).toBe(1000);
  });
});

describe('outstandingFromTotals', () => {
  it('is positive when purchases+fees exceed payments+credits', () => {
    const result = outstandingFromTotals({
      purchasesTotalCents: 10000,
      feesTotalCents: 0,
      paymentsTotalCents: 4000,
      creditsTotalCents: 0,
    });
    expect(result.outstandingBalanceCents).toBe(6000);
    expect(result.overpaidCreditCents).toBe(0);
  });

  it('is zero when exactly paid', () => {
    const result = outstandingFromTotals({
      purchasesTotalCents: 10000,
      feesTotalCents: 0,
      paymentsTotalCents: 10000,
      creditsTotalCents: 0,
    });
    expect(result.outstandingBalanceCents).toBe(0);
    expect(result.overpaidCreditCents).toBe(0);
  });

  it('tracks overpayment as credit', () => {
    const result = outstandingFromTotals({
      purchasesTotalCents: 5000,
      feesTotalCents: 0,
      paymentsTotalCents: 7000,
      creditsTotalCents: 0,
    });
    expect(result.outstandingBalanceCents).toBe(0);
    expect(result.overpaidCreditCents).toBe(2000);
  });
});
