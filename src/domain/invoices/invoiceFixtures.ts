import type { InvoiceLedgerInput } from './invoiceTypes';

export function ledgerEntry(
  type: InvoiceLedgerInput['type'],
  amountCents: number,
  idempotencyKey: string,
  overrides: Partial<InvoiceLedgerInput> = {}
): InvoiceLedgerInput {
  return {
    id: `ledger-${idempotencyKey}`,
    type,
    amountCents,
    effectiveAt: new Date('2026-06-14T12:00:00'),
    idempotencyKey,
    ...overrides
  };
}

export function purchase(amountCents: number, key: string) {
  return ledgerEntry('purchase', amountCents, key);
}

export function payment(amountCents: number, key: string) {
  return ledgerEntry('payment', amountCents, key);
}
