import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

const REGION = 'southamerica-east1';

export const cancelCoupleWorkspace = onCall(
  { region: REGION, maxInstances: 5 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Entre na Granativa para continuar.');
    }

    const data = request.data as Record<string, unknown> | undefined;
    const workspaceId = typeof data?.workspaceId === 'string' ? data.workspaceId.trim() : '';
    const confirmed = data?.confirmed === true;

    if (!workspaceId) {
      throw new HttpsError('invalid-argument', 'workspaceId obrigatório.');
    }

    if (!confirmed) {
      throw new HttpsError('failed-precondition', 'Confirme que deseja cancelar o espaço compartilhado.');
    }

    const db = getFirestore();
    const wsRef = db.doc(`workspaces/${workspaceId}`);
    const wsSnap = await wsRef.get();

    if (!wsSnap.exists) {
      throw new HttpsError('not-found', 'Workspace não encontrado.');
    }

    const wsData = wsSnap.data()!;

    if (wsData.ownerUserId !== uid) {
      throw new HttpsError('permission-denied', 'Só o proprietário pode cancelar o espaço.');
    }

    if ((wsData.activeMemberCount ?? 1) > 1) {
      throw new HttpsError('failed-precondition',
        'Não é possível cancelar um espaço com parceiro ativo. Remova o parceiro primeiro.');
    }

    // Deleta workspace + todas as subcoleções recursivamente (Admin SDK)
    await db.recursiveDelete(wsRef);

    // Deleta o workspaceRef do owner (fora da árvore do workspace)
    await db.doc(`users/${uid}/workspaceRefs/${workspaceId}`).delete();

    // Limpa invites órfãos para este workspace
    const invitesSnap = await db
      .collection('coupleInvites')
      .where('workspaceId', '==', workspaceId)
      .get();

    if (!invitesSnap.empty) {
      const batch = db.batch();
      invitesSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    logger.info('couple_workspace_cancelled', { workspaceId, deletedBy: uid });

    return { success: true };
  }
);
