import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

describe('Stripe webhook signature verification', () => {
  const stripe = new Stripe('sk_test_123');
  const secret = 'whsec_test_secret';
  const payload = JSON.stringify({
    id: 'evt_test',
    object: 'event',
    type: 'checkout.session.completed',
    created: 1710000000,
    data: {
      object: {
        id: 'cs_test',
        object: 'checkout.session',
        customer: 'cus_test',
        subscription: 'sub_test',
        metadata: {
          billingAccountId: 'billing_user_a',
          userId: 'user_a',
          planId: 'duo'
        }
      }
    }
  });

  it('accepts a valid signed payload', () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const event = stripe.webhooks.constructEvent(Buffer.from(payload), header, secret);

    expect(event.id).toBe('evt_test');
  });

  it('rejects an invalid signature', () => {
    expect(() => stripe.webhooks.constructEvent(Buffer.from(payload), 't=123,v1=invalid', secret)).toThrow();
  });
});

