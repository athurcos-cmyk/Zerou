import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { FirebaseConfigurationError, getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from '../firebase/config';
import { useAppearanceStore } from '../theme/appearance.store';
import type { UserProfile } from '../types/contracts';
import { readCachedProfile, readLastCachedProfile, saveCachedProfile, clearCachedProfiles } from './profileCache';
import { clearIntentionalSignOut, isIntentionalSignOut } from './authSession';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  authFromCache: boolean;
  firebaseError: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);
// Tempo máximo para esperar o Firebase Auth responder antes de assumir sem sessão.
// Se o usuário tem cache local, o boot já é instantâneo e esse timeout raramente dispara.
const AUTH_BOOT_TIMEOUT_MS = 500;
const PROFILE_BOOT_TIMEOUT_MS = 1800;

function buildCachedUserFromProfile(cachedProfile: UserProfile): User {
  return {
    uid: cachedProfile.id,
    email: cachedProfile.email,
    displayName: cachedProfile.name,
    emailVerified: false,
    isAnonymous: false,
    metadata: {} as User['metadata'],
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
  } as User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Inicialização síncrona do cache local: se o usuário já logou antes, o app abre
  // imediatamente sem tela de loading, e o Firebase confirma a sessão em background.
  const [user, setUser] = useState<User | null>(() => {
    if (!isFirebaseConfigured) return null;
    const c = readLastCachedProfile();
    return c ? buildCachedUserFromProfile(c) : null;
  });
  const [profile, setProfile] = useState<UserProfile | null>(() =>
    isFirebaseConfigured ? readLastCachedProfile() : null
  );
  const [loading, setLoading] = useState(() => !isFirebaseConfigured || !readLastCachedProfile());
  const [profileLoading, setProfileLoading] = useState(false);
  const [authFromCache, setAuthFromCache] = useState(() => isFirebaseConfigured && Boolean(readLastCachedProfile()));
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const hydrateFromProfile = useAppearanceStore((state) => state.hydrateFromProfile);
  const resetLocalOverride = useAppearanceStore((state) => state.resetLocalOverride);

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

        // Sessão real chegou: descarta qualquer sinal de logout pendente que tenha
        // ficado pra trás (ex.: logout que falhou sem recarregar a página).
        if (nextUser) {
          clearIntentionalSignOut();
        }

        // Logout / exclusão de conta INTENCIONAL: o null é real, não uma oscilação de
        // rede. Não ressuscita do cache (isso criaria um usuário-zumbi de conta deletada
        // → dado órfão no onboarding). Zera o cache pra nenhum reload trazer o zumbi de
        // volta e segue pro fluxo de sessão nula limpa abaixo.
        if (!nextUser && isIntentionalSignOut()) {
          clearIntentionalSignOut();
          clearCachedProfiles();
        }

        // Quando offline, o Firebase Auth pode disparar null se nao conseguir renovar
        // o token. Se temos perfil em cache, confiamos nele em vez de deslogar o usuario
        // e limpar todos os dados da tela (o Firestore continua servindo do cache local).
        if (!nextUser) {
          const cachedProfile = readLastCachedProfile();
          if (cachedProfile) {
            setAuthFromCache(true);
            setUser(buildCachedUserFromProfile(cachedProfile));
            applyProfile(cachedProfile);
            setProfileLoading(false);
            setLoading(false);
            return;
          }
        }

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
        if (cachedProfile) {
          bootResolved = true;
          setAuthFromCache(true);
          setUser(buildCachedUserFromProfile(cachedProfile));
          applyProfile(cachedProfile);
          setProfileLoading(false);
          setLoading(false);
        } else {
          // Firebase não respondeu e não há cache — assume sem sessão
          bootResolved = true;
          setLoading(false);
        }
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
  }, [applyProfile]);

  useEffect(() => {
    if (!user || firebaseError) {
      setProfile(null);
      setProfileLoading(false);
      resetLocalOverride();
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
      }
      setProfileLoading(false);
    }, PROFILE_BOOT_TIMEOUT_MS);

    const unsubscribe = onSnapshot(
      doc(getFirebaseDb(), 'users', user.uid),
      { includeMetadataChanges: true },
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
  }, [applyProfile, firebaseError, user, resetLocalOverride]);

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
