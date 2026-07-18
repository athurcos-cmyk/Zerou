import { Timestamp, type Firestore } from 'firebase-admin/firestore';

const PENDING_TTL_MINUTES = 3;

export interface Candidate {
  id: string;
  label: string;
}

export interface PendingCardPurchase {
  kind: 'card_purchase';
  workspaceId: string;
  userId: string;
  amountCents: number;
  description: string;
  installments: number;
  categoryId: string | null;
  candidates: Candidate[];
}

/** Falta escolher a conta única de débito/crédito de uma despesa/receita. */
export interface PendingDebitCredit {
  kind: 'debit_credit';
  workspaceId: string;
  userId: string;
  type: 'income' | 'expense';
  amountCents: number;
  description: string;
  categoryId: string | null;
  candidates: Candidate[];
}

/**
 * Falta escolher origem e/ou destino de uma transferência. `sourceAccountId`/
 * `destinationAccountId` já vêm preenchidos quando o lado correspondente foi identificado
 * na mensagem — só o(s) lado(s) em `missing` precisa(m) da resposta do usuário.
 */
export interface PendingTransfer {
  kind: 'transfer';
  workspaceId: string;
  userId: string;
  amountCents: number;
  description: string;
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  missing: 'source' | 'destination' | 'both';
  candidates: Candidate[];
}

export type PendingAction = PendingCardPurchase | PendingDebitCredit | PendingTransfer;

function docRef(db: Firestore, phone: string) {
  return db.doc(`whatsappPendingActions/${phone}`);
}

export async function setPendingAction(db: Firestore, phone: string, data: PendingAction): Promise<void> {
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + PENDING_TTL_MINUTES * 60_000));
  await docRef(db, phone).set({
    ...data,
    createdAt: Timestamp.now(),
    expiresAt,
  });
}

export async function getPendingAction(db: Firestore, phone: string): Promise<PendingAction | null> {
  const snap = await docRef(db, phone).get();
  if (!snap.exists) return null;

  const data = snap.data() as PendingAction & { expiresAt: Timestamp };
  if (data.expiresAt.toDate() < new Date()) {
    await docRef(db, phone).delete();
    return null;
  }

  const { createdAt: _createdAt, expiresAt: _expiresAt, ...pending } = data as PendingAction & {
    createdAt: Timestamp;
    expiresAt: Timestamp;
  };
  return pending as PendingAction;
}

export async function clearPendingAction(db: Firestore, phone: string): Promise<void> {
  await docRef(db, phone).delete();
}

/** Remove acentos e normaliza caixa — "itau"/"Itaú"/"ITAÚ" precisam bater entre si. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Resolve a resposta do usuario (numero da lista ou nome/apelido) contra os candidatos apresentados. */
export function resolveSingleSelection(reply: string, candidates: Candidate[]): string | null {
  const trimmed = reply.trim();

  const asIndex = Number(trimmed);
  if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= candidates.length) {
    return candidates[asIndex - 1].id;
  }

  const normalizedReply = normalize(trimmed);
  const matches = candidates.filter((c) => {
    const normalizedLabel = normalize(c.label);
    return normalizedLabel.includes(normalizedReply) || normalizedReply.includes(normalizedLabel);
  });
  if (matches.length === 1) return matches[0].id;

  return null;
}

/**
 * Resolve uma resposta com DOIS números (origem e destino de uma transferência), ex.: "1 2",
 * "1-2", "1,2". Precisa de exatamente dois números distintos e válidos, na ordem
 * origem-depois-destino.
 */
export function resolveDualSelection(
  reply: string,
  candidates: Candidate[],
): { sourceId: string; destinationId: string } | null {
  const numbers = reply.trim().match(/\d+/g);
  if (!numbers || numbers.length !== 2) return null;

  const [firstRaw, secondRaw] = numbers;
  const first = Number(firstRaw);
  const second = Number(secondRaw);
  if (first === second) return null;
  if (!Number.isInteger(first) || first < 1 || first > candidates.length) return null;
  if (!Number.isInteger(second) || second < 1 || second > candidates.length) return null;

  return { sourceId: candidates[first - 1].id, destinationId: candidates[second - 1].id };
}
