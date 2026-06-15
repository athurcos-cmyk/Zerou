import type { BillingAccount, Entitlements, PlanId, SubscriptionStatus } from './billingTypes.js';
import { entitlementsForPlan, freeEntitlements } from './planCatalog.js';

export function createFreeBillingAccount(userId: string): BillingAccount {
  return {
    id: billingAccountIdForUser(userId),
    ownerUserId: userId,
    currentPlanId: 'free',
    subscriptionStatus: 'free',
    entitlements: freeEntitlements
  };
}

export function billingAccountIdForUser(userId: string) {
  return `billing_${userId}`;
}

export function deriveBillingState(planId: PlanId, status: SubscriptionStatus) {
  return {
    currentPlanId: status === 'active' || status === 'trialing' ? planId : 'free',
    subscriptionStatus: status,
    entitlements: entitlementsForPlan(planId, status)
  };
}

export function assertEntitlement(entitlements: Entitlements, key: keyof Entitlements) {
  if (!entitlements[key]) {
    throw new Error('Entitlement insuficiente para esta operacao.');
  }
}

export async function getEntitlementsForUser(db: FirebaseFirestore.Firestore, userId: string) {
  const snapshot = await db.doc(`billingAccounts/${billingAccountIdForUser(userId)}`).get();

  if (!snapshot.exists) {
    return freeEntitlements;
  }

  const data = snapshot.data() as BillingAccount;
  return data.entitlements ?? entitlementsForPlan(data.currentPlanId, data.subscriptionStatus);
}

export async function getEntitlementsForWorkspace(db: FirebaseFirestore.Firestore, workspaceId: string) {
  const snapshot = await db.doc(`workspaces/${workspaceId}`).get();

  if (!snapshot.exists) {
    return freeEntitlements;
  }

  const workspace = snapshot.data() as { ownerUserId?: string };
  return workspace.ownerUserId ? getEntitlementsForUser(db, workspace.ownerUserId) : freeEntitlements;
}

