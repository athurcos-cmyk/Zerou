import type Stripe from 'stripe';
import type { PersistedStripePayload } from './billingTypes.js';

function metadataFrom(value: unknown) {
  return value && typeof value === 'object' && 'metadata' in value && value.metadata && typeof value.metadata === 'object'
    ? { ...(value.metadata as Record<string, string>) }
    : {};
}

function stringFrom(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function customerIdFrom(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object' && 'id' in value) {
    return stringFrom((value as { id?: unknown }).id);
  }

  return undefined;
}

export function sanitizeStripeObject(event: Stripe.Event): PersistedStripePayload {
  const object = event.data.object as unknown as Record<string, unknown>;
  const metadata = metadataFrom(object);
  const items = object.items as { data?: Array<{ price?: { id?: string }; current_period_start?: number; current_period_end?: number }> } | undefined;
  const firstItem = items?.data?.[0];
  const parent = object.parent as { subscription_details?: { subscription?: string; metadata?: Record<string, string> } } | undefined;
  const subscriptionDetails = parent?.subscription_details;
  const mergedMetadata = { ...(subscriptionDetails?.metadata ?? {}), ...metadata };

  return {
    id: String(object.id ?? event.id),
    object: String(object.object ?? 'unknown'),
    customerId: customerIdFrom(object.customer),
    subscriptionId:
      stringFrom(object.subscription) ??
      stringFrom(subscriptionDetails?.subscription) ??
      stringFrom((object as { subscription_details?: { subscription?: unknown } }).subscription_details?.subscription),
    priceId: stringFrom(firstItem?.price?.id),
    status: stringFrom(object.status),
    metadata: mergedMetadata,
    currentPeriodStart: firstItem?.current_period_start,
    currentPeriodEnd: firstItem?.current_period_end,
    cancelAtPeriodEnd: typeof object.cancel_at_period_end === 'boolean' ? object.cancel_at_period_end : undefined
  };
}
