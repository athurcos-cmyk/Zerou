import type { Timestamp } from 'firebase/firestore';
import type { AppearancePreferences, ThemeId, ThemeMode } from '../theme/theme.types';

export type Currency = 'BRL';
export type WorkspaceType = 'personal' | 'couple';
export type WorkspaceRole = 'owner' | 'partner' | 'viewer';
export type MembershipStatus = 'active' | 'invited' | 'removed';

export interface UserProfile extends AppearancePreferences {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  defaultWorkspaceId?: string;
  locale: 'pt-BR';
  timezone: 'America/Sao_Paulo';
  themeMode: ThemeMode;
  themeId: ThemeId;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Workspace {
  id: string;
  type: WorkspaceType;
  name: string;
  ownerUserId: string;
  status: 'active' | 'archived' | 'pending_deletion';
  currency: Currency;
  locale: 'pt-BR';
  timezone: 'America/Sao_Paulo';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface WorkspaceMembership {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  status: MembershipStatus;
  joinedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
