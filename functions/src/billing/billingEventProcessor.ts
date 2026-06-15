import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { BillingEvent, BillingEventProcessorDeps } from './billingTypes.js';
import { billingEventRef, syncSubscriptionFromStripe } from './billingRepository.js';
import { redactError } from './errors.js';

export const supportedBillingEventTypes = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required'
]);

export async function claimBillingEvent(db: FirebaseFirestore.Firestore, billingAccountId: string, eventId: string) {
  const ref = billingEventRef(db, billingAccountId, eventId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);

    if (!snapshot.exists) {
      return null;
    }

    const event = snapshot.data() as BillingEvent;

    if (!['received', 'failed'].includes(event.status)) {
      return null;
    }

    transaction.update(ref, {
      status: 'processing',
      attempts: (event.attempts ?? 0) + 1,
      processingStartedAt: FieldValue.serverTimestamp(),
      lastErrorCode: FieldValue.delete(),
      lastErrorMessageRedacted: FieldValue.delete()
    });

    return event;
  });
}

async function processSupportedEvent(db: FirebaseFirestore.Firestore, event: BillingEvent, deps: BillingEventProcessorDeps) {
  const subscriptionId = event.payload.subscriptionId;

  if (!subscriptionId) {
    return 'ignored' as const;
  }

  const subscription = await deps.retrieveSubscription(subscriptionId);
  await syncSubscriptionFromStripe(db, subscription);
  return 'processed' as const;
}

export async function processBillingEventDocument(
  db: FirebaseFirestore.Firestore,
  billingAccountId: string,
  eventId: string,
  deps: BillingEventProcessorDeps
) {
  const event = await claimBillingEvent(db, billingAccountId, eventId);
  const ref = billingEventRef(db, billingAccountId, eventId);

  if (!event) {
    return 'skipped' as const;
  }

  try {
    const nextStatus = supportedBillingEventTypes.has(event.type) ? await processSupportedEvent(db, event, deps) : 'ignored';
    await ref.update({
      status: nextStatus,
      processedAt: deps.now(),
      updatedAt: deps.now()
    });

    return nextStatus;
  } catch (error) {
    const redacted = redactError(error);
    await ref.update({
      status: 'failed',
      updatedAt: deps.now(),
      lastErrorCode: redacted.code,
      lastErrorMessageRedacted: redacted.message
    });

    return 'failed' as const;
  }
}

export async function resetStuckBillingEvents(db: FirebaseFirestore.Firestore, olderThan: Date) {
  const stuck = await db
    .collectionGroup('billingEvents')
    .where('status', '==', 'processing')
    .where('processingStartedAt', '<', Timestamp.fromDate(olderThan))
    .limit(25)
    .get();
  const batch = db.batch();

  stuck.docs.forEach((snapshot) => {
    batch.update(snapshot.ref, {
      status: 'failed',
      lastErrorCode: 'processing_timeout',
      lastErrorMessageRedacted: 'Evento voltou para retry apos exceder janela de processamento.',
      updatedAt: FieldValue.serverTimestamp()
    });
  });

  await batch.commit();
  return stuck.size;
}

export async function retryFailedBillingEvents(db: FirebaseFirestore.Firestore, deps: BillingEventProcessorDeps) {
  const failed = await db.collectionGroup('billingEvents').where('status', '==', 'failed').where('attempts', '<', 5).limit(25).get();
  const results: string[] = [];

  for (const snapshot of failed.docs) {
    const billingAccountId = snapshot.ref.parent.parent?.id;

    if (billingAccountId) {
      const eventId = snapshot.id;
      results.push(await processBillingEventDocument(db, billingAccountId, eventId, deps));
    }
  }

  return results;
}

