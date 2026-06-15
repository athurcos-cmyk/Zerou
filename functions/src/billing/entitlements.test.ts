import { describe, expect, it } from 'vitest';
import { assertEntitlement, deriveBillingState } from './entitlements.js';
import { entitlementsForPlan } from './planCatalog.js';

describe('billing entitlements', () => {
  it('blocks couple workspace for free plan', () => {
    expect(entitlementsForPlan('free', 'free').canCreateCoupleWorkspace).toBe(false);
  });

  it('allows couple workspace for active Duo', () => {
    expect(entitlementsForPlan('duo', 'active').canCreateCoupleWorkspace).toBe(true);
  });

  it('does not grant premium personal features to non-active subscriptions', () => {
    const state = deriveBillingState('premium', 'past_due');

    expect(state.currentPlanId).toBe('free');
    expect(state.entitlements.canUseAdvancedReports).toBe(false);
  });

  it('throws when asserting a missing entitlement', () => {
    expect(() => assertEntitlement(entitlementsForPlan('free', 'free'), 'canExportPdf')).toThrow(/Entitlement insuficiente/);
  });
});

