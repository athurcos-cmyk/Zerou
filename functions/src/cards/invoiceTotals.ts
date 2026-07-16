// Porta de src/domain/invoices/calculateInvoice.ts (só a parte de soma por tipo — status
// fino continua calculado no client a partir dos totais, ver comentário em
// invoiceLedgerEntryTrigger.ts). Mantenha em sincronia manualmente se a lógica original mudar.

export type InvoiceLedgerEntryType =
  | 'purchase'
  | 'payment'
  | 'advance_payment'
  | 'refund_credit'
  | 'chargeback_credit'
  | 'manual_credit'
  | 'manual_debit'
  | 'interest'
  | 'fine'
  | 'iof'
  | 'fee'
  | 'installment_anticipation'
  | 'installment_anticipation_credit'
  | 'purchase_reversal';

const debitTypes = new Set(['purchase', 'manual_debit']);
const feeTypes = new Set(['interest', 'fine', 'iof', 'fee']);
const paymentTypes = new Set(['payment', 'advance_payment']);
const creditTypes = new Set(['refund_credit', 'chargeback_credit', 'manual_credit', 'purchase_reversal']);

export interface InvoiceTotalsDelta {
  purchasesTotalCents: number;
  paymentsTotalCents: number;
  creditsTotalCents: number;
  feesTotalCents: number;
}

/** Em qual dos 4 totais uma entrada de ledger nova entra, e com que valor. */
export function invoiceTotalsDeltaForEntry(type: InvoiceLedgerEntryType, amountCents: number): InvoiceTotalsDelta {
  const zero: InvoiceTotalsDelta = {
    purchasesTotalCents: 0,
    paymentsTotalCents: 0,
    creditsTotalCents: 0,
    feesTotalCents: 0,
  };

  if (debitTypes.has(type) || type === 'installment_anticipation') {
    return { ...zero, purchasesTotalCents: amountCents };
  }

  if (type === 'installment_anticipation_credit') {
    return { ...zero, creditsTotalCents: amountCents };
  }

  if (feeTypes.has(type)) {
    return { ...zero, feesTotalCents: amountCents };
  }

  if (paymentTypes.has(type)) {
    return { ...zero, paymentsTotalCents: amountCents };
  }

  if (creditTypes.has(type)) {
    return { ...zero, creditsTotalCents: amountCents };
  }

  return zero;
}

export interface InvoiceOutstanding {
  outstandingBalanceCents: number;
  overpaidCreditCents: number;
}

export function outstandingFromTotals(totals: {
  purchasesTotalCents: number;
  paymentsTotalCents: number;
  creditsTotalCents: number;
  feesTotalCents: number;
}): InvoiceOutstanding {
  const rawBalance = totals.purchasesTotalCents + totals.feesTotalCents - totals.paymentsTotalCents - totals.creditsTotalCents;
  return {
    outstandingBalanceCents: Math.max(rawBalance, 0),
    overpaidCreditCents: Math.max(-rawBalance, 0),
  };
}
