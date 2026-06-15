export const COOKIE_CONSENT_VERSION = 'zerou-cookie-v1';
export const COOKIE_CONSENT_STORAGE_KEY = 'zerou.cookieConsent.v1';
export const OPEN_COOKIE_PREFERENCES_EVENT = 'zerou:open-cookie-preferences';

export interface CookieConsentPreferences {
  version: typeof COOKIE_CONSENT_VERSION;
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
}

export function defaultCookieConsent(): CookieConsentPreferences {
  return {
    version: COOKIE_CONSENT_VERSION,
    necessary: true,
    preferences: false,
    analytics: false,
    marketing: false,
    updatedAt: new Date(0).toISOString()
  };
}

export function readCookieConsent(): CookieConsentPreferences | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<CookieConsentPreferences>;

    if (parsed.version !== COOKIE_CONSENT_VERSION || parsed.necessary !== true) {
      return null;
    }

    return {
      version: COOKIE_CONSENT_VERSION,
      necessary: true,
      preferences: Boolean(parsed.preferences),
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString()
    };
  } catch {
    return null;
  }
}

export function saveCookieConsent(
  input: Pick<CookieConsentPreferences, 'preferences' | 'analytics' | 'marketing'>
): CookieConsentPreferences {
  const nextConsent: CookieConsentPreferences = {
    version: COOKIE_CONSENT_VERSION,
    necessary: true,
    preferences: input.preferences,
    analytics: input.analytics,
    marketing: input.marketing,
    updatedAt: new Date().toISOString()
  };

  window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(nextConsent));
  window.dispatchEvent(new CustomEvent('zerou:cookie-consent-updated', { detail: nextConsent }));

  return nextConsent;
}

export function hasAnalyticsConsent() {
  return readCookieConsent()?.analytics === true;
}

export function openCookiePreferences() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OPEN_COOKIE_PREFERENCES_EVENT));
  }
}
