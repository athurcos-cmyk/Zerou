import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { FirebaseConfigurationError, getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from '../firebase/config';
import { useAppearanceStore } from '../theme/appearance.store';
import type { UserProfile } from '../types/contracts';
import { readCachedProfile, readLastCachedProfile, saveCachedProfile } from './profileCache';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  authFromCache: boolean;
  firebaseError: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_BOOT_TIMEOUT_MS = 1800;
const PROFILE_BOOT_TIMEOUT_MS = 1800;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authFromCache, setAuthFromCache] = useState(false);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const hydrateFromProfile = useAppearanceStore((state) => state.hydrateFromProfile);

  const applyProfile = useCallback((nextProfile: UserProfile | null) => {
    setProfile(nextProfile);

    if (!nextProfile) {
      return;
    }

    saveCachedProfile(nextProfile);
    hydrateFromProfile({
      themeMode: nextProfile.themeMode,
      themeId: nextProfile.themeId,
      density: nextProfile.density,
      fontScale: nextProfile.fontScale,
      reduceMotion: nextProfile.reduceMotion
    });
  }, [hydrateFromProfile]);

  const buildCachedUser = useCallback((cachedProfile: UserProfile) => ({
    uid: cachedProfile.id,
    email: cachedProfile.email,
    displayName: cachedProfile.name,
    emailVerified: false,
    isAnonymous: false,
    metadata: {},
    phoneNumber: null,
    photoURL: cachedProfile.avatarUrl ?? null,
    providerData: [],
    providerId: 'zerou-cache',
    refreshToken: '',
    tenantId: null,
    delete: async () => undefined,
    getIdToken: async () => '',
    getIdTokenResult: async () => {
      throw new Error('Sessão real ainda não confirmada pelo Firebase.');
    },
    reload: async () => undefined,
    toJSON: () => ({
      uid: cachedProfile.id,
      email: cachedProfile.email,
      displayName: cachedProfile.name,
      providerId: 'zerou-cache'
    })
  } as User), []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setFirebaseError('Firebase não configurado neste deploy. Configure as variáveis VITE_FIREBASE_* na Vercel.');
      setLoading(false);
      return undefined;
    }

    try {
      const auth = getFirebaseAuth();
      let bootResolved = false;

      const finishBoot = (nextUser: User | null) => {
        bootResolved = true;
        setAuthFromCache(false);
        setUser(nextUser);
        const cachedProfile = readCachedProfile(nextUser?.uid);
        applyProfile(cachedProfile);
        setProfileLoading(Boolean(nextUser && !cachedProfile));
        setLoading(false);
      };

      const bootTimeout = window.setTimeout(() => {
        if (bootResolved) {
          return;
        }

        if (auth.currentUser) {
          finishBoot(auth.currentUser);
          return;
        }

        const cachedProfile = readLastCachedProfile();
        if (!cachedProfile) {
          return;
        }

        bootResolved = true;
        setAuthFromCache(true);
        setUser(buildCachedUser(cachedProfile));
        applyProfile(cachedProfile);
        setProfileLoading(false);
        setLoading(false);
      }, AUTH_BOOT_TIMEOUT_MS);

      const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
        window.clearTimeout(bootTimeout);
        finishBoot(nextUser);
      });

      return () => {
        window.clearTimeout(bootTimeout);
        unsubscribe();
      };
    } catch (error) {
      setFirebaseError(
        error instanceof FirebaseConfigurationError ? error.message : 'Não foi possível iniciar o Firebase Auth.'
      );
      setLoading(false);
      return undefined;
    }
  }, [applyProfile, buildCachedUser]);

  useEffect(() => {
    if (!user || firebaseError) {
      setProfile(null);
      setProfileLoading(false);
      return undefined;
    }

    const cachedProfile = readCachedProfile(user.uid);
    setProfileLoading(!cachedProfile);
    if (cachedProfile) {
      applyProfile(cachedProfile);
    }

    const profileTimeout = window.setTimeout(() => {
      const fallbackProfile = readCachedProfile(user.uid);
      if (fallbackProfile) {
        applyProfile(fallbackProfile);
        setProfileLoading(false);
      }
    }, PROFILE_BOOT_TIMEOUT_MS);

    const unsubscribe = onSnapshot(
      doc(getFirebaseDb(), 'users', user.uid),
      (snapshot) => {
        window.clearTimeout(profileTimeout);
        const nextProfile = snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as UserProfile) : null;
        applyProfile(nextProfile);
        setProfileLoading(false);
      },
      () => {
        window.clearTimeout(profileTimeout);
        applyProfile(readCachedProfile(user.uid));
        setProfileLoading(false);
      }
    );

    return () => {
      window.clearTimeout(profileTimeout);
      unsubscribe();
    };
  }, [applyProfile, firebaseError, user]);

  const value = useMemo(
    () => ({ user, profile, loading, profileLoading, authFromCache, firebaseError }),
    [user, profile, loading, profileLoading, authFromCache, firebaseError]
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
