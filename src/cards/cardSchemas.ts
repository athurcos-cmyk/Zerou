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

// Fase 1 do editar cartão: só limite e nome. Bandeira/últimos 4 dígitos exigem excluir e
// recriar; closingDay/dueDay ficam pra Fase 2 (mudar impacta faturas já geradas).
export const updateCardSchema = z.object({
  limitCents: moneyCentsSchema.optional(),
  name: z.string().trim().min(2, 'Informe o nome do cartão.').max(80).optional()
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

// Compra parcelada que já estava rolando quando a pessoa começou a usar o app.
// Ela informa o valor da parcela, em que parcela está (7 de 10) e em qual mês cai a
// próxima — o app cria só as parcelas que faltam, nas faturas certas, rotuladas 7/10…10/10.
export const registerOngoingInstallmentsSchema = z
  .object({
    cardId: z.string().trim().min(1),
    description: z.string().trim().min(2).max(120),
    installmentValueCents: moneyCentsSchema.refine((v) => v > 0, 'Informe o valor da parcela.'),
    currentInstallment: z.number().int().min(1).max(72),
    totalInstallments: z.number().int().min(2).max(72),
    // Primeiro dia do mês em que a PRÓXIMA parcela é cobrada — usado só pra calcular em qual
    // fatura cada parcela cai (`planOngoingInstallments`), nunca vira data de transaction/ledger.
    nextDueMonth: z.date(),
    // Data real da compra original, informada pela pessoa — vira `date` da transaction e
    // `effectiveAt` de cada ledger entry (ver Pendência 2b/3 do plano de correção).
    purchaseDate: z.date(),
    categoryId: z.string().trim().max(120).optional()
  })
  .refine((v) => v.currentInstallment <= v.totalInstallments, {
    message: 'A parcela atual não pode ser maior que o total.',
    path: ['currentInstallment']
  });

export const anticipateInstallmentsSchema = z.object({
  cardId: z.string().trim().min(1),
  currentInvoiceId: z.string().trim().min(1),
  credits: z.array(z.object({
    invoiceId: z.string().trim().min(1),
    amountCents: moneyCentsSchema,
    sourceTransactionId: z.string().trim(),
    // Pra rotular "Parcela antecipada · 8/10" na fatura de origem, em vez de um genérico
    // "Parcela antecipada" sem dizer qual. Opcional pra não quebrar quem já anticipou sem isso.
    installmentNumber: z.number().int().min(1).max(72).optional(),
    installmentTotal: z.number().int().min(1).max(72).optional()
  })).min(1),
  effectiveAt: z.date()
});

export const reconcileInvoiceSchema = z.object({
  cardId: z.string().trim().min(1),
  invoiceId: z.string().trim().min(1),
  status: z.enum(['closed', 'partial', 'paid', 'overpaid'])
});

export type CreateCreditCardInput = z.infer<typeof createCreditCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
export type CreateCardPurchaseInput = z.infer<typeof createCardPurchaseSchema>;
export type RecordInvoicePaymentInput = z.infer<typeof recordInvoicePaymentSchema>;
export type RecordInvoiceCreditInput = z.infer<typeof recordInvoiceCreditSchema>;
export type RecordInvoiceFeeInput = z.infer<typeof recordInvoiceFeeSchema>;
export type AnticipateInstallmentsInput = z.infer<typeof anticipateInstallmentsSchema>;
export type RegisterOngoingInstallmentsInput = z.infer<typeof registerOngoingInstallmentsSchema>;
export type ReconcileInvoiceInput = z.infer<typeof reconcileInvoiceSchema>;
export { signedMoneyCentsSchema };
