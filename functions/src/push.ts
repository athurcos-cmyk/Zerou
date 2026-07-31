import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';

export interface SendPushResult {
  tokensFound: number;
  sent: number;
}

// O retorno era `void` — virou `SendPushResult` pra o admin (`adminMessaging.ts`) conseguir
// reportar quantos dispositivos foram alcançados. Aditivo: os callers existentes (automation.ts,
// budgetAlerts.ts) fazem `await sendPushToUser(...)` sem usar o retorno, e já envolvem a chamada
// em `.catch(() => {})` do lado de fora — nada quebra.
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  link = 'https://granativa.com.br/app'
): Promise<SendPushResult> {
  const db = getFirestore();
  const tokensSnap = await db.collection(`users/${userId}/fcmTokens`).get();
  if (tokensSnap.empty) return { tokensFound: 0, sent: 0 };

  const tokens = tokensSnap.docs
    .map((d) => d.data().token as string)
    .filter(Boolean);
  if (tokens.length === 0) return { tokensFound: 0, sent: 0 };

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    webpush: {
      notification: {
        title,
        body,
        icon: '/brand/granativa-app-icon-192.png',
        badge: '/brand/granativa-app-icon-192.png',
      },
      fcmOptions: { link },
    },
  });

  // Remove tokens que o dispositivo revogou (app desinstalado, etc.)
  const staleRefs = response.responses
    .map((r, i) => ({ ok: r.success, doc: tokensSnap.docs[i] }))
    .filter(({ ok }) => !ok)
    .map(({ doc }) => doc.ref);

  if (staleRefs.length > 0) {
    await Promise.all(staleRefs.map((ref) => ref.delete()));
    logger.info('push_stale_tokens_removed', { userId, count: staleRefs.length });
  }

  return { tokensFound: tokens.length, sent: response.successCount };
}
