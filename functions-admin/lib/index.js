import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
initializeApp();
const ADMIN_EMAIL = 'a.thurcos@gmail.com';
const REGION = 'southamerica-east1';
const BATCH_LIMIT = 450;
const WORKSPACE_COLLECTIONS = [
    'accounts',
    'categories',
    'transactions',
    'bills',
    'receivables',
    'recurring',
    'budgets',
    'goals',
    'goalContributions',
    'members',
    'sharedExpenseClaims',
    'settlements',
    'comments',
    'auditLogs',
    'aiUsage',
    'budgetAlertState',
    'whatsappTransactionUsage',
];
function assertAdmin(email) {
    if (email !== ADMIN_EMAIL) {
        throw new HttpsError('permission-denied', 'Acesso negado.');
    }
}
async function commitDeletes(refs) {
    const db = getFirestore();
    let processed = 0;
    for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
        const slice = refs.slice(i, i + BATCH_LIMIT);
        try {
            const batch = db.batch();
            slice.forEach((ref) => batch.delete(ref));
            await batch.commit();
            processed += slice.length;
        }
        catch (err) {
            logger.error('Falha ao comitar lote de delecao', { batchIndex: Math.floor(i / BATCH_LIMIT) + 1, err });
        }
    }
    return processed;
}
async function collectSubcollection(path) {
    const snap = await getFirestore().collection(path).get();
    return snap.docs.map((d) => d.ref);
}
async function collectCardTree(workspaceId) {
    const db = getFirestore();
    const refs = [];
    const cardsSnap = await db.collection(`workspaces/${workspaceId}/cards`).get();
    for (const card of cardsSnap.docs) {
        const invoicesSnap = await card.ref.collection('invoices').get();
        for (const invoice of invoicesSnap.docs) {
            const ledgerSnap = await invoice.ref.collection('ledger').get();
            refs.push(...ledgerSnap.docs.map((d) => d.ref));
            refs.push(invoice.ref);
        }
        refs.push(card.ref);
    }
    return refs;
}
// Fecha o mesmo gap achado na auto-exclusão (accountDeletionService.ts, 2026-07-17): o
// número de WhatsApp ficava vinculado depois da conta excluída, porque nem a exclusão do
// próprio usuário nem a do admin nunca tocavam nessas coleções.
async function collectWhatsappRefs(workspaceId) {
    const db = getFirestore();
    const refs = [];
    const linksSnap = await db.collection(`workspaces/${workspaceId}/whatsappLinks`).get();
    for (const linkDoc of linksSnap.docs) {
        refs.push(linkDoc.ref);
        refs.push(db.doc(`whatsappPhoneIndex/${linkDoc.id}`));
    }
    return refs;
}
async function collectWorkspaceTree(workspaceId) {
    const db = getFirestore();
    const refs = [];
    refs.push(...(await collectCardTree(workspaceId)));
    refs.push(...(await collectWhatsappRefs(workspaceId)));
    for (const col of WORKSPACE_COLLECTIONS) {
        refs.push(...(await collectSubcollection(`workspaces/${workspaceId}/${col}`)));
    }
    refs.push(db.doc(`workspaces/${workspaceId}`));
    return refs;
}
export const adminDeleteUser = onCall({ region: REGION, maxInstances: 5 }, async (request) => {
    assertAdmin(request.auth?.token.email);
    const userId = request.data?.userId;
    if (!userId || typeof userId !== 'string') {
        throw new HttpsError('invalid-argument', 'userId obrigatório.');
    }
    const auth = getAuth();
    try {
        await auth.getUser(userId);
    }
    catch {
        throw new HttpsError('not-found', 'Usuário não encontrado no Firebase Auth.');
    }
    const db = getFirestore();
    const refs = [];
    const personalWorkspaceId = `personal_${userId}`;
    try {
        refs.push(...(await collectWorkspaceTree(personalWorkspaceId)));
    }
    catch (err) {
        logger.error('Falha ao coletar workspace pessoal', { userId, err });
    }
    for (const subPath of [`users/${userId}/fcmTokens`, `users/${userId}/whatsappLinkCodes`]) {
        try {
            refs.push(...(await collectSubcollection(subPath)));
        }
        catch (err) {
            logger.error('Falha ao coletar subcolecao', { userId, subPath, err });
        }
    }
    try {
        const workspaceRefsSnap = await db.collection(`users/${userId}/workspaceRefs`).get();
        for (const wsRefDoc of workspaceRefsSnap.docs) {
            let wsId = '';
            try {
                wsId = wsRefDoc.id;
                if (wsId === personalWorkspaceId)
                    continue;
                const wsSnap = await db.doc(`workspaces/${wsId}`).get();
                if (!wsSnap.exists)
                    continue;
                const ws = wsSnap.data();
                if (ws.ownerUserId === userId) {
                    const invitesSnap = await db.collection('coupleInvites').where('workspaceId', '==', wsId).get();
                    refs.push(...invitesSnap.docs.map((d) => d.ref));
                    refs.push(...(await collectWorkspaceTree(wsId)));
                }
                else {
                    refs.push(db.doc(`workspaces/${wsId}/members/${userId}`));
                    await db.doc(`workspaces/${wsId}`).update({
                        partnerUserId: '',
                        activeMemberCount: 1,
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                }
            }
            catch (err) {
                logger.error('Falha ao processar workspaceRef', { userId, wsId, err });
            }
        }
        refs.push(...workspaceRefsSnap.docs.map((d) => d.ref));
    }
    catch (err) {
        logger.error('Falha ao consultar workspaceRefs', { userId, err });
    }
    const billingId = `billing_${userId}`;
    try {
        const billingSnap = await db.doc(`billingAccounts/${billingId}`).get();
        if (billingSnap.exists) {
            refs.push(...(await collectSubcollection(`billingAccounts/${billingId}/subscriptions`)));
            refs.push(db.doc(`billingAccounts/${billingId}`));
        }
    }
    catch (err) {
        logger.error('Falha ao coletar billing', { userId, billingId, err });
    }
    try {
        const privacySnap = await db.collection('privacyRequests').where('userId', '==', userId).get();
        refs.push(...privacySnap.docs.map((d) => d.ref));
    }
    catch (err) {
        logger.error('Falha ao coletar privacyRequests', { userId, err });
    }
    refs.push(db.doc(`users/${userId}`));
    // Deleta do Auth primeiro. Se falhar, nada foi tocado no Firestore.
    try {
        await auth.deleteUser(userId);
    }
    catch (err) {
        logger.error('Falha ao deletar usuario do Firebase Auth', { userId, err });
        throw new HttpsError('internal', 'Falha ao deletar usuario. Nenhum dado foi removido.');
    }
    const deletedCount = await commitDeletes(refs);
    logger.info('admin_deleted_user', {
        deletedUserId: userId,
        deletedBy: request.auth?.uid,
        totalRefsCollected: refs.length,
        docsDeleted: deletedCount,
    });
    return { success: true, docsDeleted: deletedCount, totalRefsCollected: refs.length };
});
export const adminForceLogout = onCall({ region: REGION, maxInstances: 5 }, async (request) => {
    assertAdmin(request.auth?.token.email);
    const userId = request.data?.userId;
    if (!userId || typeof userId !== 'string') {
        throw new HttpsError('invalid-argument', 'userId obrigatório.');
    }
    const auth = getAuth();
    try {
        await auth.getUser(userId);
    }
    catch {
        throw new HttpsError('not-found', 'Usuário não encontrado no Firebase Auth.');
    }
    await auth.revokeRefreshTokens(userId);
    logger.info('admin_forced_logout', {
        targetUserId: userId,
        actorUserId: request.auth?.uid,
    });
    return { success: true };
});
// Desvincula qualquer número de WhatsApp, inclusive "órfão" — apontando pra um
// workspace/usuário já excluído (achado real: exclusão de conta antes da correção de
// 2026-07-17 deixava o número preso pra sempre, sem forma de religar pelo app, já que
// o client não pode escrever em whatsappPhoneIndex/whatsappLinks — allow write: if false).
export const adminUnlinkWhatsappNumber = onCall({ region: REGION, maxInstances: 5 }, async (request) => {
    assertAdmin(request.auth?.token.email);
    const phone = request.data?.phone;
    if (!phone || typeof phone !== 'string') {
        throw new HttpsError('invalid-argument', 'phone obrigatório.');
    }
    const db = getFirestore();
    const indexRef = db.doc(`whatsappPhoneIndex/${phone}`);
    const indexSnap = await indexRef.get();
    if (!indexSnap.exists) {
        throw new HttpsError('not-found', 'Esse número não está vinculado a nenhuma conta.');
    }
    const { workspaceId } = indexSnap.data();
    const batch = db.batch();
    batch.delete(indexRef);
    if (workspaceId) {
        batch.delete(db.doc(`workspaces/${workspaceId}/whatsappLinks/${phone}`));
    }
    await batch.commit();
    logger.info('admin_unlinked_whatsapp', {
        phone,
        workspaceId: workspaceId ?? null,
        actorUserId: request.auth?.uid,
    });
    return { success: true };
});
//# sourceMappingURL=index.js.map