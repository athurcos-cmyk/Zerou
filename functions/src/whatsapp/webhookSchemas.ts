import { z } from 'zod';

const textMessageSchema = z.object({
  id: z.string().optional(),
  from: z.string().trim().min(1),
  text: z.object({
    body: z.string(),
  }),
});

const valueSchema = z.object({
  messages: z.array(textMessageSchema).min(1).optional(),
});

const changeSchema = z.object({
  value: valueSchema.optional(),
});

const entrySchema = z.object({
  changes: z.array(changeSchema).min(1).optional(),
});

export const webhookPayloadSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(entrySchema).min(1).optional(),
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
