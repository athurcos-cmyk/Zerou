import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { useAppearanceStore } from '../theme/appearance.store';
import type { UserProfile } from '../types/contracts';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const hydrateFromProfile = useAppearanceStore((state) => state.hydrateFromProfile);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setProfile(null);
      setProfileLoading(Boolean(nextUser));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return undefined;
    }

    setProfileLoading(true);
    return onSnapshot(
      doc(db, 'users', user.uid),
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
  }, [hydrateFromProfile, user]);

  const value = useMemo(
    () => ({ user, profile, loading, profileLoading }),
    [user, profile, loading, profileLoading]
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
