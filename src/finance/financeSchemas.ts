import { z } from 'zod';
import type { AccountType, TransactionType } from '../types/contracts';

export const accountTypes = ['checking', 'savings', 'wallet', 'investment', 'digital_wallet', 'cash', 'shared'] as const;

export const transactionTypes = ['income', 'expense', 'transfer', 'adjustment', 'refund', 'reimbursement'] as const;

export const billStatuses = ['pending', 'paid', 'overdue', 'cancelled'] as const;

export const receivableStatuses = ['pending', 'received', 'overdue', 'cancelled'] as const;

export const recurringFrequencies = ['weekly', 'biweekly', 'monthly', 'yearly'] as const;

const moneyCentsSchema = z
  .number()
  .int('Valores monetários precisam ser inteiros em centavos.')
  .min(0, 'Informe um valor maior ou igual a zero.')
  .max(Number.MAX_SAFE_INTEGER, 'Valor acima do limite seguro.');

export const signedMoneyCentsSchema = z
  .number()
  .int('Valores monetários precisam ser inteiros em centavos.')
  .min(-Number.MAX_SAFE_INTEGER, 'Valor abaixo do limite seguro.')
  .max(Number.MAX_SAFE_INTEGER, 'Valor acima do limite seguro.');

export const createAccountSchema = z.object({
  name: z.string().trim().min(2, 'Informe um nome com pelo menos 2 caracteres.').max(80),
  type: z.enum(accountTypes),
  openingBalanceCents: signedMoneyCentsSchema
});

export const createTransactionSchema = z
  .object({
    type: z.enum(transactionTypes),
    amountCents: moneyCentsSchema,
    description: z.string().trim().min(2, 'Informe uma descrição.').max(120),
    merchant: z.string().trim().max(120).optional(),
    categoryId: z.string().trim().max(120).optional(),
    accountId: z.string().trim().min(1, 'Escolha uma conta.'),
    destinationAccountId: z.string().trim().max(120).optional(),
    date: z.date(),
    tags: z.array(z.string().trim().max(32)).max(8).default([]),
    notes: z.string().trim().max(500).optional()
  })
  .superRefine((value, context) => {
    if (value.type === 'transfer') {
      if (!value.destinationAccountId) {
        context.addIssue({
          code: 'custom',
          path: ['destinationAccountId'],
          message: 'Escolha a conta de destino da transferência.'
        });
      }

      if (value.destinationAccountId === value.accountId) {
        context.addIssue({
          code: 'custom',
          path: ['destinationAccountId'],
          message: 'A conta de destino precisa ser diferente da origem.'
        });
      }
    }
  });

export const createBillSchema = z.object({
  description: z.string().trim().min(2, 'Informe uma descrição.').max(120),
  amountCents: moneyCentsSchema,
  dueDate: z.date(),
  categoryId: z.string().trim().max(120).optional(),
  accountId: z.string().trim().max(120).optional(),
  cardId: z.string().trim().max(120).optional(),
  installments: z.number().int().min(1).max(24).optional()
});

export const createReceivableSchema = z.object({
  description: z.string().trim().min(2, 'Informe uma descrição.').max(120),
  amountCents: moneyCentsSchema,
  fromWho: z.string().trim().max(120).optional(),
  dueDate: z.date(),
  accountId: z.string().trim().max(120).optional()
});

export const createRecurringRuleSchema = z.object({
  description: z.string().trim().min(2, 'Informe uma descrição.').max(120),
  amountCents: moneyCentsSchema.optional(),
  frequency: z.enum(recurringFrequencies),
  nextOccurrenceAt: z.date(),
  accountId: z.string().trim().max(120).optional(),
  cardId: z.string().trim().max(120).optional(),
  categoryId: z.string().trim().max(120).optional()
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type CreateBillInput = z.infer<typeof createBillSchema>;
export type CreateReceivableInput = z.infer<typeof createReceivableSchema>;
export type CreateRecurringRuleInput = z.infer<typeof createRecurringRuleSchema>;
export type SupportedTransactionType = (typeof transactionTypes)[number] & TransactionType;
export type SupportedAccountType = (typeof accountTypes)[number] & AccountType;
