import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { categoryColors, categoryIconKeys, defaultCategoryColor } from './categoryPalette.js';

/**
 * Cria categoria via Admin SDK com o MESMO payload que `financeService.createCategory`
 * gera no client. Admin SDK ignora firestore.rules — a responsabilidade de gerar o
 * payload correto é 100% desta função.
 *
 * Mantenha em sincronia com `src/finance/financeService.ts:createCategory()`.
 */

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
}

export interface CreateCategoryFromMessageInput {
  workspaceId: string;
  userId: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  icon?: string | null;
}

export async function createCategoryFromMessage(
  input: CreateCategoryFromMessageInput,
): Promise<{ id: string; name: string; created: boolean }> {
  const db = getFirestore();
  const name = input.name.trim().slice(0, 80);

  const activeSnap = await db
    .collection(`workspaces/${input.workspaceId}/categories`)
    .where('isActive', '==', true)
    .get();

  const existing = activeSnap.docs.find(
    (d) => (d.data().name as string)?.trim().toLowerCase() === name.toLowerCase(),
  );

  if (existing) {
    return { id: existing.id, name: existing.data().name as string, created: false };
  }

  const icon = input.icon && categoryIconKeys.includes(input.icon) ? input.icon : 'sliders';
  const color = categoryColors[activeSnap.size % categoryColors.length] ?? defaultCategoryColor;

  const id = createId('cat');
  const now = FieldValue.serverTimestamp();

  await db.doc(`workspaces/${input.workspaceId}/categories/${id}`).set({
    id,
    workspaceId: input.workspaceId,
    name,
    type: input.type,
    icon,
    color,
    isDefault: false,
    isActive: true,
    createdBy: input.userId,
    createdAt: now,
    updatedAt: now,
  });

  return { id, name, created: true };
}
