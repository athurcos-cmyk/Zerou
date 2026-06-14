import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useAppearanceStore } from '../theme/appearance.store';
import { syncAppearanceForUser } from './appearanceSync';

export function AppearanceSyncBridge() {
  const { user, profile } = useAuth();
  const preferences = useAppearanceStore((state) => state.preferences);

  useEffect(() => {
    if (!user || !profile) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      syncAppearanceForUser(user, preferences).catch(() => {
        // Local theme changes remain valid even if Firestore sync is temporarily unavailable.
      });
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [user, profile, preferences]);

  return null;
}
