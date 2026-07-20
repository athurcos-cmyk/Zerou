import { FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

/** Compartilhado entre Grazi (financialAssistantChat) e as perguntas financeiras via WhatsApp — mesmo orçamento de DeepSeek por workspace, independente do canal. */
export function todayKeyBRT(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function checkAiUsageNotExceeded(
  db: Firestore,
  workspaceId: string,
  dailyLimit = 60,
): Promise<{ usageRef: DocumentReference; currentCount: number }> {
  const key = todayKeyBRT();
  const usageRef = db.doc(`workspaces/${workspaceId}/aiUsage/${key}`);

  // Reserva o slot ATOMICAMENTE: ler + checar + incrementar numa transação. Sem isso,
  // até `maxInstances` chamadas simultâneas passam pelo check antes de qualquer incremento
  // (TOCTOU) e estouram o teto diário. Incrementar aqui (antes da chamada ao DeepSeek)
  // conta a tentativa, não só o sucesso — melhor contra abuso.
  const currentCount = await db.runTransaction(async (tx) => {
    const snap = await tx.get(usageRef);
    const count = snap.exists ? ((snap.data()?.count as number) ?? 0) : 0;
    if (count >= dailyLimit) {
      throw new HttpsError(
        'resource-exhausted',
        'Limite diario de mensagens do assistente atingido. Volte amanha!',
      );
    }
    tx.set(
      usageRef,
      { count: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return count;
  });

  return { usageRef, currentCount };
}

// DEPRECATED / no-op: o incremento agora acontece atomicamente dentro de
// `checkAiUsageNotExceeded` (reserva do slot em transação, elimina o TOCTOU).
// Mantido chamável só pra não precisar mexer nos callers.
export async function incrementAiUsage(_usageRef: DocumentReference): Promise<void> {
  // intencionalmente vazio — ver checkAiUsageNotExceeded
}
