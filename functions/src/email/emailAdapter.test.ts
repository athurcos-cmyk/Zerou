import { describe, expect, it } from 'vitest';
import { emailTemplates, sendOperationalEmail } from './emailAdapter.js';

describe('email adapter', () => {
  it('declares the required transactional templates', () => {
    expect(Object.keys(emailTemplates).sort()).toEqual([
      'billing_failed',
      'cancellation',
      'invite',
      'privacy_request',
      'security',
      'welcome'
    ]);
  });

  it('does not fake-send when no provider is configured', async () => {
    delete process.env.EMAIL_PROVIDER;

    await expect(sendOperationalEmail({ kind: 'welcome', to: 'user@zerou.test' })).resolves.toMatchObject({
      sent: false,
      provider: null
    });
  });
});
