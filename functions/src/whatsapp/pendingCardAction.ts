import { Timestamp, type Firestore } from 'firebase-admin/firestore';

const PENDING_TTL_MINUTES = 3;

export interface PendingCardPurchase {
  workspaceId: string;
  userId: string;
  amountCents: number;
  description: string;
  installments: number;
  categoryId: string | null;
  candidates: Array<{ id: string; label: string }>;
}

function docRef(db: Firestore, phone: string) {
  return db.doc(`whatsappPendingActions/${phone}`);
}

export async function setPendingCardPurchase(
  db: Firestore,
  phone: string,
  data: PendingCardPurchase,
): Promise<void> {
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + PENDING_TTL_MINUTES * 60_000));
  await docRef(db, phone).set({
    kind: 'card_purchase',
    ...data,
    createdAt: Timestamp.now(),
    expiresAt,
  });
}

export async function getPendingCardPurchase(
  db: Firestore,
  phone: string,
): Promise<PendingCardPurchase | null> {
  const snap = await docRef(db, phone).get();
  if (!snap.exists) return null;

  const data = snap.data() as PendingCardPurchase & { expiresAt: Timestamp };
  if (data.expiresAt.toDate() < new Date()) {
    await docRef(db, phone).delete();
    return null;
  }

  return {
    workspaceId: data.workspaceId,
    userId: data.userId,
    amountCents: data.amountCents,
    description: data.description,
    installments: data.installments,
    categoryId: data.categoryId,
    candidates: data.candidates,
  };
}

export async function clearPendingCardPurchase(db: Firestore, phone: string): Promise<void> {
  await docRef(db, phone).delete();
}

/** Resolve a resposta do usuario (numero da lista ou nome do cartao) contra os candidatos apresentados. */
export function resolveCardSelection(
  reply: string,
  candidates: Array<{ id: string; label: string }>,
): string | null {
  const trimmed = reply.trim();

  const asIndex = Number(trimmed);
  if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= candidates.length) {
    return candidates[asIndex - 1].id;
  }

  const lower = trimmed.toLowerCase();
  const matches = candidates.filter((c) => c.label.toLowerCase().includes(lower) || lower.includes(c.label.toLowerCase()));
  if (matches.length === 1) return matches[0].id;

  return null;
}
