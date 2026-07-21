import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { resendApiKey } from './resendProvider.js';
import { sendOperationalEmail } from './emailAdapter.js';

const REGION = 'southamerica-east1';

// ─── Welcome email: disparado quando o documento users/{uid} é criado ────────────
// Só envia se o perfil tiver email e defaultWorkspaceId (onboarding concluído).
export const onUserCreated = onDocumentCreated(
  {
    document: 'users/{uid}',
    region: REGION,
    maxInstances: 1,
    secrets: [resendApiKey],
  },
  async (event) => {
    const profile = event.data?.data() as UserProfile | undefined;
    if (!profile?.email || !profile?.defaultWorkspaceId) {
      logger.info('onUserCreated: skipping — onboarding not complete or no email');
      return;
    }

    const result = await sendOperationalEmail({
      kind: 'welcome',
      to: profile.email,
      data: { name: profile.name || profile.email.split('@')[0] },
    });

    if (!result.sent) {
      logger.warn(`onUserCreated: welcome email not sent to ${profile.email}`, result.reason);
    }
  }
);

// ─── Follow-up de 3 dias: roda todo dia às 14h, procura contas criadas há 3 dias ─
export const send3DayFollowUp = onSchedule(
  {
    schedule: '57 13 * * *',
    region: REGION,
    maxInstances: 1,
    secrets: [resendApiKey],
    timeZone: 'America/Sao_Paulo',
  },
  async () => {
    // Calcula "3 dias atrás" no fuso BRT (America/Sao_Paulo), não UTC.
    const brtNow = new Date(new Date().toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo' }));
    brtNow.setDate(brtNow.getDate() - 3);
    const brtDateStr = brtNow.toISOString().slice(0, 10); // YYYY-MM-DD em BRT

    const start = Timestamp.fromDate(new Date(`${brtDateStr}T00:00:00-03:00`));
    const end = Timestamp.fromDate(new Date(`${brtDateStr}T23:59:59-03:00`));

    const db = getFirestore();
    let sent = 0;
    let skipped = 0;

    try {
      const snapshot = await db
        .collection('users')
        .where('createdAt', '>=', start)
        .where('createdAt', '<=', end)
        .get();

      for (const doc of snapshot.docs) {
        const user = doc.data() as UserProfile;
        if (!user.email) {
          skipped++;
          continue;
        }

        const result = await sendOperationalEmail({
          kind: 'follow_up',
          to: user.email,
          data: { name: user.name || user.email.split('@')[0] },
        });

        if (result.sent) {
          sent++;
        }
      }

      logger.info(`send3DayFollowUp: ${sent} sent, ${skipped} skipped (no email), ${snapshot.size} total`);
    } catch (err) {
      logger.error('send3DayFollowUp: query failed', err);
    }
  }
);

// ─── Goodbye email: chamado pelo cliente durante exclusão de conta ──────────────
export const sendGoodbyeEmail = onCall(
  {
    region: REGION,
    maxInstances: 1,
    secrets: [resendApiKey],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Entre na Granativa para continuar.');
    }

    const { email, name } = request.data as { email?: string; name?: string };

    if (!email) {
      throw new HttpsError('invalid-argument', 'Email is required.');
    }

    const result = await sendOperationalEmail({
      kind: 'cancellation',
      to: email,
      data: { name: name || email.split('@')[0] },
    });

    if (!result.sent) {
      logger.warn(`sendGoodbyeEmail: failed to send to ${email}`, result.reason);
    }

    return { sent: result.sent };
  }
);

// ─── Tipos locais (evita import circular com contracts.ts do client) ──────────────
interface UserProfile {
  id: string;
  name: string;
  email: string;
  defaultWorkspaceId?: string;
  createdAt?: FirebaseFirestore.Timestamp;
}
