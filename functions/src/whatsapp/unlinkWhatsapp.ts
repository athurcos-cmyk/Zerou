import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { verifyWorkspaceMembership } from '../ai/verifyWorkspaceMembership.js';
import { sendWhatsAppMessage } from './metaClient.js';

const region = 'southamerica-east1';

/**
 * Chamada pelo client: desvincula o WhatsApp do workspace (Configurações > WhatsApp > Desvincular).
 * Fecha o vinculo prometido em src/pages/LegalPages.tsx (Termos §7.4, Data Deletion).
 */
export const unlinkWhatsapp = onCall(
  { region, maxInstances: 5 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta para continuar.');

    const { workspaceId } = (request.data ?? {}) as { workspaceId?: string };
    if (!workspaceId) throw new HttpsError('invalid-argument', 'workspaceId é obrigatório.');

    const db = getFirestore();
    await verifyWorkspaceMembership(db, workspaceId, uid);

    const linksSnap = await db.collection(`workspaces/${workspaceId}/whatsappLinks`).limit(1).get();
    if (linksSnap.empty) {
      throw new HttpsError('failed-precondition', 'Este espaço não está vinculado a nenhum WhatsApp.');
    }

    const linkDoc = linksSnap.docs[0];
    const phone = linkDoc.id;

    const batch = db.batch();
    batch.delete(db.doc(`whatsappPhoneIndex/${phone}`));
    batch.delete(linkDoc.ref);
    await batch.commit();

    // Varredura defensiva de codigos residuais (nao usados/expirados) do mesmo usuario.
    const leftoverCodes = await db.collection(`users/${uid}/whatsappLinkCodes`).get();
    if (!leftoverCodes.empty) {
      const cleanupBatch = db.batch();
      leftoverCodes.docs.forEach((d) => cleanupBatch.delete(d.ref));
      await cleanupBatch.commit();
    }

    try {
      await sendWhatsAppMessage(phone, 'Seu WhatsApp foi desvinculado do Granativa.');
    } catch (err) {
      logger.warn('whatsapp_unlink_confirmation_failed', { phone, error: String(err) });
    }

    return { unlinkedPhone: phone };
  },
);
