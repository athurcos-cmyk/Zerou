import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { getFirebaseDb, isFirebaseConfigured } from '../firebase/config';
import type { AppearancePreferences } from '../theme/theme.types';

export async function syncAppearanceForUser(user: User | null, preferences: AppearancePreferences) {
  if (!user || !isFirebaseConfigured) {
    return;
  }

  await setDoc(
    doc(getFirebaseDb(), 'users', user.uid),
    {
      themeMode: preferences.themeMode,
      themeId: preferences.themeId,
      density: preferences.density,
      fontScale: preferences.fontScale,
      reduceMotion: preferences.reduceMotion,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}
