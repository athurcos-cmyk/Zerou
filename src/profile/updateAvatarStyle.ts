import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase/config';
import { fireWrite } from '../firebase/fireWrite';

export async function updateAvatarStyle(uid: string, avatarStyle: string | undefined) {
  fireWrite(updateDoc(doc(getFirebaseDb(), 'users', uid), {
    avatarStyle: avatarStyle ?? null,
    updatedAt: serverTimestamp(),
  }));
}
