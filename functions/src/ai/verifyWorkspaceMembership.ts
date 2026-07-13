import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

export async function verifyWorkspaceMembership(
  db: Firestore,
  workspaceId: string,
  uid: string,
): Promise<void> {
  const memberDoc = await db
    .doc(`workspaces/${workspaceId}/members/${uid}`)
    .get();

  if (!memberDoc.exists) {
    throw new HttpsError('permission-denied', 'Você não faz parte deste espaço.');
  }

  const data = memberDoc.data();

  if (!data || data.status !== 'active') {
    throw new HttpsError('permission-denied', 'Seu acesso a este espaço está inativo.');
  }
}
