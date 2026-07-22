import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { readMembershipStatus } from '../shared/activeMember.js';

/**
 * Guard de pertencimento para funções `onCall`: rejeita a requisição em vez de devolver um
 * booleano. A leitura em si vive em `shared/activeMember.ts` — fonte única compartilhada com
 * as functions agendadas, que precisam pular o item e continuar em vez de lançar erro.
 */
export async function verifyWorkspaceMembership(
  db: Firestore,
  workspaceId: string,
  uid: string,
): Promise<void> {
  const status = await readMembershipStatus(db, workspaceId, uid);

  if (status === 'not-member') {
    throw new HttpsError('permission-denied', 'Você não faz parte deste espaço.');
  }

  if (status === 'inactive') {
    throw new HttpsError('permission-denied', 'Seu acesso a este espaço está inativo.');
  }
}
