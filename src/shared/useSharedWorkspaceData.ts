import { useEffect, useMemo, useState } from 'react';
import { calculateSharedBalances, suggestSettlement } from '../domain/shared/calculateSharedBalances';
import { subscribeWithTransientRetry } from '../firebase/firestoreRetry';
import {
  subscribeActiveInvites,
  subscribeMembers,
  subscribeSettlements,
  subscribeSharedClaims,
  subscribeWorkspace,
  subscribeWorkspaceRefs,
  type LocalSharedSynced
} from './sharedService';
import type {
  CoupleInvite,
  Settlement,
  SharedExpenseClaim,
  Workspace,
  WorkspaceMembership,
  WorkspaceRef
} from '../types/contracts';

interface SharedWorkspaceState {
  workspaceRefs: Array<LocalSharedSynced<WorkspaceRef>>;
  workspace: LocalSharedSynced<Workspace> | null;
  members: Array<LocalSharedSynced<WorkspaceMembership>>;
  invites: Array<LocalSharedSynced<CoupleInvite>>;
  claims: Array<LocalSharedSynced<SharedExpenseClaim>>;
  settlements: Array<LocalSharedSynced<Settlement>>;
  loading: boolean;
  error: string | null;
}

const initialState: SharedWorkspaceState = {
  workspaceRefs: [],
  workspace: null,
  members: [],
  invites: [],
  claims: [],
  settlements: [],
  loading: true,
  error: null
};

export function useSharedWorkspaceData(userId?: string) {
  const [state, setState] = useState<SharedWorkspaceState>(initialState);

  useEffect(() => {
    if (!userId) {
      setState({ ...initialState, loading: false });
      return undefined;
    }

    setState((current) => ({ ...current, loading: true, error: null }));

    const bootTimer = window.setTimeout(() => {
      setState((current) => current.loading ? { ...current, loading: false } : current);
    }, 2500);

    const unsub = subscribeWithTransientRetry({
      subscribe: (onError, markLoaded) =>
        subscribeWorkspaceRefs(
          userId,
          (workspaceRefs) => {
            markLoaded();
            setState((current) => ({
              ...current,
              workspaceRefs,
              loading: false,
              error: null
            }));
          },
          onError
        ),
      onRetrying: () => setState((current) => ({ ...current, loading: true, error: null })),
      onError: () =>
        setState((current) => ({
          ...current,
          loading: false,
          error: 'Não foi possível carregar seus espaços Granativa.'
        }))
    });

    return () => {
      window.clearTimeout(bootTimer);
      unsub();
    };
  }, [userId]);

  const activeCoupleRef = useMemo(
    () => state.workspaceRefs.find((item) => item.type === 'couple' && item.status === 'active') ?? null,
    [state.workspaceRefs]
  );

  useEffect(() => {
    if (!activeCoupleRef) {
      setState((current) => ({
        ...current,
        workspace: null,
        members: [],
        invites: [],
        claims: [],
        settlements: []
      }));
      return undefined;
    }

    const workspaceId = activeCoupleRef.workspaceId;
    const onRetrying = () => setState((current) => ({ ...current, loading: true, error: null }));
    const onError = () =>
      setState((current) => ({
        ...current,
        loading: false,
        error: 'Não foi possível carregar o espaço compartilhado.'
      }));

    const unsubscribers = [
      subscribeWithTransientRetry({
        subscribe: (handleError, markLoaded) =>
          subscribeWorkspace(workspaceId, (workspace) => {
            markLoaded();
            setState((current) => ({ ...current, workspace, loading: false }));
          }, handleError),
        onRetrying,
        onError
      }),
      subscribeWithTransientRetry({
        subscribe: (handleError, markLoaded) =>
          subscribeMembers(workspaceId, (members) => {
            markLoaded();
            setState((current) => ({ ...current, members, loading: false }));
          }, handleError),
        onRetrying,
        onError
      }),
      subscribeWithTransientRetry({
        subscribe: (handleError, markLoaded) =>
          subscribeActiveInvites(workspaceId, (invites) => {
            markLoaded();
            setState((current) => ({ ...current, invites, loading: false }));
          }, handleError),
        onRetrying,
        onError
      }),
      subscribeWithTransientRetry({
        subscribe: (handleError, markLoaded) =>
          subscribeSharedClaims(workspaceId, (claims) => {
            markLoaded();
            setState((current) => ({ ...current, claims, loading: false }));
          }, handleError),
        onRetrying,
        onError
      }),
      subscribeWithTransientRetry({
        subscribe: (handleError, markLoaded) =>
          subscribeSettlements(workspaceId, (settlements) => {
            markLoaded();
            setState((current) => ({ ...current, settlements, loading: false }));
          }, handleError),
        onRetrying,
        onError
      })
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [activeCoupleRef]);

  const activeMembers = useMemo(() => state.members.filter((member) => member.status === 'active'), [state.members]);
  const balances = useMemo(() => calculateSharedBalances(state.claims, state.settlements), [state.claims, state.settlements]);
  const settlementSuggestion = useMemo(() => suggestSettlement(state.claims, state.settlements), [state.claims, state.settlements]);
  const pendingWrites = useMemo(
    () =>
      [
        ...state.workspaceRefs,
        ...state.members,
        ...state.invites,
        ...state.claims,
        ...state.settlements,
        ...(state.workspace ? [state.workspace] : [])
      ].some((item) => item.localSyncStatus === 'pending'),
    [state]
  );

  return {
    ...state,
    activeCoupleRef,
    activeMembers,
    balances,
    settlementSuggestion,
    pendingWrites
  };
}
