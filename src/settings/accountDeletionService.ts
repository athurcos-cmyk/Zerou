import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentReference
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseDb, getFirebaseFunctions } from '../firebase/config';
import { getPersonalWorkspaceId } from '../workspaces/workspaceService';
import type { Workspace, WorkspaceRef } from '../types/contracts';

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
  'whatsappTransactionUsage'
];

async function commitDeletes(refs: DocumentReference[]) {
  const db = getFirebaseDb();

  for (let index = 0; index < refs.length; index += BATCH_LIMIT) {
    const batch = writeBatch(db);
    refs.slice(index, index + BATCH_LIMIT).forEach((reference) => batch.delete(reference));
    await batch.commit();
  }
}

async function collectCollectionDocs(path: string) {
  const snapshot = await getDocs(collection(getFirebaseDb(), path));
  return snapshot.docs.map((item) => item.ref);
}

async function collectCardTree(workspaceId: string) {
  const refs: DocumentReference[] = [];
  const cardsSnapshot = await getDocs(collection(getFirebaseDb(), 'workspaces', workspaceId, 'cards'));

  for (const card of cardsSnapshot.docs) {
    const invoicesSnapshot = await getDocs(collection(card.ref, 'invoices'));

    for (const invoice of invoicesSnapshot.docs) {
      refs.push(...(await collectCollectionDocs(invoice.ref.path + '/ledger')));
      refs.push(invoice.ref);
    }

    refs.push(card.ref);
  }

  return refs;
}

async function collectWorkspaceTree(workspaceId: string) {
  const refs: DocumentReference[] = [];

  refs.push(...(await collectCardTree(workspaceId)));

  for (const collectionName of WORKSPACE_COLLECTIONS) {
    refs.push(...(await collectCollectionDocs(`workspaces/${workspaceId}/${collectionName}`)));
  }

  refs.push(doc(getFirebaseDb(), 'workspaces', workspaceId));
  return refs;
}

async function collectUserWorkspaceRefs(userId: string) {
  const snapshot = await getDocs(collection(getFirebaseDb(), 'users', userId, 'workspaceRefs'));
  return snapshot.docs.map((item) => ({ id: item.id, ref: item.ref, data: item.data() as WorkspaceRef }));
}

async function collectFcmTokens(userId: string) {
  const snapshot = await getDocs(collection(getFirebaseDb(), 'users', userId, 'fcmTokens'));
  return snapshot.docs.map((item) => item.ref);
}

async function collectCoupleInvites(workspaceId: string) {
  const snapshot = await getDocs(query(collection(getFirebaseDb(), 'coupleInvites'), where('workspaceId', '==', workspaceId)));
  return snapshot.docs.map((item) => item.ref);
}

async function collectBillingRefs(userId: string) {
  const billingId = `billing_${userId}`;
  const billingRef = doc(getFirebaseDb(), 'billingAccounts', billingId);
  const billingSnapshot = await getDoc(billingRef);

  if (!billingSnapshot.exists()) {
    return [];
  }

  return [
    ...(await collectCollectionDocs(`billingAccounts/${billingId}/subscriptions`)),
    billingRef
  ];
}

/**
 * Desvincula o WhatsApp do workspace pessoal antes de apagar os dados — sem isso, o
 * número continuava vinculado depois da conta excluída (achado ao vivo pelo dono,
 * 2026-07-17). `unlinkWhatsapp` já existe (usado por `WhatsAppLinkPage.tsx`); aqui só
 * chama se realmente houver vínculo, e nunca deixa essa etapa travar a exclusão em si —
 * um erro aqui é secundário perto do resto dos dados sendo apagados de qualquer forma.
 */
async function unlinkWhatsappIfLinked(workspaceId: string) {
  try {
    const linksSnap = await getDocs(collection(getFirebaseDb(), 'workspaces', workspaceId, 'whatsappLinks'));
    if (linksSnap.empty) {
      return;
    }

    const fn = httpsCallable<{ workspaceId: string }, { unlinkedPhone: string }>(getFirebaseFunctions(), 'unlinkWhatsapp');
    await fn({ workspaceId });
  } catch {
    // Best-effort: não bloqueia a exclusão da conta se o desvínculo falhar.
  }
}

async function leavePartnerWorkspace(workspaceId: string, userId: string) {
  const db = getFirebaseDb();
  const batch = writeBatch(db);
  const memberRef = doc(db, 'workspaces', workspaceId, 'members', userId);
  const userWorkspaceRef = doc(db, 'users', userId, 'workspaceRefs', workspaceId);

  batch.update(memberRef, {
    status: 'removed',
    removedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  batch.update(userWorkspaceRef, {
    status: 'removed',
    updatedAt: serverTimestamp()
  });
  batch.update(doc(db, 'workspaces', workspaceId), {
    partnerUserId: '',
    activeMemberCount: 1,
    updatedAt: serverTimestamp()
  });

  await batch.commit();
}

export interface AccountDeletionDeps {
  hasGoogle: boolean;
  hasPassword: boolean;
  currentPassword: string;
  userEmail: string;
  userName: string;
  reauthenticateWithGoogle: () => Promise<unknown>;
  reauthenticateWithPassword: (password: string) => Promise<unknown>;
  /** Email de despedida (já vinculado a email/nome pelo caller). Injetado pra ordem ser testável. */
  sendGoodbyeEmail: () => Promise<unknown>;
  /** Revoga refresh tokens em todos os dispositivos. Injetado pra ordem ser testável. */
  forceLogoutAllDevices: () => Promise<unknown>;
  deleteAccountData: () => Promise<unknown>;
  deleteAuthenticatedUser: () => Promise<unknown>;
  logout: () => Promise<unknown>;
}

/**
 * Orquestra a exclusão de conta na ordem que garante que o passo IRREVERSÍVEL
 * (apagar todos os dados do Firestore) só roda depois de confirmar que a sessão
 * está "fresca" o suficiente pra Firebase aceitar apagar o usuário do Auth também.
 *
 * Bug real que isso corrige: sem reautenticar antes, `deleteAuthenticatedUser`
 * quase sempre falhava com `auth/requires-recent-login` (Firebase exige login
 * recente pra deletar usuário) — mas isso só era descoberto DEPOIS que
 * `deleteAccountData` já tinha apagado tudo. Resultado: dados sumidos, mas a
 * sessão do Firebase Auth continuava válida (não dá pra desautenticar sozinho
 * um `deleteUser()` que falhou) — a pessoa caía em `/app/onboarding` como se
 * fosse conta nova, sem precisar logar de novo, achando que a exclusão não
 * tinha funcionado.
 *
 * Ainda existe uma janela residual (bem menor): `deleteAccountData` pode
 * suceder e `deleteAuthenticatedUser` falhar por outro motivo (rede, etc.)
 * mesmo com a sessão fresca. Nesse caso força `logout()` antes de propagar o
 * erro — a pessoa cai deslogada em vez de numa sessão zumbi.
 */
export async function runAccountDeletion(deps: AccountDeletionDeps) {
  if (deps.hasGoogle) {
    await deps.reauthenticateWithGoogle();
  } else if (deps.hasPassword) {
    if (!deps.currentPassword) {
      throw new Error('Digite sua senha atual para confirmar a exclusão.');
    }
    await deps.reauthenticateWithPassword(deps.currentPassword);
  }

  // Email de despedida PRIMEIRO, enquanto a sessão está fresca (recém-reautenticada) e
  // ANTES de revogar tokens / apagar o Auth. `sendGoodbyeEmail` é onCall que EXIGE auth —
  // se disparasse depois do forceLogout (tokens revogados) e como fire-and-forget, o
  // `window.location.assign('/')` do caller abortava a requisição em voo e o email nunca
  // saía. `await` com teto de 5s garante que a chamada chega na função sem travar a exclusão.
  if (deps.userEmail) {
    await Promise.race([
      deps.sendGoodbyeEmail(),
      new Promise<void>(resolve => setTimeout(resolve, 5000))
    ]);
  }

  // Só depois revoga os refresh tokens em todos os dispositivos (idem, teto de 5s).
  await Promise.race([
    deps.forceLogoutAllDevices(),
    new Promise<void>(resolve => setTimeout(resolve, 5000))
  ]);

  await deps.deleteAccountData();

  try {
    await deps.deleteAuthenticatedUser();
  } catch (error) {
    await deps.logout();
    throw error;
  }
}

/**
 * Força logout em todos os dispositivos revogando refresh tokens.
 */
export async function forceLogoutAllDevicesCallable() {
  const fn = httpsCallable<Record<string, never>, { success: boolean }>(
    getFirebaseFunctions(),
    'forceLogoutAllDevices'
  );
  try {
    await fn({});
  } catch {
    // Se falhar, deleteUser posterior ainda invalida os tokens
  }
}

/**
 * Dispara o email de despedida via Cloud Function. Devolve a promise (pra quem chama poder
 * dar `await` com timeout), mas engole o erro — uma falha de email nunca pode travar a exclusão.
 */
export function sendGoodbyeEmailCallable(email: string, name: string) {
  const fn = httpsCallable<{ email: string; name: string }, { sent: boolean }>(
    getFirebaseFunctions(),
    'sendGoodbyeEmail'
  );
  return fn({ email, name }).catch(() => undefined);
}

export async function deleteAccountData(userId: string) {
  const refs: DocumentReference[] = [];
  const workspaceRefs = await collectUserWorkspaceRefs(userId);
  const personalWorkspaceId = getPersonalWorkspaceId(userId);

  await unlinkWhatsappIfLinked(personalWorkspaceId);

  refs.push(...(await collectWorkspaceTree(personalWorkspaceId)));

  for (const workspaceRef of workspaceRefs) {
    if (workspaceRef.id === personalWorkspaceId) {
      continue;
    }

    const workspaceSnapshot = await getDoc(doc(getFirebaseDb(), 'workspaces', workspaceRef.id));

    if (!workspaceSnapshot.exists()) {
      continue;
    }

    const workspace = workspaceSnapshot.data() as Workspace;

    if (workspace.ownerUserId === userId) {
      refs.push(...(await collectCoupleInvites(workspaceRef.id)));
      refs.push(...(await collectWorkspaceTree(workspaceRef.id)));
      continue;
    }

    await leavePartnerWorkspace(workspaceRef.id, userId);
    refs.push(doc(getFirebaseDb(), 'workspaces', workspaceRef.id, 'members', userId));
  }

  refs.push(...workspaceRefs.map((workspaceRef) => workspaceRef.ref));
  refs.push(...(await collectBillingRefs(userId)));
  refs.push(...(await collectFcmTokens(userId)));
  refs.push(doc(getFirebaseDb(), 'users', userId));

  await commitDeletes(refs);
}
