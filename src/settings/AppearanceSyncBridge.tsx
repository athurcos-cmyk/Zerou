import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useAppearanceStore } from '../theme/appearance.store';
import { syncAppearanceForUser } from './appearanceSync';
import { hasAppearanceChanged } from './appearanceDiff';

export function AppearanceSyncBridge() {
  const { user, profile } = useAuth();
  const preferences = useAppearanceStore((state) => state.preferences);

  useEffect(() => {
    if (!user || !profile) {
      return undefined;
    }

    if (!hasAppearanceChanged(profile, preferences)) {
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
