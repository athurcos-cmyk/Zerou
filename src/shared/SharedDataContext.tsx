import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useCoupleSavings } from './useCoupleSavings';
import { useSharedWorkspaceData } from './useSharedWorkspaceData';

const SharedContext = createContext<ReturnType<typeof useSharedWorkspaceData> | null>(null);
const CoupleSavingsContext = createContext<ReturnType<typeof useCoupleSavings> | null>(null);

export function SharedDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const shared = useSharedWorkspaceData(user?.uid);
  const coupleWorkspaceId = shared.activeCoupleRef?.workspaceId;
  const savings = useCoupleSavings(coupleWorkspaceId);

  return (
    <SharedContext.Provider value={shared}>
      <CoupleSavingsContext.Provider value={savings}>
        {children}
      </CoupleSavingsContext.Provider>
    </SharedContext.Provider>
  );
}

export function useSharedContext() {
  const ctx = useContext(SharedContext);
  if (!ctx) throw new Error('useSharedContext deve estar dentro de SharedDataProvider.');
  return ctx;
}

export function useCoupleSavingsContext() {
  const ctx = useContext(CoupleSavingsContext);
  if (!ctx) throw new Error('useCoupleSavingsContext deve estar dentro de SharedDataProvider.');
  return ctx;
}
