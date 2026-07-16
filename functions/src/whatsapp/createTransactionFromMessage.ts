import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { transactionAccountEffects } from '../shared/accountEffects.js';

/**
 * Cria transação via Admin SDK com o MESMO payload que `financeService.createTransaction`
 * gera no client. Admin SDK ignora firestore.rules — a responsabilidade de gerar o
 * payload correto é 100% desta função.
 *
 * Mantenha em sincronia com `src/finance/financeService.ts:createTransaction()`.
 */

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
}

function monthKeyFromDate(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export interface CreateFromMessageInput {
  workspaceId: string;
  userId: string;
  type: 'income' | 'expense';
  amountCents: number;
  description: string;
  categoryId?: string | null;
  accountId: string;
  date: Date;
  source: 'whatsapp';
}

export async function createTransactionFromMessage(
  input: CreateFromMessageInput,
): Promise<{ id: string; amountCents: number; description: string; categoryName?: string }> {
  const db = getFirestore();
  const id = createId('txn');
  const now = FieldValue.serverTimestamp();
  const date = Timestamp.fromDate(input.date);
  const monthKey = monthKeyFromDate(input.date);

  const payload: Record<string, unknown> = {
    id,
    workspaceId: input.workspaceId,
    createdBy: input.userId,
    updatedBy: input.userId,
    type: input.type,
    amountCents: input.amountCents,
    description: input.description,
    accountId: input.accountId,
    date,
    competenceMonth: monthKey,
    cashMonth: monthKey,
    tags: ['whatsapp'],
    isRecurring: false,
    clientMutationId: id,
    syncStatus: 'synced',
    version: 1,
    source: input.source,
    createdAt: now,
    updatedAt: now,
  };

  if (input.categoryId) {
    payload.categoryId = input.categoryId;
  }

  const batch = db.batch();
  batch.set(db.doc(`workspaces/${input.workspaceId}/transactions/${id}`), payload);
  for (const effect of transactionAccountEffects(input)) {
    batch.update(db.doc(`workspaces/${input.workspaceId}/accounts/${effect.accountId}`), {
      currentBalanceCents: FieldValue.increment(effect.deltaCents),
      updatedAt: now,
    });
  }
  await batch.commit();

  // Resolve category name for the confirmation message
  let categoryName: string | undefined;
  if (input.categoryId) {
    const catDoc = await db
      .doc(`workspaces/${input.workspaceId}/categories/${input.categoryId}`)
      .get();
    categoryName = catDoc.data()?.name;
  }

  return { id, amountCents: input.amountCents, description: input.description, categoryName };
}
