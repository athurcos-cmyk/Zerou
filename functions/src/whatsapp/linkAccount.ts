import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import crypto from 'crypto';
import { verifyWorkspaceMembership } from '../ai/verifyWorkspaceMembership.js';
import { getWhatsAppNumber, sendWhatsAppMessage } from './metaClient.js';

const CODE_TTL_MINUTES = 10;
const region = 'southamerica-east1';

function generateCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Chamada pelo client: gera código de 6 dígitos e exibe pro usuário enviar pelo WhatsApp.
 */
export const generateWhatsappLinkCode = onCall(
  { region, maxInstances: 5 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta para continuar.');

    const { workspaceId } = (request.data ?? {}) as { workspaceId?: string };
    if (!workspaceId) throw new HttpsError('invalid-argument', 'workspaceId é obrigatório.');

    await verifyWorkspaceMembership(getFirestore(), workspaceId, uid);

    const code = generateCode();
    const db = getFirestore();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000);

    await db.doc(`users/${uid}/whatsappLinkCodes/${code}`).set({
      code,
      workspaceId,
      createdBy: uid,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(expiresAt),
    });

    const phone = getWhatsAppNumber();
    const waLink = phone
      ? `https://wa.me/${phone.replace(/\D/g, '')}?text=vincular%20${code}`
      : null;

    return { code, expiresInMinutes: CODE_TTL_MINUTES, waLink };
  },
);

/**
 * Processa o código de vínculo quando o usuário manda "vincular 123456" pelo WhatsApp.
 * Chamado pelo webhookHandler.
 */
export async function processLinkCode(
  phoneNumber: string,
  text: string,
): Promise<string> {
  const match = text.match(/vincular\s+(\d{6})/i);
  if (!match) return '';

  const code = match[1];
  const db = getFirestore();

  // Busca o código na subcoleção de qualquer usuário
  const codesSnap = await db.collectionGroup('whatsappLinkCodes')
    .where('code', '==', code)
    .get();

  if (codesSnap.empty) {
    return 'Código não encontrado ou já expirado. Gere um novo no app Granativa.';
  }

  const codeDoc = codesSnap.docs[0];
  const data = codeDoc.data() as {
    workspaceId: string;
    createdBy: string;
    expiresAt: Timestamp;
  };

  if (data.expiresAt.toDate() < new Date()) {
    await codeDoc.ref.delete();
    return 'Esse código expirou. Gere um novo no app Granativa.';
  }

  const uid = codeDoc.ref.parent.parent?.id;
  if (!uid) return 'Erro ao processar vínculo. Tente de novo.';

  // Verifica se o número já está vinculado a algum workspace
  const existingLink = await db.doc(`whatsappPhoneIndex/${phoneNumber}`).get();
  if (existingLink.exists) {
    return 'Este número de WhatsApp já está vinculado a uma conta Granativa.';
  }

  // Grava o vínculo
  const batch = db.batch();
  batch.set(db.doc(`whatsappPhoneIndex/${phoneNumber}`), {
    phoneNumber,
    workspaceId: data.workspaceId,
    linkedByUid: uid,
    linkedAt: Timestamp.now(),
  });
  batch.set(db.doc(`workspaces/${data.workspaceId}/whatsappLinks/${phoneNumber}`), {
    phoneNumber,
    workspaceId: data.workspaceId,
    linkedByUid: uid,
    linkedAt: Timestamp.now(),
  });
  batch.delete(codeDoc.ref);
  await batch.commit();

  // Confirma pro usuário
  await sendWhatsAppMessage(phoneNumber, '✅ WhatsApp vinculado com sucesso à sua conta Granativa! Agora você pode mandar seus gastos por aqui. Ex: "gastei 15 reais no mercado".');

  return ''; // Empty string = already handled (confirmation sent)
}
