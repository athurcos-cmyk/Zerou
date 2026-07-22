import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export type MembershipStatus = 'active' | 'not-member' | 'inactive';

/**
 * Fonte ÚNICA da checagem de pertencimento a um workspace nas Cloud Functions.
 *
 * Espelha a regra `isActiveMember` do `firestore.rules`: existir `workspaces/{ws}/members/{uid}`
 * com `status == 'active'`. Precisa existir em código porque o Admin SDK **ignora** as regras.
 *
 * Devolve o status em vez de um booleano pra quem chama poder distinguir "nunca foi membro"
 * de "saiu/foi removido" — o callable da Vic mostra mensagens diferentes pra cada caso.
 */
export async function readMembershipStatus(
  db: Firestore,
  workspaceId: string,
  uid: string
): Promise<MembershipStatus> {
  const memberDoc = await db.doc(`workspaces/${workspaceId}/members/${uid}`).get();
  if (!memberDoc.exists) return 'not-member';
  return memberDoc.data()?.status === 'active' ? 'active' : 'inactive';
}

/**
 * Versão com cache pras functions AGENDADAS, que varrem muitos documentos em loop.
 *
 * Sem esta checagem, quem sai de um espaço de casal continuava recebendo push com
 * **descrição e valor** de contas de um espaço que já não pode nem abrir: `leavePartnerWorkspace`
 * marca o membro como `removed` (não apaga o documento), então o `createdBy`/`ownerUserId`
 * gravado nos dados segue apontando pra ele — e o push ia junto. É vazamento de dado
 * financeiro pro ex-parceiro, o que o `CLAUDE.md` proíbe.
 *
 * Vale pros DOIS tipos de workspace: o pessoal também tem `members/{uid}` com
 * `status: 'active'` (criado junto da fundação), então isto **não** desliga a notificação de
 * quem usa o app sozinho.
 *
 * O cache vive só durante a execução da function, evitando reler o mesmo membro a cada item.
 */
export function createActiveMemberCheck() {
  const cache = new Map<string, boolean>();

  return async function isActiveMember(
    workspaceId: string | undefined,
    userId: string | undefined
  ): Promise<boolean> {
    if (!workspaceId || !userId) return false;

    const key = `${workspaceId}/${userId}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const active = (await readMembershipStatus(getFirestore(), workspaceId, userId)) === 'active';
    cache.set(key, active);
    return active;
  };
}
