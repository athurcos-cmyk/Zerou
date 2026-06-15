import type { InvoiceLedgerEntryType, InvoiceStatus, MoneyCents } from '../../types/contracts';

export interface InvoiceLedgerInput {
  id: string;
  type: InvoiceLedgerEntryType;
  amountCents: MoneyCents;
  effectiveAt: Date;
  idempotencyKey: string;
  installmentGroupId?: string;
  installmentNumber?: number;
  installmentsTotal?: number;
}

export interface InvoiceCalculation {
  purchasesTotalCents: MoneyCents;
  paymentsTotalCents: MoneyCents;
  creditsTotalCents: MoneyCents;
  feesTotalCents: MoneyCents;
  outstandingBalanceCents: MoneyCents;
  overpaidCreditCents: MoneyCents;
  status: InvoiceStatus;
  recognizedExpenseCents: MoneyCents;
  appliedEntries: InvoiceLedgerInput[];
}

export interface InvoiceMutationResult {
  entries: InvoiceLedgerInput[];
  created: boolean;
}
