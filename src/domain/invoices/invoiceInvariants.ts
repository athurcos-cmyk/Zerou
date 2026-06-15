import { calculateInvoice } from './calculateInvoice';
import type { InvoiceLedgerInput } from './invoiceTypes';

export function assertInvoiceInvariants(entries: InvoiceLedgerInput[]) {
  const calculation = calculateInvoice(entries);
  const idempotencyKeys = new Set(calculation.appliedEntries.map((entry) => entry.idempotencyKey));

  if (idempotencyKeys.size !== calculation.appliedEntries.length) {
    throw new Error('Ledger possui idempotencyKey duplicada.');
  }

  if (calculation.outstandingBalanceCents < 0) {
    throw new Error('Saldo pendente nao pode ser negativo.');
  }

  if (calculation.overpaidCreditCents < 0) {
    throw new Error('Credito excedente nao pode ser negativo.');
  }

  return calculation;
}
