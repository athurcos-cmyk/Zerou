import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const REGION = 'southamerica-east1';

// ─── Limpeza diária de workspaces couple abandonados e mensagens WhatsApp ──────
// Roda todo dia às 04:57 BRT.
export const dailyCleanup = onSchedule(
  {
    schedule: '57 4 * * *',
    region: REGION,
    maxInstances: 1,
    timeZone: 'America/Sao_Paulo',
  },
  async () => {
    const db = getFirestore();
    const now = new Date();

    await cleanupAbandonedCouples(db, now);
    await cleanupGhostCouples(db);
    await cleanupOldWhatsAppMessages(db, now);
  }
);

// ── Couple workspaces abandonados (sem partner, criados há >7 dias) ──────────
export async function cleanupAbandonedCouples(db: Firestore, now: Date): Promise<number> {
  const sevenDaysAgo = Timestamp.fromDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));

  let deleted = 0;
  try {
    const coupleSnap = await db
      .collection('workspaces')
      .where('type', '==', 'couple')
      .where('activeMemberCount', '==', 1)
      .where('createdAt', '<=', sevenDaysAgo)
      .get();

    for (const doc of coupleSnap.docs) {
      const ws = doc.data();
      if (ws.partnerUserId && ws.partnerUserId !== '') continue;

      try {
        await db.recursiveDelete(doc.ref);
        deleted++;
        logger.info(`dailyCleanup: deleted abandoned couple ${doc.id}`);
      } catch (err) {
        logger.error(`dailyCleanup: failed to delete abandoned ${doc.id}`, err);
      }
    }
  } catch (err) {
    logger.error('dailyCleanup: abandoned couples query failed', err);
  }

  if (deleted > 0) {
    logger.info(`dailyCleanup: ${deleted} abandoned couple workspaces deleted`);
  }
  return deleted;
}

// ── Ghosts: workspaces couple cujo ownerUserId não existe mais em users/ ─────
// Cobre o caso de deleção de conta que deixou o workspace órfão. Cada
// verificação de usuário tem try/catch próprio — uma falha de rede em um
// documento não aborta os demais.
export async function cleanupGhostCouples(db: Firestore): Promise<number> {
  let deleted = 0;

  try {
    const allCoupleSnap = await db
      .collection('workspaces')
      .where('type', '==', 'couple')
      .get();

    for (const doc of allCoupleSnap.docs) {
      const ws = doc.data();
      const ownerId = ws.ownerUserId;
      if (!ownerId) continue;

      try {
        const userDoc = await db.doc(`users/${ownerId}`).get();
        if (!userDoc.exists) {
          try {
            await db.recursiveDelete(doc.ref);
            deleted++;
            logger.info(`dailyCleanup: deleted ghost couple ${doc.id} (owner ${ownerId} not found)`);
          } catch (err) {
            logger.error(`dailyCleanup: failed to delete ghost ${doc.id}`, err);
          }
        }
      } catch (err) {
        logger.error(`dailyCleanup: failed to check owner ${ownerId} for ${doc.id} — skipping`, err);
      }
    }
  } catch (err) {
    logger.error('dailyCleanup: ghost couple query failed', err);
  }

  if (deleted > 0) {
    logger.info(`dailyCleanup: ${deleted} ghost couple workspaces deleted`);
  }
  return deleted;
}

// ── whatsappProcessedMessages com mais de 30 dias ────────────────────────────
export async function cleanupOldWhatsAppMessages(db: Firestore, now: Date): Promise<number> {
  const thirtyDaysAgo = Timestamp.fromDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));

  let deleted = 0;
  try {
    const msgSnap = await db
      .collection('whatsappProcessedMessages')
      .where('processedAt', '<=', thirtyDaysAgo)
      .get();

    const batchSize = 400;
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of msgSnap.docs) {
      batch.delete(doc.ref);
      batchCount++;
      deleted++;

      if (batchCount >= batchSize) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    if (deleted > 0) {
      logger.info(`dailyCleanup: ${deleted} old WhatsApp messages deleted`);
    }
  } catch (err) {
    logger.error('dailyCleanup: whatsapp messages cleanup failed', err);
  }
  return deleted;
}
