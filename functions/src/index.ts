import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest, type CallableRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { createCheckoutSessionSchema, createCustomerPortalSessionSchema } from './billing/schemas.js';
import { createCheckoutSessionWithStripe, createCustomerPortalSessionWithStripe, createStripeClient, ingestStripeWebhookEvent } from './billing/stripeBillingProvider.js';
import { processBillingEventDocument, resetStuckBillingEvents, retryFailedBillingEvents as retryFailedBillingEventDocs } from './billing/billingEventProcessor.js';
import { safeReturnUrl } from './billing/urlSafety.js';

// ─── Automação server-side ────────────────────────────────────────────────────
export { closeInvoicesDue, generateRecurrences, sendDueReminders, sendDailyLogReminder } from './automation.js';
export { sendBudgetAlerts } from './budgetAlerts.js';

// ─── Assistente de IA ─────────────────────────────────────────────────────────
export { financialAssistantChat } from './ai/financialAssistant.js';

// ─── WhatsApp ─────────────────────────────────────────────────────────────────
export { whatsappWebhook } from './whatsapp/webhookHandler.js';
export { generateWhatsappLinkCode } from './whatsapp/linkAccount.js';
export { unlinkWhatsapp } from './whatsapp/unlinkWhatsapp.js';

// ─── Cartões: totais de fatura mantidos incrementalmente ──────────────────────
export { onInvoiceLedgerEntryCreated } from './cards/invoiceLedgerEntryTrigger.js';
export { reverseCardPurchaseOnDelete } from './cards/reverseCardPurchaseOnDelete.js';

// ─── Emails transacionais (Resend) ──────────────────────────────────────────────
export { onUserCreated, send3DayFollowUp, sendGoodbyeEmail } from './email/triggers.js';

// ─── Admin ────────────────────────────────────────────────────────────────────
// adminDeleteUser NÃO fica aqui — vive isolado em functions-admin/ (codebase
// "admin"), sem dependência do Stripe, pra poder deployar independente do
// codebase "billing". Ver firebase.json. Não recriar aqui — isso já causou um
// conflito de deploy ("More than one codebase claims following functions").

// ─── Billing / Stripe ─────────────────────────────────────────────────────────
// Estas functions implementam cobrança via Stripe (checkout, portal, webhooks).
// ESTÃO DESATIVADAS — o produto é gratuito hoje.
// Para ativar: configurar STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET nos secrets
// do Firebase (ver docs/BILLING.md), deployar as functions abaixo e ligar o
// webhook no painel do Stripe apontando para a URL da stripeWebhook.
// ─────────────────────────────────────────────────────────────────────────────

initializeApp();

const db = getFirestore();
const region = 'southamerica-east1';
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const appBaseUrl = defineString('APP_BASE_URL', { default: 'https://granativa.com.br' });

function assertAuthenticated(request: CallableRequest) {
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError('unauthenticated', 'Entre na Zerou para continuar.');
  }

  return uid;
}

function assertAppCheckIfConfigured(request: CallableRequest) {
  if (process.env.ENABLE_APP_CHECK_ENFORCEMENT === 'true' && !request.app) {
    throw new HttpsError('failed-precondition', 'App Check requerido para esta operacao.');
  }
}

function getStripeSecret() {
  const secret = process.env.STRIPE_SECRET_KEY || stripeSecretKey.value();

  if (!secret) {
    throw new HttpsError('failed-precondition', 'Cobrança indisponível no ambiente atual.');
  }

  return secret;
}

function getWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || stripeWebhookSecret.value();

  if (!secret) {
    throw new HttpsError('failed-precondition', 'Webhook Stripe indisponível neste ambiente.');
  }

  return secret;
}

function stripeDeps() {
  const stripe = createStripeClient(getStripeSecret());

  return {
    stripe,
    processorDeps: {
      retrieveSubscription: (subscriptionId: string) => stripe.subscriptions.retrieve(subscriptionId),
      now: () => FieldValue.serverTimestamp()
    }
  };
}

export const createCheckoutSession = onCall(
  {
    region,
    secrets: [stripeSecretKey],
    consumeAppCheckToken: true,
    enforceAppCheck: false,
    maxInstances: 10
  },
  async (request) => {
    const userId = assertAuthenticated(request);
    assertAppCheckIfConfigured(request);
    const input = createCheckoutSessionSchema.parse(request.data ?? {});
    const baseUrl = appBaseUrl.value();
    const { stripe } = stripeDeps();

    return createCheckoutSessionWithStripe(db, stripe, {
      userId,
      planId: input.planId,
      billingInterval: input.billingInterval,
      clientRequestId: input.clientRequestId,
      successUrl: safeReturnUrl(input.successUrl, baseUrl, '/app/settings/billing?checkout=success'),
      cancelUrl: safeReturnUrl(input.cancelUrl, baseUrl, '/app/settings/billing?checkout=cancelled')
    });
  }
);

export const createCustomerPortalSession = onCall(
  {
    region,
    secrets: [stripeSecretKey],
    consumeAppCheckToken: true,
    enforceAppCheck: false,
    maxInstances: 10
  },
  async (request) => {
    const userId = assertAuthenticated(request);
    assertAppCheckIfConfigured(request);
    const input = createCustomerPortalSessionSchema.parse(request.data ?? {});
    const { stripe } = stripeDeps();

    return createCustomerPortalSessionWithStripe(
      db,
      stripe,
      userId,
      safeReturnUrl(input.returnUrl, appBaseUrl.value(), '/app/settings/billing')
    );
  }
);

export const stripeWebhook = onRequest(
  {
    region,
    secrets: [stripeSecretKey, stripeWebhookSecret],
    maxInstances: 10
  },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).send('Method not allowed');
      return;
    }

    const signature = request.header('stripe-signature');

    if (!signature) {
      response.status(400).send('Missing Stripe signature');
      return;
    }

    try {
      await ingestStripeWebhookEvent(db, createStripeClient(getStripeSecret()), request.rawBody, signature, getWebhookSecret());
      response.status(200).json({ received: true });
    } catch (error) {
      logger.warn('stripe_webhook_rejected', { message: error instanceof Error ? error.message : 'unknown' });
      response.status(400).send('Invalid Stripe webhook');
    }
  }
);

export const processBillingEvent = onDocumentCreated(
  {
    document: 'billingAccounts/{billingAccountId}/billingEvents/{eventId}',
    region,
    secrets: [stripeSecretKey],
    maxInstances: 5
  },
  async (event) => {
    const billingAccountId = event.params.billingAccountId;
    const eventId = event.params.eventId;
    const { processorDeps } = stripeDeps();

    await processBillingEventDocument(db, billingAccountId, eventId, processorDeps);
  }
);

export const retryFailedBillingEvents = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'America/Sao_Paulo',
    region,
    secrets: [stripeSecretKey],
    maxInstances: 1
  },
  async () => {
    const { processorDeps } = stripeDeps();
    const stuck = await resetStuckBillingEvents(db, new Date(Date.now() - 10 * 60 * 1000));
    const retried = await retryFailedBillingEventDocs(db, processorDeps);

    logger.info('billing_retry_finished', { stuck, retried: retried.length });
  }
);
