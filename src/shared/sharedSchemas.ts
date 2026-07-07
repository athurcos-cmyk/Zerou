import { z } from 'zod';

const moneyCentsSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const createSharedExpenseClaimSchema = z.object({
  description: z.string().trim().min(2, 'Descreva o gasto compartilhado.').max(120),
  totalAmountCents: moneyCentsSchema,
  participantUserIds: z.array(z.string().trim().min(1)).min(2).max(2),
  // Optional explicit split (por pessoa). Quando ausente, divide igualmente.
  split: z
    .array(z.object({ userId: z.string().trim().min(1), amountCents: z.number().int().min(0) }))
    .min(2)
    .max(2)
    .optional()
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
