import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  linkWithCredential,
  linkWithPopup,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  unlink,
  updateProfile,
  type User
} from 'firebase/auth';
import { clearIndexedDbPersistence, terminate } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from '../firebase/config';
import { clearCachedProfiles } from './profileCache';
import { beginIntentionalSignOut } from './authSession';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function registerWithEmail(name: string, email: string, password: string) {
  const auth = getFirebaseAuth();
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: name });
  await sendEmailVerification(credential.user);
  return credential.user;
}

export async function loginWithEmail(email: string, password: string) {
  const auth = getFirebaseAuth();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function loginWithGoogle() {
  const auth = getFirebaseAuth();
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export async function sendResetEmail(email: string) {
  await sendPasswordResetEmail(getFirebaseAuth(), email);
}

export async function logout(options?: { clearLocalCache?: boolean }) {
  const auth = getFirebaseAuth();
  const db = getFirebaseDb();

  // Marca ANTES do signOut: o `onAuthStateChanged(null)` que vem logo em seguida é
  // intencional e não deve ser mascarado pelo fallback de cache offline do AuthContext.
  beginIntentionalSignOut();
  await signOut(auth);

  if (options?.clearLocalCache) {
    clearCachedProfiles();
    await terminate(db);
    await clearIndexedDbPersistence(db);
    window.location.reload();
  }
}

export async function sendVerification(user: User) {
  await sendEmailVerification(user);
}

export async function linkGoogleProvider(user: User) {
  await linkWithPopup(user, googleProvider);
}

export async function addPasswordProvider(user: User, password: string) {
  if (!user.email) {
    throw new Error('A conta precisa ter email para adicionar senha.');
  }

  const credential = EmailAuthProvider.credential(user.email, password);
  await linkWithCredential(user, credential);
}

export async function reauthenticateWithPassword(user: User, password: string) {
  if (!user.email) {
    throw new Error('A conta precisa ter email para reautenticar.');
  }

  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
}

export async function reauthenticateWithGoogle(user: User) {
  await reauthenticateWithPopup(user, googleProvider);
}

export async function unlinkProvider(user: User, providerId: string) {
  if (user.providerData.length <= 1) {
    throw new Error('Mantenha pelo menos um método de acesso ativo.');
  }

  await unlink(user, providerId);
}

export async function deleteAuthenticatedUser(user: User) {
  // Limpa cache e marca o sign-out ANTES do deleteUser: ele dispara
  // `onAuthStateChanged(null)` na hora, e sem isso o AuthContext ressuscitaria um
  // usuário-zumbi do cache (uid de conta já deletada → onboarding grava dado órfão).
  beginIntentionalSignOut();
  clearCachedProfiles();
  await deleteUser(user);
}
