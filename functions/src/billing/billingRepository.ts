import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import type { BillingAccount, BillingEvent, PersistedStripePayload, PlanId, SubscriptionRecord, SubscriptionStatus } from './billingTypes.js';
import { billingAccountIdForUser, createFreeBillingAccount, deriveBillingState } from './entitlements.js';
import { findPlanByStripePriceId } from './planCatalog.js';

export const unresolvedBillingAccountId = 'unresolved';

export function billingAccountRef(db: FirebaseFirestore.Firestore, billingAccountId: string) {
  return db.doc(`billingAccounts/${billingAccountId}`);
}

export function billingEventRef(db: FirebaseFirestore.Firestore, billingAccountId: string, eventId: string) {
  return billingAccountRef(db, billingAccountId).collection('billingEvents').doc(eventId);
}

export async function getOrCreateBillingAccountForUser(
  db: FirebaseFirestore.Firestore,
  userId: string,
  initialCustomerId?: string
): Promise<BillingAccount> {
  const id = billingAccountIdForUser(userId);
  const ref = billingAccountRef(db, id);
  const snapshot = await ref.get();
  const now = FieldValue.serverTimestamp();

  if (snapshot.exists) {
    const existing = snapshot.data() as BillingAccount;
    if (initialCustomerId && !existing.stripeCustomerId) {
      await ref.set({ stripeCustomerId: initialCustomerId, updatedAt: now }, { merge: true });
      return { ...existing, stripeCustomerId: initialCustomerId };
    }

    return existing;
  }

  const account = createFreeBillingAccount(userId);
  await ref.set({
    ...account,
    stripeCustomerId: initialCustomerId,
    createdAt: now,
    updatedAt: now
  });

  return { ...account, stripeCustomerId: initialCustomerId };
}

export async function resolveBillingAccountIdForStripeEvent(db: FirebaseFirestore.Firestore, payload: PersistedStripePayload) {
  const fromMetadata = payload.metadata.billingAccountId;

  if (fromMetadata) {
    return fromMetadata;
  }

  if (payload.customerId) {
    const byCustomer = await db.collection('billingAccounts').where('stripeCustomerId', '==', payload.customerId).limit(1).get();

    if (!byCustomer.empty) {
      return byCustomer.docs[0].id;
    }
  }

  return unresolvedBillingAccountId;
}

export async function createBillingEventOnce(
  db: FirebaseFirestore.Firestore,
  event: Stripe.Event,
  payload: PersistedStripePayload
) {
  const billingAccountId = await resolveBillingAccountIdForStripeEvent(db, payload);
  const ref = billingEventRef(db, billingAccountId, event.id);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);

    if (snapshot.exists) {
      return;
    }

    const billingEvent: BillingEvent = {
      stripeEventId: event.id,
      type: event.type,
      status: 'received',
      attempts: 0,
      billingAccountId,
      objectId: payload.id,
      objectType: payload.object,
      stripeCreatedAt: Timestamp.fromMillis(event.created * 1000),
      receivedAt: FieldValue.serverTimestamp(),
      payload
    };

    transaction.set(ref, billingEvent);
  });

  return { billingAccountId, eventId: event.id };
}

export function stripeStatusToSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === 'trialing' || status === 'active' || status === 'past_due' || status === 'paused' || status === 'canceled') {
    return status === 'canceled' ? 'cancelled' : status;
  }

  return status === 'incomplete_expired' || status === 'unpaid' ? 'expired' : 'past_due';
}

function readSubscriptionPeriod(subscription: Stripe.Subscription) {
  const periodStart = subscription.items.data[0]?.current_period_start;
  const periodEnd = subscription.items.data[0]?.current_period_end;

  return {
    currentPeriodStart: periodStart ? Timestamp.fromMillis(periodStart * 1000) : undefined,
    currentPeriodEnd: periodEnd ? Timestamp.fromMillis(periodEnd * 1000) : undefined
  };
}

export async function syncSubscriptionFromStripe(db: FirebaseFirestore.Firestore, subscription: Stripe.Subscription) {
  const billingAccountId = subscription.metadata.billingAccountId;
  const userId = subscription.metadata.userId;
  const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const priceId = subscription.items.data[0]?.price.id;

  if (!billingAccountId || !userId || !priceId) {
    throw new Error('Stripe subscription sem metadata obrigatoria.');
  }

  const plan = await findPlanByStripePriceId(db, priceId);
  const planId = (plan?.id ?? subscription.metadata.planId ?? 'free') as PlanId;
  const status = stripeStatusToSubscriptionStatus(subscription.status);
  const state = deriveBillingState(planId, status);
  const periods = readSubscriptionPeriod(subscription);
  const now = FieldValue.serverTimestamp();
  const accountRef = billingAccountRef(db, billingAccountId);
  const subscriptionRef = accountRef.collection('subscriptions').doc(subscription.id);
  const record: SubscriptionRecord = {
    id: subscription.id,
    billingAccountId,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId,
    planId,
    stripePriceId: priceId,
    status,
    currentPeriodStart: periods.currentPeriodStart,
    currentPeriodEnd: periods.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    updatedAt: now
  };

  await db.runTransaction(async (transaction) => {
    transaction.set(
      accountRef,
      {
        id: billingAccountId,
        ownerUserId: userId,
        stripeCustomerId,
        currentPlanId: state.currentPlanId,
        subscriptionStatus: state.subscriptionStatus,
        currentSubscriptionId: subscription.id,
        currentPeriodEnd: periods.currentPeriodEnd,
        entitlements: state.entitlements,
        updatedAt: now
      },
      { merge: true }
    );
    transaction.set(subscriptionRef, record, { merge: true });
  });

  return record;
}

