import type Stripe from 'stripe';

export type MoneyCents = number;
export type PlanId = 'free' | 'duo' | 'premium';
export type BillingInterval = 'monthly' | 'annual';

export type SubscriptionStatus =
  | 'free'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'cancelled'
  | 'expired';

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
  updatedAt?: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
}

export interface BillingAccount {
  id: string;
  ownerUserId: string;
  stripeCustomerId?: string;
  currentPlanId: PlanId;
  subscriptionStatus: SubscriptionStatus;
  currentSubscriptionId?: string;
  currentPeriodEnd?: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  entitlements: Entitlements;
  updatedAt?: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
}

export interface SubscriptionRecord {
  id: string;
  billingAccountId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  planId: PlanId;
  stripePriceId: string;
  status: SubscriptionStatus;
  currentPeriodStart?: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  currentPeriodEnd?: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  cancelAtPeriodEnd: boolean;
  updatedAt?: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
}

export type BillingEventStatus = 'received' | 'processing' | 'processed' | 'failed' | 'ignored';

export interface BillingEvent {
  stripeEventId: string;
  type: string;
  status: BillingEventStatus;
  attempts: number;
  billingAccountId: string;
  objectId?: string;
  objectType?: string;
  stripeCreatedAt?: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  receivedAt?: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  processingStartedAt?: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  processedAt?: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  lastErrorCode?: string;
  lastErrorMessageRedacted?: string;
  payload: PersistedStripePayload;
}

export interface CreateCheckoutInput {
  userId: string;
  planId: Exclude<PlanId, 'free'>;
  billingInterval: BillingInterval;
  successUrl: string;
  cancelUrl: string;
  clientRequestId: string;
}

export interface BillingProvider {
  createCheckoutSession(input: CreateCheckoutInput): Promise<{ url: string }>;
  createCustomerPortalSession(userId: string, returnUrl: string): Promise<{ url: string }>;
  ingestWebhook(rawBody: Buffer, signature: string): Promise<void>;
}

export interface PersistedStripePayload {
  id: string;
  object: string;
  customerId?: string;
  subscriptionId?: string;
  priceId?: string;
  status?: string;
  metadata: Record<string, string>;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
}

export interface BillingEventProcessorDeps {
  retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription>;
  now(): FirebaseFirestore.FieldValue;
}
