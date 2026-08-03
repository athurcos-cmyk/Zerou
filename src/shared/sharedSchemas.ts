import { z } from 'zod';

const moneyCentsSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const createSharedExpenseClaimSchema = z.object({
  description: z.string().trim().min(2, 'Descreva o gasto compartilhado.').max(120),
  totalAmountCents: moneyCentsSchema,
  participantUserIds: z.array(z.string().trim().min(1)).min(2).max(2),
  // Data do gasto. A MESMA vai pro doc do casal e pra transação pessoal de quem pagou —
  // duas datas diferentes fariam o mês da Análise divergir do que os dois veem no espaço.
  occurredOn: z.date(),
  // Optional explicit split (por pessoa). Quando ausente, divide igualmente.
  split: z
    .array(z.object({ userId: z.string().trim().min(1), amountCents: z.number().int().min(0) }))
    .min(2)
    .max(2)
    .optional()
});

/**
 * Registrar um pagamento de acerto que JÁ aconteceu ("já paguei minha parte").
 *
 * `amountCents` é quanto foi pago agora; `totalOwedCents` é a dívida inteira que o acerto
 * fecha — os dois juntos decidem se o acerto nasce `settled` ou `partially_paid`, e a regra
 * do Firestore refaz essa mesma conta pra ninguém criar "quitado" pagando R$ 1.
 */
export const registerSettlementPaymentSchema = z
  .object({
    toUserId: z.string().trim().min(1),
    amountCents: moneyCentsSchema,
    totalOwedCents: moneyCentsSchema
  })
  .refine((value) => value.amountCents <= value.totalOwedCents, {
    message: 'O valor pago não pode passar do total do acerto.',
    path: ['amountCents']
  });

export const updateClaimStatusSchema = z.object({
  claimId: z.string().trim().min(1),
  status: z.enum(['accepted', 'disputed', 'settled'])
});

export const createSettlementSchema = z.object({
  fromUserId: z.string().trim().min(1),
  toUserId: z.string().trim().min(1),
  amountCents: moneyCentsSchema
});

export const recordSettlementPaymentSchema = z.object({
  settlementId: z.string().trim().min(1),
  amountCents: moneyCentsSchema
});

export type CreateSharedExpenseClaimInput = z.infer<typeof createSharedExpenseClaimSchema>;
export type UpdateClaimStatusInput = z.infer<typeof updateClaimStatusSchema>;
export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;
export type RecordSettlementPaymentInput = z.infer<typeof recordSettlementPaymentSchema>;
export type RegisterSettlementPaymentInput = z.infer<typeof registerSettlementPaymentSchema>;
