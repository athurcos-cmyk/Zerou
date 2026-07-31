import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { UserProfile, Workspace, WorkspaceRef } from '../types/contracts';
import { getFirebaseDb, getFirebaseFunctions } from '../firebase/config';

export interface AdminInvite {
  id: string;
  workspaceId: string;
  workspaceName: string;
  codeHint: string;
  createdBy: string;
  expiresAt: Timestamp | null;
  status: 'active' | 'accepted' | 'revoked' | 'expired';
  usedBy?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export type AdminCursor = QueryDocumentSnapshot<DocumentData> | null;

export interface AdminPage<T> {
  items: T[];
  cursor: AdminCursor;
  hasMore: boolean;
}

// Página por carregamento — evita puxar a coleção inteira de uma vez só
// (era um teto fixo de 500/200 antes, que escondia usuários acima da marca).
export const ADMIN_PAGE_SIZE = 100;

export async function getAdminUsers(cursor: AdminCursor = null): Promise<AdminPage<UserProfile>> {
  const db = getFirebaseDb();
  const constraints = [orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(ADMIN_PAGE_SIZE)];
  const snap = await getDocs(query(collection(db, 'users'), ...constraints));
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserProfile)),
    cursor: snap.docs.at(-1) ?? null,
    hasMore: snap.docs.length === ADMIN_PAGE_SIZE,
  };
}

export async function getAdminCoupleWorkspaces(cursor: AdminCursor = null): Promise<AdminPage<Workspace>> {
  const db = getFirebaseDb();
  const constraints = [
    where('type', '==', 'couple'),
    orderBy('createdAt', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(ADMIN_PAGE_SIZE),
  ];
  const snap = await getDocs(query(collection(db, 'workspaces'), ...constraints));
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() } as Workspace)),
    cursor: snap.docs.at(-1) ?? null,
    hasMore: snap.docs.length === ADMIN_PAGE_SIZE,
  };
}

export async function getAdminInvites(cursor: AdminCursor = null): Promise<AdminPage<AdminInvite>> {
  const db = getFirebaseDb();
  const constraints = [orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(ADMIN_PAGE_SIZE)];
  const snap = await getDocs(query(collection(db, 'coupleInvites'), ...constraints));
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdminInvite)),
    cursor: snap.docs.at(-1) ?? null,
    hasMore: snap.docs.length === ADMIN_PAGE_SIZE,
  };
}

export interface AdminWorkspaceRef extends WorkspaceRef {
  id: string;
}

// Metadados de espaço por usuário pro painel de detalhes do admin — não busca
// nenhum dado financeiro, só o que já é legível via `isSelf(uid) || isAdmin()`.
export async function getAdminUserWorkspaceRefs(uid: string): Promise<AdminWorkspaceRef[]> {
  const snap = await getDocs(collection(getFirebaseDb(), 'users', uid, 'workspaceRefs'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdminWorkspaceRef));
}

export async function getAdminWorkspacesByIds(ids: string[]): Promise<Map<string, Workspace>> {
  const db = getFirebaseDb();
  const entries = await Promise.all(
    ids.map(async (id) => {
      const snap = await getDoc(doc(db, 'workspaces', id));
      return snap.exists() ? ([id, { id: snap.id, ...snap.data() } as Workspace] as const) : null;
    })
  );
  return new Map(entries.filter((entry): entry is readonly [string, Workspace] => entry !== null));
}

export async function callAdminDeleteUser(userId: string): Promise<{ docsDeleted: number }> {
  const fn = httpsCallable<{ userId: string }, { success: boolean; docsDeleted: number }>(
    getFirebaseFunctions(),
    'adminDeleteUser'
  );
  const result = await fn({ userId });
  return result.data;
}

export async function callAdminForceLogout(userId: string): Promise<void> {
  const fn = httpsCallable<{ userId: string }, { success: boolean }>(
    getFirebaseFunctions(),
    'adminForceLogout'
  );
  await fn({ userId });
}

export interface AdminWhatsappLink {
  phone: string;
  workspaceId: string;
  linkedByUid: string;
  linkedAt: Timestamp | null;
}

// Coleção pequena (um doc por número vinculado) — sem paginação por cursor como
// users/couples/invites, não vale a complexidade pro volume atual.
export async function getAdminWhatsappLinks(): Promise<AdminWhatsappLink[]> {
  const snap = await getDocs(collection(getFirebaseDb(), 'whatsappPhoneIndex'));
  return snap.docs.map((d) => ({ phone: d.id, ...d.data() } as AdminWhatsappLink));
}

// Desvincula qualquer número, inclusive "órfão" (apontando pra workspace/usuário já
// excluído) — via Admin SDK, o client não pode escrever em whatsappPhoneIndex/whatsappLinks
// (firestore.rules: allow write: if false). Achado real: exclusão de conta antes da
// correção de 2026-07-17 deixava o número preso, sem forma de religar pelo app.
export async function callAdminUnlinkWhatsapp(phone: string): Promise<void> {
  const fn = httpsCallable<{ phone: string }, { success: boolean }>(
    getFirebaseFunctions(),
    'adminUnlinkWhatsappNumber'
  );
  await fn({ phone });
}

export type AdminMessageChannel = 'push' | 'email' | 'both';

export interface AdminSendMessageResult {
  success: boolean;
  push: { tokensFound: number; sent: number };
  email: { sent: boolean; reason?: string } | null;
}

export async function callAdminSendMessage(input: {
  userId: string;
  channel: AdminMessageChannel;
  subject?: string;
  message: string;
}): Promise<AdminSendMessageResult> {
  const fn = httpsCallable<typeof input, AdminSendMessageResult>(getFirebaseFunctions(), 'adminSendMessage');
  const result = await fn(input);
  return result.data;
}

export interface AdminBroadcastMessageResult {
  success: boolean;
  pushFound: number;
  pushSent: number;
  emailAttempted: number;
  emailSent: number;
}

export async function callAdminBroadcastMessage(input: {
  channel: AdminMessageChannel;
  subject?: string;
  message: string;
}): Promise<AdminBroadcastMessageResult> {
  const fn = httpsCallable<typeof input, AdminBroadcastMessageResult>(getFirebaseFunctions(), 'adminBroadcastMessage');
  const result = await fn(input);
  return result.data;
}

export interface AdminMessage {
  id: string;
  type: 'individual' | 'broadcast';
  channel: AdminMessageChannel;
  subject: string | null;
  message: string;
  targetUserId: string | null;
  targetName: string | null;
  pushFound: number;
  pushSent: number;
  emailAttempted: number;
  emailSent: number;
  sentBy: string | null;
  createdAt?: Timestamp | null;
}

// Histórico de envios do admin — mesmo padrão de paginação por cursor das outras abas.
export async function getAdminMessages(cursor: AdminCursor = null): Promise<AdminPage<AdminMessage>> {
  const db = getFirebaseDb();
  const constraints = [orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(ADMIN_PAGE_SIZE)];
  const snap = await getDocs(query(collection(db, 'adminMessages'), ...constraints));
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdminMessage)),
    cursor: snap.docs.at(-1) ?? null,
    hasMore: snap.docs.length === ADMIN_PAGE_SIZE,
  };
}
