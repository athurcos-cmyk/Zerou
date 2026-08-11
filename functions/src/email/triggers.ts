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

// ─── Check-in de 7 dias: mensagem muda conforme a pessoa já lançou algo ─────────
export const send7DayCheckin = onSchedule(
  {
    schedule: '58 13 * * *',
    region: REGION,
    maxInstances: 1,
    secrets: [resendApiKey],
    timeZone: 'America/Sao_Paulo',
  },
  async () => {
    const brtNow = new Date(new Date().toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo' }));
    brtNow.setDate(brtNow.getDate() - 7);
    const brtDateStr = brtNow.toISOString().slice(0, 10);

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

        const activated = user.defaultWorkspaceId
          ? !(
              await db
                .collection('workspaces')
                .doc(user.defaultWorkspaceId)
                .collection('transactions')
                .limit(1)
                .get()
            ).empty
          : false;

        const name = user.name || user.email.split('@')[0];
        const result = await sendOperationalEmail({
          kind: 'activation_checkin',
          to: user.email,
          subject: activated ? 'Uma dica pra ir além na Granativa' : 'Posso te ajudar a começar?',
          data: { name, activated: String(activated) },
        });

        if (result.sent) {
          sent++;
        }
      }

      logger.info(`send7DayCheckin: ${sent} sent, ${skipped} skipped (no email), ${snapshot.size} total`);
    } catch (err) {
      logger.error('send7DayCheckin: query failed', err);
    }
  }
);

// ─── Reengajamento: quem já usou e ficou 14 dias sem lançar nada ────────────────
// Diferente do checkin de dia 7 (que olha só pra quem acabou de cadastrar), este roda
// contra QUALQUER conta com workspace, todo dia, ancorado na data do último lançamento —
// então dispara uma vez só por período de inatividade (a data do último lançamento não
// muda enquanto a pessoa não lança de novo, então "dias desde o último lançamento" só
// bate com REENGAGEMENT_DAYS num único dia).
const REENGAGEMENT_DAYS = 14;

export const sendReengagement = onSchedule(
  {
    schedule: '59 13 * * *',
    region: REGION,
    maxInstances: 1,
    secrets: [resendApiKey],
    timeZone: 'America/Sao_Paulo',
  },
  async () => {
    const brtNow = new Date(new Date().toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo' }));
    brtNow.setDate(brtNow.getDate() - REENGAGEMENT_DAYS);
    const targetBrtDateStr = brtNow.toISOString().slice(0, 10);

    const db = getFirestore();
    let sent = 0;
    let checked = 0;

    try {
      const snapshot = await db.collection('users').get();

      for (const doc of snapshot.docs) {
        const user = doc.data() as UserProfile;
        if (!user.email || !user.defaultWorkspaceId) continue;
        checked++;

        const lastTxSnap = await db
          .collection('workspaces')
          .doc(user.defaultWorkspaceId)
          .collection('transactions')
          .orderBy('date', 'desc')
          .limit(1)
          .get();

        if (lastTxSnap.empty) continue; // nunca lançou nada — é caso do checkin de ativação, não deste

        const lastTxDate = lastTxSnap.docs[0].data().date as FirebaseFirestore.Timestamp;
        const lastTxBrtDateStr = new Date(
          lastTxDate.toDate().toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo' })
        )
          .toISOString()
          .slice(0, 10);

        if (lastTxBrtDateStr !== targetBrtDateStr) continue;

        const result = await sendOperationalEmail({
          kind: 'reengagement',
          to: user.email,
          data: { name: user.name || user.email.split('@')[0] },
        });

        if (result.sent) sent++;
      }

      logger.info(`sendReengagement: ${sent} sent, ${checked} checked, ${snapshot.size} total users`);
    } catch (err) {
      logger.error('sendReengagement: query failed', err);
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
      subject: 'Sua conta na Granativa foi excluída',
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
