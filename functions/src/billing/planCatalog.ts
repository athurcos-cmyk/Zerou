import type { Entitlements, PlanCatalogItem, PlanId, SubscriptionStatus } from './billingTypes.js';

export const planIds = ['free', 'duo', 'premium'] as const satisfies readonly PlanId[];
export const paidPlanIds = ['duo', 'premium'] as const satisfies readonly Exclude<PlanId, 'free'>[];

export const freeEntitlements: Entitlements = {
  canCreateCoupleWorkspace: true,
  canUseAdvancedReports: false,
  canUseAutomationRules: false,
  canImportStatements: false,
  canExportXlsx: false,
  canExportPdf: false,
  canUploadReceipts: false,
  canUseOcr: false,
  canUseAdvancedReconciliation: false,
  maxTransactionsPerMonth: 10000,
  maxReceiptStorageMb: 0,
  maxAutomationRules: 0
};

export const duoEntitlements: Entitlements = {
  ...freeEntitlements,
  canCreateCoupleWorkspace: true,
  canExportPdf: true,
  maxTransactionsPerMonth: 2000
};

export const premiumEntitlements: Entitlements = {
  canCreateCoupleWorkspace: true,
  canUseAdvancedReports: true,
  canUseAutomationRules: true,
  canImportStatements: true,
  canExportXlsx: true,
  canExportPdf: true,
  canUploadReceipts: true,
  canUseOcr: false,
  canUseAdvancedReconciliation: true,
  maxTransactionsPerMonth: 10000,
  maxReceiptStorageMb: 512,
  maxAutomationRules: 20
};

export const defaultPlanCatalog: Record<PlanId, Omit<PlanCatalogItem, 'updatedAt'>> = {
  free: {
    id: 'free',
    name: 'Gratuito',
    description: 'Acesso gratuito ao app Zerou enquanto o produto amadurece.',
    active: true,
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    entitlements: freeEntitlements
  },
  duo: {
    id: 'duo',
    name: 'Duo',
    description: 'Espaco compartilhado incluso no acesso gratuito atual.',
    active: false,
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    entitlements: duoEntitlements
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    description: 'Recursos avancados ficam reservados para uma decisao futura de produto.',
    active: false,
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    entitlements: premiumEntitlements
  }
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && planIds.includes(value as PlanId);
}

export function isPaidPlanId(value: unknown): value is Exclude<PlanId, 'free'> {
  return typeof value === 'string' && paidPlanIds.includes(value as Exclude<PlanId, 'free'>);
}

export function entitlementsForPlan(planId: PlanId, status: SubscriptionStatus = 'active') {
  if (planId === 'free' || !['active', 'trialing'].includes(status)) {
    return freeEntitlements;
  }

  return planId === 'duo' ? duoEntitlements : premiumEntitlements;
}

export async function getPlanCatalogItem(db: FirebaseFirestore.Firestore, planId: PlanId) {
  const snapshot = await db.doc(`planCatalog/${planId}`).get();

  if (!snapshot.exists) {
    return defaultPlanCatalog[planId];
  }

  return { ...defaultPlanCatalog[planId], ...snapshot.data(), id: planId } as PlanCatalogItem;
}

export async function findPlanByStripePriceId(db: FirebaseFirestore.Firestore, priceId: string) {
  const catalog = await Promise.all(planIds.map((planId) => getPlanCatalogItem(db, planId)));

  return catalog.find((item) => item.stripeMonthlyPriceId === priceId || item.stripeAnnualPriceId === priceId) ?? null;
}
