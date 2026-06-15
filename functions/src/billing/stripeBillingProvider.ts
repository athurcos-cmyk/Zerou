import Stripe from 'stripe';
import { HttpsError } from 'firebase-functions/v2/https';
import type { CreateCheckoutInput } from './billingTypes.js';
import { billingAccountIdForUser, getEntitlementsForUser } from './entitlements.js';
import { createBillingEventOnce, getOrCreateBillingAccountForUser } from './billingRepository.js';
import { getPlanCatalogItem } from './planCatalog.js';
import { sanitizeStripeObject } from './stripePayload.js';

export function createStripeClient(secretKey: string) {
  return new Stripe(secretKey);
}

export async function createCheckoutSessionWithStripe(
  db: FirebaseFirestore.Firestore,
  stripe: Stripe,
  input: CreateCheckoutInput
) {
  const plan = await getPlanCatalogItem(db, input.planId);
  const priceId = input.billingInterval === 'monthly' ? plan.stripeMonthlyPriceId : plan.stripeAnnualPriceId;

  if (!plan.active || !priceId) {
    throw new HttpsError('failed-precondition', 'Cobrança indisponível no ambiente atual.');
  }

  const existingAccount = await getOrCreateBillingAccountForUser(db, input.userId);
  const customerId =
    existingAccount.stripeCustomerId ??
    (
      await stripe.customers.create(
        {
          metadata: {
            userId: input.userId,
            billingAccountId: billingAccountIdForUser(input.userId)
          }
        },
        { idempotencyKey: `customer:${input.userId}` }
      )
    ).id;

  await getOrCreateBillingAccountForUser(db, input.userId, customerId);

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      customer: customerId,
      client_reference_id: input.userId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        userId: input.userId,
        billingAccountId: billingAccountIdForUser(input.userId),
        planId: input.planId,
        billingInterval: input.billingInterval
      },
      subscription_data: {
        metadata: {
          userId: input.userId,
          billingAccountId: billingAccountIdForUser(input.userId),
          planId: input.planId,
          billingInterval: input.billingInterval
        }
      },
      allow_promotion_codes: false
    },
    { idempotencyKey: `checkout:${input.userId}:${input.clientRequestId}` }
  );

  if (!session.url) {
    throw new HttpsError('internal', 'A Stripe não retornou URL de checkout.');
  }

  return { url: session.url };
}

export async function createCustomerPortalSessionWithStripe(
  db: FirebaseFirestore.Firestore,
  stripe: Stripe,
  userId: string,
  returnUrl: string
) {
  const entitlements = await getEntitlementsForUser(db, userId);
  void entitlements;

  const account = await getOrCreateBillingAccountForUser(db, userId);

  if (!account.stripeCustomerId) {
    throw new HttpsError('failed-precondition', 'Nenhum customer Stripe encontrado para esta conta Zerou.');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: account.stripeCustomerId,
    return_url: returnUrl
  });

  return { url: session.url };
}

export async function ingestStripeWebhookEvent(db: FirebaseFirestore.Firestore, stripe: Stripe, rawBody: Buffer, signature: string, webhookSecret: string) {
  const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  const payload = sanitizeStripeObject(event);

  await createBillingEventOnce(db, event, payload);
}
