import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const DAILY_LIMIT = 100;

function todayKeyBRT(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function checkWhatsappTransactionUsageNotExceeded(
  db: ReturnType<typeof getFirestore>,
  workspaceId: string,
  dailyLimit: number = DAILY_LIMIT
): Promise<void> {
  const key = todayKeyBRT();
  const usageRef = db.doc(`workspaces/${workspaceId}/whatsappTransactionUsage/${key}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(usageRef);
    const count = snap.data()?.count ?? 0;

    if (count >= dailyLimit) {
      return; // caller checks count after transaction
    }

    tx.set(usageRef, {
      count: FieldValue.increment(1),
      updatedAt: Timestamp.now(),
    }, { merge: true });
  });

  // Re-read after transaction to check final count
  const final = await usageRef.get();
  const finalCount = final.data()?.count ?? 0;

  if (finalCount > dailyLimit) {
    throw new Error('WHATSAPP_TRANSACTION_LIMIT_EXCEEDED');
  }
}
