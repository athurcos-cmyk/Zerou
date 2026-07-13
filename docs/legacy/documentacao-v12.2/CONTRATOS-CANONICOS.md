# Zerou v12.2 — Contratos canônicos

> Este arquivo estabiliza os contratos entre fases. Não alterar silenciosamente interfaces já utilizadas. Qualquer mudança deve ser registrada em `IMPLEMENTATION_STATUS.md`, com impacto e migração.

# 1. Convenções

```typescript
import type { Timestamp } from 'firebase/firestore';

type Currency = 'BRL';
type WorkspaceType = 'personal' | 'couple';
type WorkspaceRole = 'owner' | 'partner' | 'viewer';
type MembershipStatus = 'active' | 'invited' | 'removed';
type SyncStatus = 'synced' | 'pending' | 'failed';
type ThemeId = 'paper' | 'sakura' | 'obsidian' | 'midnight' | 'aurora' | 'rose-gold';
type ThemeMode = 'manual' | 'system';

type MoneyCents = number; // inteiro seguro em centavos; nunca float monetário
```

Regras:

- persistir dinheiro como inteiros em centavos;
- usar `Timestamp` do servidor em documentos persistidos;
- usar IDs gerados no cliente quando necessário para suportar escrita offline idempotente;
- não confiar em campos protegidos recebidos do frontend;
- aplicar soft delete quando histórico e auditoria exigirem preservação.

# 2. Usuário e workspaces

```typescript
interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  defaultWorkspaceId: string;
  locale: 'pt-BR';
  timezone: 'America/Sao_Paulo';
  themeMode: ThemeMode;
  themeId: ThemeId;
  density: 'comfortable' | 'compact';
  fontScale: 'sm' | 'md' | 'lg';
  reduceMotion: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

Regras de aparência:

- preferências pertencem ao perfil individual, nunca ao workspace;
- `themeMode: 'system'` resolve `paper` em sistema claro e `obsidian` em sistema escuro;
- `themeId` preserva a seleção manual do usuário;
- a aplicação local imediata ocorre via `localStorage`; a sincronização Firestore restaura a escolha em novos dispositivos;
- componentes consomem tokens semânticos definidos em `THEME-SYSTEM.md`.

interface Workspace {
  id: string;
  type: WorkspaceType;
  name: string;
  ownerUserId: string;
  status: 'active' | 'archived' | 'pending_deletion';
  currency: Currency;
  locale: 'pt-BR';
  timezone: 'America/Sao_Paulo';
  billingAccountId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface WorkspaceMembership {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  status: MembershipStatus;
  joinedAt?: Timestamp;
  removedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

# 3. Financeiro essencial

```typescript
type AccountType =
  | 'checking'
  | 'savings'
  | 'wallet'
  | 'investment'
  | 'digital_wallet'
  | 'cash'
  | 'shared';

interface Account {
  id: string;
  workspaceId: string;
  name: string;
  type: AccountType;
  openingBalanceCents: MoneyCents;
  isActive: boolean;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface Category {
  id: string;
  workspaceId: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  parentCategoryId?: string;
  icon?: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

type TransactionType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'adjustment'
  | 'refund'
  | 'reimbursement'
  | 'card_purchase'
  | 'card_payment';

interface Transaction {
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
  competenceMonth: string; // YYYY-MM
  cashMonth: string; // YYYY-MM
  tags: string[];
  notes?: string;
  isRecurring: boolean;
  recurringId?: string;
  installmentGroupId?: string;
  clientMutationId: string;
  syncStatus: SyncStatus;
  version: number;
  deletedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface Bill {
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface RecurringRule {
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

# 4. Cartões e faturas

```typescript
interface CreditCard {
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

type InvoiceStatus =
  | 'open'
  | 'closed'
  | 'partial'
  | 'paid'
  | 'overpaid'
  | 'overdue'
  | 'renegotiated';

interface Invoice {
  id: string;
  cardId: string;
  workspaceId: string;
  referenceMonth: string; // YYYY-MM
  dueDate: Timestamp;
  status: InvoiceStatus;
  purchasesTotalCents: MoneyCents;
  paymentsTotalCents: MoneyCents;
  creditsTotalCents: MoneyCents;
  feesTotalCents: MoneyCents;
  outstandingBalanceCents: MoneyCents;
  overpaidCreditCents: MoneyCents;
  version: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

type InvoiceLedgerEntryType =
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
  | 'installment_anticipation';

interface InvoiceLedgerEntry {
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
  createdAt: Timestamp;
}
```

# 5. Compartilhamento

```typescript
interface CoupleInvite {
  id: string;
  workspaceId: string;
  codeHash: string;
  createdBy: string;
  expiresAt: Timestamp;
  status: 'active' | 'accepted' | 'revoked' | 'expired';
  usedBy?: string;
  usedAt?: Timestamp;
  createdAt: Timestamp;
}

interface SharedExpenseClaim {
  id: string;
  workspaceId: string;
  payerUserId: string;
  description: string;
  totalAmountCents: MoneyCents;
  split: Array<{ userId: string; amountCents: MoneyCents }>;
  sourceVisibility: 'summary_only';
  sourcePersonalTransactionId?: string; // referência server-side; não expor detalhes ao parceiro
  status: 'pending' | 'accepted' | 'disputed' | 'settled';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface Settlement {
  id: string;
  workspaceId: string;
  fromUserId: string;
  toUserId: string;
  amountCents: MoneyCents;
  status: 'proposed' | 'accepted' | 'partially_paid' | 'settled' | 'cancelled';
  paidAmountCents: MoneyCents;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

# 6. Catálogo, assinatura e entitlements

```typescript
type PlanId = 'free' | 'duo' | 'premium';

type SubscriptionStatus =
  | 'free'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'cancelled'
  | 'expired';

interface Entitlements {
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

interface PlanCatalogItem {
  id: PlanId;
  name: string;
  description: string;
  active: boolean;
  monthlyPriceCents: MoneyCents;
  annualPriceCents: MoneyCents;
  stripeMonthlyPriceId?: string;
  stripeAnnualPriceId?: string;
  entitlements: Entitlements;
  updatedAt: Timestamp;
}

interface BillingAccount {
  id: string;
  ownerUserId: string;
  stripeCustomerId?: string;
  currentPlanId: PlanId;
  subscriptionStatus: SubscriptionStatus;
  currentSubscriptionId?: string;
  currentPeriodEnd?: Timestamp;
  entitlements: Entitlements;
  updatedAt: Timestamp;
}

interface SubscriptionRecord {
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
  updatedAt: Timestamp;
}

interface BillingEvent {
  stripeEventId: string;
  type: string;
  status: 'received' | 'processing' | 'processed' | 'failed' | 'ignored';
  attempts: number;
  stripeCreatedAt?: Timestamp;
  receivedAt: Timestamp;
  processingStartedAt?: Timestamp;
  processedAt?: Timestamp;
  lastErrorCode?: string;
  lastErrorMessageRedacted?: string;
}

interface CreateCheckoutInput {
  userId: string;
  planId: Exclude<PlanId, 'free'>;
  billingInterval: 'monthly' | 'annual';
  successUrl: string;
  cancelUrl: string;
}

interface BillingProvider {
  createCheckoutSession(input: CreateCheckoutInput): Promise<{ url: string }>;
  createCustomerPortalSession(userId: string): Promise<{ url: string }>;
  ingestWebhook(rawBody: Buffer, signature: string): Promise<void>;
}
```

# 7. Campos protegidos

O cliente não altera diretamente:

```text
ownerUserId
workspaceId após criação
memberships
role
billingAccountId
planId
subscriptionStatus
entitlements
createdAt
campos administrativos
flags de moderação
limites de uso
campos agregados de fatura
ledger imutável
```

# 8. Paths canônicos

```text
/users/{uid}
/users/{uid}/workspaceRefs/{workspaceId}
/workspaces/{workspaceId}
/workspaces/{workspaceId}/members/{uid}
/workspaces/{workspaceId}/accounts/{accountId}
/workspaces/{workspaceId}/categories/{categoryId}
/workspaces/{workspaceId}/transactions/{transactionId}
/workspaces/{workspaceId}/bills/{billId}
/workspaces/{workspaceId}/recurring/{recurringId}
/workspaces/{workspaceId}/cards/{cardId}
/workspaces/{workspaceId}/cards/{cardId}/invoices/{invoiceId}
/workspaces/{workspaceId}/cards/{cardId}/invoices/{invoiceId}/ledger/{entryId}
/workspaces/{workspaceId}/sharedExpenseClaims/{claimId}
/workspaces/{workspaceId}/settlements/{settlementId}
/workspaces/{workspaceId}/auditLogs/{id}
/coupleInvites/{inviteId}
/billingAccounts/{billingAccountId}
/billingAccounts/{billingAccountId}/subscriptions/{subscriptionId}
/billingAccounts/{billingAccountId}/billingEvents/{stripeEventId}
/planCatalog/{planId}
/privacyRequests/{requestId}
```
