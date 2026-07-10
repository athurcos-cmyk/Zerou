import type { Timestamp } from 'firebase/firestore';
import type { AppearancePreferences, ThemeId, ThemeMode } from '../theme/theme.types';

export type Currency = 'BRL';
export type WorkspaceType = 'personal' | 'couple';
export type WorkspaceRole = 'owner' | 'partner' | 'viewer';
export type MembershipStatus = 'active' | 'invited' | 'removed';
export type SyncStatus = 'synced' | 'pending' | 'failed';
export type MoneyCents = number;
export type PlanId = 'free' | 'duo' | 'premium';
export type BillingInterval = 'monthly' | 'annual';
export type SubscriptionStatus = 'free' | 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired';

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

export type InvoiceStatus = 'open' | 'closed' | 'partial' | 'paid' | 'overpaid' | 'overdue' | 'renegotiated';

export type InvoiceLedgerEntryType =
  | 'purchase'
  | 'payment'
  | 'advance_payment'
  | 'refund_credit'
  | 'chargeback_credit'
  | 'manual_credit'
  | 'manual_debit'
  | 'interest'
  | 'fine'
  | 'iof'
  | 'fee'
  | 'installment_anticipation'
  | 'installment_anticipation_credit';

// Quando a pessoa recebe (salário/renda) — usado pra saber até quando "Comprometido"
// deve olhar sem precisar que ela lance uma receita futura manualmente.
// `variable_income` é uma escolha explícita (plantão, freela, autônomo — sem data
// fixa), não a ausência de resposta: guardar como valor real (não como `payday`
// ausente) pra UI de configurações lembrar a escolha depois de recarregar.
export type PaydayRule =
  | { type: 'fixed_day'; day: number }
  | { type: 'business_day'; day: number }
  | { type: 'end_of_month' }
  | { type: 'variable_income' };

// Como o "Disponível" do resumo é calculado. Escolha explícita da pessoa (mini tutorial
// no primeiro Dashboard, trocável em Configurações), porque as duas leituras são
// legítimas e dependem da vida de cada um:
//
// - `conservative`: Comprometido = tudo que você já deve (contas pendentes, próxima
//   ocorrência de cada recorrência, e todo saldo em aberto de fatura, inclusive parcelas
//   de meses futuros). Nunca conta com dinheiro que ainda não entrou.
// - `until_payday`: Comprometido = só o que vence antes do seu próximo recebimento
//   (receita futura lançada → data do onboarding → janela de N dias). Otimista: assume
//   que a próxima entrada acontece.
export type AvailableMode = 'conservative' | 'until_payday';

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
  onboardingGoal?: string;
  onboardingChallenge?: string;
  payday?: PaydayRule;
  // Sem `payday` (renda variável — plantão, freela, autônomo — ou pessoa que pulou a
  // pergunta), quantos dias pra frente contam como "Comprometido" no resumo. Padrão 30
  // quando ausente; editável em Configurações por qualquer pessoa, não só quem tem
  // renda variável.
  committedWindowDays?: number;
  // Ausente = a pessoa ainda não passou pelo mini tutorial do Dashboard. Nesse caso o
  // cálculo usa `defaultAvailableMode` ('until_payday', o comportamento histórico) e o
  // tutorial abre sozinho. Depois de escolher (ou dispensar), o campo existe e o
  // tutorial só reaparece se ela pedir em Configurações.
  availableMode?: AvailableMode;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Goal {
  id: string;
  workspaceId: string;
  name: string;
  kind: 'save' | 'debt';
  targetCents: MoneyCents;
  savedCents: MoneyCents;
  icon?: string;
  color?: string;
  dueDate?: Timestamp;
  isActive: boolean;
  createdBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface GoalContribution {
  id: string;
  workspaceId: string;
  goalId: string;
  userId: string;
  amountCents: MoneyCents;
  // Direção do lançamento — 'deposit' (guardar) ou 'withdrawal' (resgatar). amountCents
  // é sempre a magnitude positiva; ausente = registro legado, tratado como 'deposit'.
  type?: 'deposit' | 'withdrawal';
  monthKey?: string;
  createdAt?: Timestamp;
}

export type CoupleMode = 'savings_only' | 'transparent' | 'balanced';

export interface Workspace {
  id: string;
  type: WorkspaceType;
  name: string;
  ownerUserId: string;
  partnerUserId?: string;
  activeMemberCount?: number;
  coupleMode?: CoupleMode;
  status: 'active' | 'archived' | 'pending_deletion';
  currency: Currency;
  locale: 'pt-BR';
  timezone: 'America/Sao_Paulo';
  billingAccountId?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface WorkspaceMembership {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  status: MembershipStatus;
  displayName?: string;
  joinedAt?: Timestamp;
  removedAt?: Timestamp;
  acceptedInviteId?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface WorkspaceRef {
  workspaceId: string;
  type: WorkspaceType;
  role: WorkspaceRole;
  status: MembershipStatus;
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
  color?: string;
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
  // Dia do mês (1-31) pretendido originalmente pelo usuário, capturado na criação.
  // Usado por nextOccurrenceDate para recalcular a próxima ocorrência sempre a
  // partir da intenção original — sem isso, uma recorrência no dia 31 que caiu
  // num fev/28 (mês curto) ficaria ancorada no 28 para sempre, mesmo em meses
  // com 31 dias.
  anchorDay?: number;
  accountId?: string;
  categoryId?: string;
  isActive: boolean;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CreditCard {
  id: string;
  workspaceId: string;
  ownerUserId?: string;
  name: string;
  lastFour: string;
  brand: string;
  limitCents: MoneyCents;
  closingDay: number;
  dueDay: number;
  colorToken: string;
  isActive: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Invoice {
  id: string;
  cardId: string;
  workspaceId: string;
  referenceMonth: string;
  dueDate: Timestamp;
  status: InvoiceStatus;
  purchasesTotalCents: MoneyCents;
  paymentsTotalCents: MoneyCents;
  creditsTotalCents: MoneyCents;
  feesTotalCents: MoneyCents;
  outstandingBalanceCents: MoneyCents;
  overpaidCreditCents: MoneyCents;
  version: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface InvoiceLedgerEntry {
  id: string;
  invoiceId: string;
  cardId: string;
  workspaceId: string;
  type: InvoiceLedgerEntryType;
  amountCents: MoneyCents;
  effectiveAt: Timestamp;
  sourceTransactionId?: string;
  idempotencyKey: string;
  createdBy: string;
  createdAt?: Timestamp;
}

export interface CoupleInvite {
  id: string;
  workspaceId: string;
  workspaceName: string;
  codeHash: string;
  codeHint: string;
  createdBy: string;
  expiresAt: Timestamp;
  status: 'active' | 'accepted' | 'revoked' | 'expired';
  usedBy?: string;
  usedAt?: Timestamp;
  revokedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  version: number;
}

export interface SharedExpenseSplit {
  userId: string;
  amountCents: MoneyCents;
}

export interface SharedExpenseClaim {
  id: string;
  workspaceId: string;
  payerUserId: string;
  description: string;
  totalAmountCents: MoneyCents;
  split: SharedExpenseSplit[];
  sourceVisibility: 'summary_only';
  status: 'pending' | 'accepted' | 'disputed' | 'settled';
  createdBy: string;
  clientMutationId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  version: number;
}

export interface Settlement {
  id: string;
  workspaceId: string;
  fromUserId: string;
  toUserId: string;
  amountCents: MoneyCents;
  status: 'proposed' | 'accepted' | 'partially_paid' | 'settled' | 'cancelled';
  paidAmountCents: MoneyCents;
  createdBy: string;
  clientMutationId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  version: number;
}

export interface AuditLog {
  id: string;
  workspaceId: string;
  actorUserId: string;
  type: string;
  targetType: 'workspace' | 'invite' | 'claim' | 'settlement' | 'member';
  targetId: string;
  summary: string;
  createdAt?: Timestamp;
}

export interface Entitlements {
  canCreateCoupleWorkspace: boolean;
  canUseAdvancedReports: boolean;
  canUseAutomationRules: boolean;
  canImportStatements: boolean;
  canExportXlsx: boolean;
  canExportPdf: boolean;
  canUploadReceipts: boolean;
  canUseOcr: boolean;
  canUseAdvancedReconciliation: boolean;
  maxTransactionsPerMonth: number;
  maxReceiptStorageMb: number;
  maxAutomationRules: number;
}

export interface PlanCatalogItem {
  id: PlanId;
  name: string;
  description: string;
  active: boolean;
  monthlyPriceCents: MoneyCents;
  annualPriceCents: MoneyCents;
  stripeMonthlyPriceId?: string;
  stripeAnnualPriceId?: string;
  entitlements: Entitlements;
  updatedAt?: Timestamp;
}

export interface BillingAccount {
  id: string;
  ownerUserId: string;
  stripeCustomerId?: string;
  currentPlanId: PlanId;
  subscriptionStatus: SubscriptionStatus;
  currentSubscriptionId?: string;
  currentPeriodEnd?: Timestamp;
  entitlements: Entitlements;
  updatedAt?: Timestamp;
}

export interface SubscriptionRecord {
  id: string;
  billingAccountId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  planId: PlanId;
  stripePriceId: string;
  status: SubscriptionStatus;
  currentPeriodStart?: Timestamp;
  currentPeriodEnd?: Timestamp;
  cancelAtPeriodEnd: boolean;
  updatedAt?: Timestamp;
}

export type PrivacyRequestType = 'correction' | 'export' | 'deletion' | 'marketing_revocation' | 'cache_help';

export interface PrivacyRequest {
  id: string;
  userId: string;
  email: string;
  type: PrivacyRequestType;
  status: 'open' | 'in_review' | 'completed' | 'rejected';
  notes: string;
  version: 'zerou-v12.2-privacy-request';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
