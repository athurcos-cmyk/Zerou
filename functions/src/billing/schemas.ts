import { z } from 'zod';

export const createCheckoutSessionSchema = z.object({
  planId: z.enum(['duo', 'premium']),
  billingInterval: z.enum(['monthly', 'annual']),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  clientRequestId: z.string().min(8).max(80),
  priceCents: z.number().optional()
});

export const createCustomerPortalSessionSchema = z.object({
  returnUrl: z.string().url().optional()
});

export type CreateCheckoutSessionRequest = z.infer<typeof createCheckoutSessionSchema>;
export type CreateCustomerPortalSessionRequest = z.infer<typeof createCustomerPortalSessionSchema>;
