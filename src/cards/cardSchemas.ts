import { z } from 'zod';
import { signedMoneyCentsSchema } from '../finance/financeSchemas';

const moneyCentsSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const cardBrandOptions = ['Visa', 'Mastercard', 'Elo', 'Amex', 'Hipercard', 'Outro'] as const;

export const createCreditCardSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do cartão.').max(80),
  lastFour: z.string().trim().regex(/^\d{4}$/, 'Informe os 4 últimos dígitos.'),
  brand: z.enum(cardBrandOptions),
  limitCents: moneyCentsSchema,
  closingDay: z.number().int().min(1).max(28),
  dueDay: z.number().int().min(1).max(28),
  colorToken: z.string().trim().min(3).max(40).default('chart-1')
});

export const createCardPurchaseSchema = z.object({
  cardId: z.string().trim().min(1),
  description: z.string().trim().min(2).max(120),
  amountCents: moneyCentsSchema,
  purchaseDate: z.date(),
  categoryId: z.string().trim().max(120).optional(),
  installments: z.number().int().min(1).max(24).default(1)
});

export const recordInvoicePaymentSchema = z.object({
  cardId: z.string().trim().min(1),
  invoiceId: z.string().trim().min(1),
  accountId: z.string().trim().min(1),
  amountCents: moneyCentsSchema,
  paidAt: z.date(),
  advance: z.boolean().default(false)
});

export const recordInvoiceCreditSchema = z.object({
  cardId: z.string().trim().min(1),
  invoiceId: z.string().trim().min(1),
  type: z.enum(['refund_credit', 'chargeback_credit', 'manual_credit']),
  amountCents: moneyCentsSchema,
  effectiveAt: z.date(),
  description: z.string().trim().min(2).max(120)
});

export const recordInvoiceFeeSchema = z.object({
  cardId: z.string().trim().min(1),
  invoiceId: z.string().trim().min(1),
  type: z.enum(['interest', 'fine', 'iof', 'fee', 'manual_debit']),
  amountCents: moneyCentsSchema,
  effectiveAt: z.date(),
  description: z.string().trim().min(2).max(120)
});

export const anticipateInstallmentsSchema = z.object({
  cardId: z.string().trim().min(1),
  invoiceId: z.string().trim().min(1),
  amountCents: moneyCentsSchema,
  effectiveAt: z.date(),
  installmentGroupId: z.string().trim().min(1).max(120)
});

export const reconcileInvoiceSchema = z.object({
  cardId: z.string().trim().min(1),
  invoiceId: z.string().trim().min(1),
  status: z.enum(['closed', 'partial', 'paid', 'overpaid'])
});

export type CreateCreditCardInput = z.infer<typeof createCreditCardSchema>;
export type CreateCardPurchaseInput = z.infer<typeof createCardPurchaseSchema>;
export type RecordInvoicePaymentInput = z.infer<typeof recordInvoicePaymentSchema>;
export type RecordInvoiceCreditInput = z.infer<typeof recordInvoiceCreditSchema>;
export type RecordInvoiceFeeInput = z.infer<typeof recordInvoiceFeeSchema>;
export type AnticipateInstallmentsInput = z.infer<typeof anticipateInstallmentsSchema>;
export type ReconcileInvoiceInput = z.infer<typeof reconcileInvoiceSchema>;
export { signedMoneyCentsSchema };
