import { useEffect, useMemo, useState } from 'react';
import { calculateSharedBalances, suggestSettlement } from '../domain/shared/calculateSharedBalances';
import {
  subscribeActiveInvites,
  subscribeMembers,
  subscribeSettlements,
  subscribeSharedClaims,
  subscribeSharedComments,
  subscribeWorkspace,
  subscribeWorkspaceRefs,
  type LocalSharedSynced
} from './sharedService';
import type {
  CoupleInvite,
  Settlement,
  SharedComment,
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
  comments: Array<LocalSharedSynced<SharedComment>>;
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
  comments: [],
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

    return subscribeWorkspaceRefs(
      userId,
      (workspaceRefs) =>
        setState((current) => ({
          ...current,
          workspaceRefs,
          loading: false,
          error: null
        })),
      () =>
        setState((current) => ({
          ...current,
          loading: false,
          error: 'Não foi possível carregar seus espaços Zerou.'
        }))
    );
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
        settlements: [],
        comments: []
      }));
      return undefined;
    }

    const workspaceId = activeCoupleRef.workspaceId;
    const onError = () =>
      setState((current) => ({
        ...current,
        loading: false,
        error: 'Não foi possível carregar o espaço compartilhado.'
      }));

    const unsubscribers = [
      subscribeWorkspace(workspaceId, (workspace) => setState((current) => ({ ...current, workspace, loading: false })), onError),
      subscribeMembers(workspaceId, (members) => setState((current) => ({ ...current, members, loading: false })), onError),
      subscribeActiveInvites(workspaceId, (invites) => setState((current) => ({ ...current, invites, loading: false })), onError),
      subscribeSharedClaims(workspaceId, (claims) => setState((current) => ({ ...current, claims, loading: false })), onError),
      subscribeSettlements(workspaceId, (settlements) => setState((current) => ({ ...current, settlements, loading: false })), onError),
      subscribeSharedComments(workspaceId, (comments) => setState((current) => ({ ...current, comments, loading: false })), onError)
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
        ...state.comments,
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
