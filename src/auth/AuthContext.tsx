import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { FirebaseConfigurationError, getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from '../firebase/config';
import { useAppearanceStore } from '../theme/appearance.store';
import type { UserProfile } from '../types/contracts';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  firebaseError: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const hydrateFromProfile = useAppearanceStore((state) => state.hydrateFromProfile);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setFirebaseError('Firebase não configurado neste deploy. Configure as variáveis VITE_FIREBASE_* na Vercel.');
      setLoading(false);
      return undefined;
    }

    try {
      return onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
        setUser(nextUser);
        setProfile(null);
        setProfileLoading(Boolean(nextUser));
        setLoading(false);
      });
    } catch (error) {
      setFirebaseError(
        error instanceof FirebaseConfigurationError ? error.message : 'Não foi possível iniciar o Firebase Auth.'
      );
      setLoading(false);
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (!user || firebaseError) {
      setProfile(null);
      setProfileLoading(false);
      return undefined;
    }

    setProfileLoading(true);
    return onSnapshot(
      doc(getFirebaseDb(), 'users', user.uid),
      (snapshot) => {
        const nextProfile = snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as UserProfile) : null;
        setProfile(nextProfile);
        setProfileLoading(false);

        if (nextProfile) {
          hydrateFromProfile({
            themeMode: nextProfile.themeMode,
            themeId: nextProfile.themeId,
            density: nextProfile.density,
            fontScale: nextProfile.fontScale,
            reduceMotion: nextProfile.reduceMotion
          });
        }
      },
      () => {
        setProfile(null);
        setProfileLoading(false);
      }
    );
  }, [firebaseError, hydrateFromProfile, user]);

  const value = useMemo(
    () => ({ user, profile, loading, profileLoading, firebaseError }),
    [user, profile, loading, profileLoading, firebaseError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth precisa estar dentro de AuthProvider.');
  }

  return value;
}
