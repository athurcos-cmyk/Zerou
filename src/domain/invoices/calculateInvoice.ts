import type { InvoiceLedgerInput, InvoiceCalculation, InvoiceMutationResult } from './invoiceTypes';

const debitTypes = new Set(['purchase', 'manual_debit']);
const feeTypes = new Set(['interest', 'fine', 'iof', 'fee']);
const paymentTypes = new Set(['payment', 'advance_payment']);
const creditTypes = new Set(['refund_credit', 'chargeback_credit', 'manual_credit', 'purchase_reversal']);

function uniqueEntries(entries: InvoiceLedgerInput[]) {
  const seen = new Set<string>();
  const result: InvoiceLedgerInput[] = [];

  entries.forEach((entry) => {
    if (seen.has(entry.idempotencyKey)) {
      return;
    }

    seen.add(entry.idempotencyKey);
    result.push(entry);
  });

  return result;
}

export function appendLedgerEntry(entries: InvoiceLedgerInput[], entry: InvoiceLedgerInput): InvoiceMutationResult {
  if (entries.some((existing) => existing.idempotencyKey === entry.idempotencyKey)) {
    return { entries, created: false };
  }

  return { entries: [...entries, entry], created: true };
}

export function calculateInvoice(entries: InvoiceLedgerInput[], lifecycle: 'open' | 'closed' = 'open', dueDate?: Date): InvoiceCalculation {
  const appliedEntries = uniqueEntries(entries);
  let purchasesTotalCents = 0;
  let paymentsTotalCents = 0;
  let creditsTotalCents = 0;
  let feesTotalCents = 0;

  appliedEntries.forEach((entry) => {
    if (debitTypes.has(entry.type)) {
      purchasesTotalCents += entry.amountCents;
      return;
    }

    if (entry.type === 'installment_anticipation') {
      purchasesTotalCents += entry.amountCents;
      return;
    }

    if (entry.type === 'installment_anticipation_credit') {
      creditsTotalCents += entry.amountCents;
      return;
    }

    if (feeTypes.has(entry.type)) {
      feesTotalCents += entry.amountCents;
      return;
    }

    if (paymentTypes.has(entry.type)) {
      paymentsTotalCents += entry.amountCents;
      return;
    }

    if (creditTypes.has(entry.type)) {
      creditsTotalCents += entry.amountCents;
    }
  });

  const rawBalance = purchasesTotalCents + feesTotalCents - paymentsTotalCents - creditsTotalCents;
  const outstandingBalanceCents = Math.max(rawBalance, 0);
  const overpaidCreditCents = Math.max(-rawBalance, 0);
  const status = resolveInvoiceStatus({
    lifecycle,
    outstandingBalanceCents,
    overpaidCreditCents,
    paymentsTotalCents,
    purchasesTotalCents,
    feesTotalCents,
    dueDate
  });

  return {
    purchasesTotalCents,
    paymentsTotalCents,
    creditsTotalCents,
    feesTotalCents,
    outstandingBalanceCents,
    overpaidCreditCents,
    status,
    recognizedExpenseCents: purchasesTotalCents + feesTotalCents - creditsTotalCents,
    appliedEntries
  };
}

function resolveInvoiceStatus(input: {
  lifecycle: 'open' | 'closed';
  outstandingBalanceCents: number;
  overpaidCreditCents: number;
  paymentsTotalCents: number;
  purchasesTotalCents: number;
  feesTotalCents: number;
  dueDate?: Date;
}) {
  if (input.overpaidCreditCents > 0) {
    return 'overpaid';
  }

  // Fatura aberta permanece aberta até o fechamento, independente de pagamentos antecipados.
  if (input.lifecycle === 'open') {
    return 'open';
  }

  // Lifecycle fechada: resolve pelo estado dos pagamentos.
  if (input.outstandingBalanceCents === 0 && input.paymentsTotalCents > 0) {
    return 'paid';
  }

  if (input.paymentsTotalCents > 0) {
    return 'partial';
  }

  if (input.dueDate && input.dueDate < new Date() && input.outstandingBalanceCents > 0) {
    return 'overdue';
  }

  return 'closed';
}

export function expenseRecognizedWithoutInvoicePayments(entries: InvoiceLedgerInput[]) {
  return calculateInvoice(entries).recognizedExpenseCents;
}
