import { FieldValue, getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { sendPushToUser } from '../push.js';
import { sendOperationalEmail } from '../email/emailAdapter.js';
import { resendApiKey } from '../email/resendProvider.js';

const REGION = 'southamerica-east1';

// Mesmo valor de functions-admin/src/index.ts — não dá pra importar de lá, é
// um codebase de deploy separado (ver firebase.json).
const ADMIN_EMAIL = 'a.thurcos@gmail.com';

function assertAdmin(email: string | undefined): void {
  if (email !== ADMIN_EMAIL) {
    throw new HttpsError('permission-denied', 'Acesso negado.');
  }
}

type Channel = 'push' | 'email' | 'both';

function assertChannel(channel: unknown): asserts channel is Channel {
  if (channel !== 'push' && channel !== 'email' && channel !== 'both') {
    throw new HttpsError('invalid-argument', 'channel deve ser push, email ou both.');
  }
}

interface HistoryEntry {
  type: 'individual' | 'broadcast';
  channel: Channel;
  subject: string | null;
  message: string;
  targetUserId: string | null;
  targetName: string | null;
  pushFound: number;
  pushSent: number;
  emailAttempted: number;
  emailSent: number;
  sentBy: string | null;
}

// adminMessages é só-leitura pro admin no client (firestore.rules, allow write: if false) —
// gravado só por aqui. Falha ao gravar histórico não deve derrubar um envio que já aconteceu.
async function recordHistory(entry: HistoryEntry): Promise<void> {
  try {
    await getFirestore()
      .collection('adminMessages')
      .add({ ...entry, createdAt: FieldValue.serverTimestamp() });
  } catch (err) {
    logger.error('adminMessaging: falha ao gravar histórico', err);
  }
}

// ─── Individual ────────────────────────────────────────────────────────────────
export const adminSendMessage = onCall(
  { region: REGION, maxInstances: 5, secrets: [resendApiKey] },
  async (request) => {
    assertAdmin(request.auth?.token.email);

    const { userId, channel, subject, message } = request.data as {
      userId?: string;
      channel?: unknown;
      subject?: string;
      message?: string;
    };

    if (!userId || typeof userId !== 'string') {
      throw new HttpsError('invalid-argument', 'userId obrigatório.');
    }
    assertChannel(channel);
    if (!message || !message.trim()) {
      throw new HttpsError('invalid-argument', 'message obrigatório.');
    }
    const needsEmail = channel === 'email' || channel === 'both';
    const trimmedSubject = subject?.trim();
    if (needsEmail && !trimmedSubject) {
      throw new HttpsError('invalid-argument', 'subject obrigatório quando o canal inclui email.');
    }

    const db = getFirestore();
    const userSnap = await db.doc(`users/${userId}`).get();
    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'Usuário não encontrado.');
    }
    const user = userSnap.data() as { name?: string; email?: string };
    const trimmedMessage = message.trim();

    let pushResult = { tokensFound: 0, sent: 0 };
    let emailSent = false;
    let emailReason: string | undefined;

    if (channel === 'push' || channel === 'both') {
      pushResult = await sendPushToUser(userId, trimmedSubject || 'Granativa', trimmedMessage);
    }

    if (needsEmail) {
      if (!user.email) {
        emailReason = 'Usuário sem email cadastrado.';
      } else {
        const result = await sendOperationalEmail({
          kind: 'admin_message',
          to: user.email,
          subject: trimmedSubject!,
          data: { name: user.name || user.email.split('@')[0], body: trimmedMessage },
        });
        emailSent = result.sent;
        emailReason = result.reason;
      }
    }

    await recordHistory({
      type: 'individual',
      channel,
      subject: trimmedSubject ?? null,
      message: trimmedMessage,
      targetUserId: userId,
      targetName: user.name || user.email || userId,
      pushFound: pushResult.tokensFound,
      pushSent: pushResult.sent,
      emailAttempted: needsEmail ? 1 : 0,
      emailSent: emailSent ? 1 : 0,
      sentBy: request.auth?.uid ?? null,
    });

    logger.info('admin_sent_message', { userId, channel, actorUserId: request.auth?.uid });

    return {
      success: true,
      push: { tokensFound: pushResult.tokensFound, sent: pushResult.sent },
      email: needsEmail ? { sent: emailSent, reason: emailReason } : null,
    };
  }
);

// ─── Broadcast ───────────────────────────────────────────────────────────────
export const adminBroadcastMessage = onCall(
  { region: REGION, maxInstances: 3, secrets: [resendApiKey] },
  async (request) => {
    assertAdmin(request.auth?.token.email);

    const { channel, subject, message } = request.data as {
      channel?: unknown;
      subject?: string;
      message?: string;
    };

    assertChannel(channel);
    if (!message || !message.trim()) {
      throw new HttpsError('invalid-argument', 'message obrigatório.');
    }
    const needsEmail = channel === 'email' || channel === 'both';
    const trimmedSubject = subject?.trim();
    if (needsEmail && !trimmedSubject) {
      throw new HttpsError('invalid-argument', 'subject obrigatório quando o canal inclui email.');
    }

    const trimmedMessage = message.trim();
    const db = getFirestore();

    let pushFound = 0;
    let pushSent = 0;
    let emailAttempted = 0;
    let emailSent = 0;

    if (channel === 'push' || channel === 'both') {
      // Mesmo agrupamento por usuário de sendDailyLogReminder (automation.ts) — cada usuário
      // raramente passa de poucos tokens, então o lote por chamada nunca chega perto do
      // limite de 500 tokens do sendEachForMulticast.
      const tokensSnap = await db.collectionGroup('fcmTokens').get();
      const byUser = new Map<string, { token: string; ref: DocumentReference }[]>();

      for (const doc of tokensSnap.docs) {
        const userId = doc.ref.path.split('/')[1];
        const token = doc.data().token as string | undefined;
        if (!userId || !token) continue;
        if (!byUser.has(userId)) byUser.set(userId, []);
        byUser.get(userId)!.push({ token, ref: doc.ref });
      }

      const messaging = getMessaging();
      for (const [userId, entries] of byUser) {
        try {
          const tokens = entries.map((e) => e.token);
          pushFound += tokens.length;

          const response = await messaging.sendEachForMulticast({
            tokens,
            webpush: {
              notification: {
                title: trimmedSubject || 'Granativa',
                body: trimmedMessage,
                icon: '/brand/granativa-app-icon-192.png',
                badge: '/brand/granativa-app-icon-192.png',
              },
              fcmOptions: { link: 'https://granativa.com.br/app' },
            },
          });
          pushSent += response.successCount;

          const staleRefs = response.responses
            .map((r, i) => ({ ok: r.success, entry: entries[i] }))
            .filter(({ ok }) => !ok)
            .map(({ entry }) => entry.ref);
          if (staleRefs.length > 0) {
            await Promise.all(staleRefs.map((ref) => ref.delete()));
          }
        } catch (err) {
          logger.error('adminBroadcastMessage: erro no push de um usuário — pulando', { userId, err });
        }
      }
    }

    if (needsEmail) {
      // Sequencial com pequeno intervalo — a base de usuários é pequena hoje (~dezena de
      // contas). Se crescer muito, trocar por Resend Batch API (100/req) como fez o Plantão
      // (C:\Users\Thurcos\Desktop\plantao\api\broadcast.js) em vez de laço sequencial.
      const usersSnap = await db.collection('users').get();
      for (const userDoc of usersSnap.docs) {
        const user = userDoc.data() as { name?: string; email?: string };
        if (!user.email) continue;
        emailAttempted++;
        try {
          const result = await sendOperationalEmail({
            kind: 'admin_message',
            to: user.email,
            subject: trimmedSubject!,
            data: { name: user.name || user.email.split('@')[0], body: trimmedMessage },
          });
          if (result.sent) emailSent++;
        } catch (err) {
          logger.error('adminBroadcastMessage: erro no email de um usuário — pulando', { userId: userDoc.id, err });
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    await recordHistory({
      type: 'broadcast',
      channel,
      subject: trimmedSubject ?? null,
      message: trimmedMessage,
      targetUserId: null,
      targetName: null,
      pushFound,
      pushSent,
      emailAttempted,
      emailSent,
      sentBy: request.auth?.uid ?? null,
    });

    logger.info('admin_broadcast_message', {
      channel,
      pushFound,
      pushSent,
      emailAttempted,
      emailSent,
      actorUserId: request.auth?.uid,
    });

    return { success: true, pushFound, pushSent, emailAttempted, emailSent };
  }
);
