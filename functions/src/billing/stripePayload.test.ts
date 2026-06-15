import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { sanitizeStripeObject } from './stripePayload.js';

describe('sanitizeStripeObject', () => {
  it('keeps only billing metadata needed for checkout processing', () => {
    const event = {
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      created: 123,
      data: {
        object: {
          id: 'cs_test',
          object: 'checkout.session',
          customer: 'cus_test',
          subscription: 'sub_test',
          customer_details: { email: 'private@example.com' },
          metadata: {
            userId: 'user_a',
            billingAccountId: 'billing_user_a',
            planId: 'duo'
          }
        }
      }
    } as unknown as Stripe.Event;

    expect(sanitizeStripeObject(event)).toEqual({
      id: 'cs_test',
      object: 'checkout.session',
      customerId: 'cus_test',
      subscriptionId: 'sub_test',
      priceId: undefined,
      status: undefined,
      metadata: {
        userId: 'user_a',
        billingAccountId: 'billing_user_a',
        planId: 'duo'
      },
      currentPeriodStart: undefined,
      currentPeriodEnd: undefined,
      cancelAtPeriodEnd: undefined
    });
  });

  it('reads subscription metadata from invoice parent details', () => {
    const event = {
      id: 'evt_invoice',
      type: 'invoice.paid',
      created: 123,
      data: {
        object: {
          id: 'in_test',
          object: 'invoice',
          customer: 'cus_test',
          parent: {
            subscription_details: {
              subscription: 'sub_test',
              metadata: {
                userId: 'user_a',
                billingAccountId: 'billing_user_a'
              }
            }
          }
        }
      }
    } as unknown as Stripe.Event;

    const payload = sanitizeStripeObject(event);

    expect(payload.subscriptionId).toBe('sub_test');
    expect(payload.metadata.billingAccountId).toBe('billing_user_a');
  });
});

