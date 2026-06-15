import type { Timestamp } from 'firebase/firestore';
import type { AppearancePreferences, ThemeId, ThemeMode } from '../theme/theme.types';

export type Currency = 'BRL';
export type WorkspaceType = 'personal' | 'couple';
export type WorkspaceRole = 'owner' | 'partner' | 'viewer';
export type MembershipStatus = 'active' | 'invited' | 'removed';
export type SyncStatus = 'synced' | 'pending' | 'failed';
export type MoneyCents = number;

export type AccountType = 'checking' | 'savings' | 'wallet' | 'investment' | 'digital_wallet' | 'cash' | 'shared';

export type TransactionType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'adjustment'
  | 'refund'
  | 'reimbursement'
  | 'card_purchase'
  | 'card_payment';

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

export interface Account {
  id: string;
  workspaceId: string;
  name: string;
  type: AccountType;
  openingBalanceCents: MoneyCents;
  isActive: boolean;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Category {
  id: string;
  workspaceId: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  parentCategoryId?: string;
  icon?: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Transaction {
  id: string;
  workspaceId: string;
  createdBy: string;
  updatedBy: string;
  type: TransactionType;
  amountCents: MoneyCents;
  description: string;
  merchant?: string;
  categoryId?: string;
  accountId?: string;
  destinationAccountId?: string;
  cardId?: string;
  invoiceId?: string;
  date: Timestamp;
  competenceMonth: string;
  cashMonth: string;
  tags: string[];
  notes?: string;
  isRecurring: boolean;
  recurringId?: string;
  installmentGroupId?: string;
  clientMutationId: string;
  syncStatus: SyncStatus;
  version: number;
  deletedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Bill {
  id: string;
  workspaceId: string;
  description: string;
  amountCents: MoneyCents;
  dueDate: Timestamp;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  categoryId?: string;
  accountId?: string;
  recurringId?: string;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface RecurringRule {
  id: string;
  workspaceId: string;
  description: string;
  amountCents?: MoneyCents;
  frequency: 'weekly' | 'monthly' | 'yearly';
  nextOccurrenceAt: Timestamp;
  accountId?: string;
  categoryId?: string;
  isActive: boolean;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
