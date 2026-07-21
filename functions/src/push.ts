import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  link = 'https://granativa.com.br/app'
): Promise<void> {
  const db = getFirestore();
  const tokensSnap = await db.collection(`users/${userId}/fcmTokens`).get();
  if (tokensSnap.empty) return;

  const tokens = tokensSnap.docs
    .map((d) => d.data().token as string)
    .filter(Boolean);
  if (tokens.length === 0) return;

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
}
