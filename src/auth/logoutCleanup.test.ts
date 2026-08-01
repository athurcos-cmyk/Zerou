import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearAccountLocalCaches } from './logoutCleanup';

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('clearAccountLocalCaches', () => {
  it('removes all account-scoped exact keys', () => {
    window.localStorage.setItem('zerou.pushToken.v1', 'token-data');
    window.localStorage.setItem('zerou.budgetAlertsDismissed.v1', 'budget-data');
    window.localStorage.setItem('zerou.pendingInviteCode', 'invite-abc');
    window.localStorage.setItem('zerou.defaultCategoriesPrepared', '["ws1"]');

    clearAccountLocalCaches();

    expect(window.localStorage.getItem('zerou.pushToken.v1')).toBeNull();
    expect(window.localStorage.getItem('zerou.budgetAlertsDismissed.v1')).toBeNull();
    expect(window.localStorage.getItem('zerou.pendingInviteCode')).toBeNull();
    expect(window.localStorage.getItem('zerou.defaultCategoriesPrepared')).toBeNull();
  });

  it('removes dashboardViewCache keys by prefix (full and mini)', () => {
    window.localStorage.setItem('zerou.dashboardView.v2.wsA', 'full-cache');
    window.localStorage.setItem('zerou.dashboardView.v2.wsA.mini', 'mini-cache');
    window.localStorage.setItem('zerou.dashboardView.v2.wsB', 'other-ws');

    clearAccountLocalCaches();

    expect(window.localStorage.getItem('zerou.dashboardView.v2.wsA')).toBeNull();
    expect(window.localStorage.getItem('zerou.dashboardView.v2.wsA.mini')).toBeNull();
    expect(window.localStorage.getItem('zerou.dashboardView.v2.wsB')).toBeNull();
  });

  it('preserves device preferences: theme, tours, PWA, cookie consent', () => {
    window.localStorage.setItem('zerou.themeMode', 'manual');
    window.localStorage.setItem('zerou.themeId', 'noturno');
    window.localStorage.setItem('zerou.density', 'compact');
    window.localStorage.setItem('zerou.fontScale', 'sm');
    window.localStorage.setItem('zerou.reduceMotion', 'true');
    window.localStorage.setItem('zerou.welcomeTourSeen', '1');
    window.localStorage.setItem('zerou.analysisTourSeen', '1');
    window.localStorage.setItem('zerou.categoriesTourSeen', '1');
    window.localStorage.setItem('zerou.investmentsTourSeen', '1');
    window.localStorage.setItem('zerou.pwaInstallDismissed', '1');
    window.localStorage.setItem('zerou.cookieConsent.v1', 'consent');

    clearAccountLocalCaches();

    expect(window.localStorage.getItem('zerou.themeMode')).toBe('manual');
    expect(window.localStorage.getItem('zerou.themeId')).toBe('noturno');
    expect(window.localStorage.getItem('zerou.density')).toBe('compact');
    expect(window.localStorage.getItem('zerou.fontScale')).toBe('sm');
    expect(window.localStorage.getItem('zerou.reduceMotion')).toBe('true');
    expect(window.localStorage.getItem('zerou.welcomeTourSeen')).toBe('1');
    expect(window.localStorage.getItem('zerou.analysisTourSeen')).toBe('1');
    expect(window.localStorage.getItem('zerou.categoriesTourSeen')).toBe('1');
    expect(window.localStorage.getItem('zerou.investmentsTourSeen')).toBe('1');
    expect(window.localStorage.getItem('zerou.pwaInstallDismissed')).toBe('1');
    expect(window.localStorage.getItem('zerou.cookieConsent.v1')).toBe('consent');
  });

  it('preserves profileCache (managed separately by clearCachedProfiles)', () => {
    window.localStorage.setItem('zerou.auth.profileCache.v1', 'profile-data');

    clearAccountLocalCaches();

    expect(window.localStorage.getItem('zerou.auth.profileCache.v1')).toBe('profile-data');
  });

  it('preserves firestore multi-tab coordination keys', () => {
    window.localStorage.setItem('firestore_abc', 'coordination');

    clearAccountLocalCaches();

    expect(window.localStorage.getItem('firestore_abc')).toBe('coordination');
  });

  it('handles missing localStorage gracefully', () => {
    const originalLs = window.localStorage;
    vi.stubGlobal('localStorage', undefined);

    expect(() => clearAccountLocalCaches()).not.toThrow();

    vi.stubGlobal('localStorage', originalLs);
  });

  it('removes sensitive keys while preserving unrelated app keys in the same call', () => {
    window.localStorage.setItem('zerou.dashboardView.v2.wsX', 'balance-data');
    window.localStorage.setItem('zerou.pushToken.v1', 'token');
    window.localStorage.setItem('zerou.themeMode', 'system');
    window.localStorage.setItem('zerou.welcomeTourSeen', '1');
    window.localStorage.setItem('zerou.pendingInviteCode', 'code-123');

    clearAccountLocalCaches();

    // Sensitive gone
    expect(window.localStorage.getItem('zerou.dashboardView.v2.wsX')).toBeNull();
    expect(window.localStorage.getItem('zerou.pushToken.v1')).toBeNull();
    expect(window.localStorage.getItem('zerou.pendingInviteCode')).toBeNull();
    // Preserved
    expect(window.localStorage.getItem('zerou.themeMode')).toBe('system');
    expect(window.localStorage.getItem('zerou.welcomeTourSeen')).toBe('1');
  });
});
