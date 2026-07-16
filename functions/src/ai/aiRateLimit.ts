import { FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

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

  const usageDoc = await usageRef.get();
  const currentCount = usageDoc.exists ? ((usageDoc.data()?.count as number) ?? 0) : 0;

  if (currentCount >= dailyLimit) {
    throw new HttpsError(
      'resource-exhausted',
      'Limite diario de mensagens do assistente atingido. Volte amanha!',
    );
  }

  return { usageRef, currentCount };
}

// set + merge:true + increment(1) é atômico e funciona tanto para criar
// quanto para atualizar — sem race condition entre if/else com exists obsoleto.
export async function incrementAiUsage(usageRef: DocumentReference): Promise<void> {
  try {
    await usageRef.set(
      { count: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    // Non-critical: the message was already served. Log and continue.
    logger.warn('ai_rate_limit_increment_failed', { path: usageRef.path, error: String(err) });
  }
}
