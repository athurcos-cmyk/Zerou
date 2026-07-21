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

  it('defaults to resend provider and fails gracefully without API key', async () => {
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;

    await expect(sendOperationalEmail({ kind: 'welcome', to: 'user@zerou.test' })).resolves.toMatchObject({
      sent: false,
      provider: 'resend'
    });
  });

  it('returns disabled when EMAIL_PROVIDER=disabled', async () => {
    process.env.EMAIL_PROVIDER = 'disabled';

    await expect(sendOperationalEmail({ kind: 'welcome', to: 'user@zerou.test' })).resolves.toMatchObject({
      sent: false,
      provider: null
    });
  });
});
