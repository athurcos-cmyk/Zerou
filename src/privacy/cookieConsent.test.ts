import { beforeEach, describe, expect, it } from 'vitest';
import { COOKIE_CONSENT_STORAGE_KEY, hasAnalyticsConsent, readCookieConsent, saveCookieConsent } from './cookieConsent';

describe('cookie consent', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('does not grant analytics before explicit consent', () => {
    expect(readCookieConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('persists optional consent choices', () => {
    const consent = saveCookieConsent({ preferences: true, analytics: true, marketing: false });

    expect(consent.analytics).toBe(true);
    expect(readCookieConsent()?.marketing).toBe(false);
    expect(hasAnalyticsConsent()).toBe(true);
  });

  it('ignores outdated or invalid consent records', () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify({ version: 'old', necessary: true, analytics: true }));

    expect(hasAnalyticsConsent()).toBe(false);
  });
});
