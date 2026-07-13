import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase/config';

export async function updateAvatarStyle(uid: string, avatarStyle: string | undefined) {
  await updateDoc(doc(getFirebaseDb(), 'users', uid), {
    avatarStyle: avatarStyle ?? null,
    updatedAt: serverTimestamp(),
  });
}
