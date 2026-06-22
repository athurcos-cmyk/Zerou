import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseDb, getFirebaseFunctions } from '../firebase/config';
import type { BillingAccount, BillingInterval, Entitlements, PlanCatalogItem, PlanId } from '../types/contracts';

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

export const defaultPlanCatalog: PlanCatalogItem[] = [
  {
    id: 'free',
    name: 'Gratuito',
    description: 'Acesso gratuito ao app Granativa enquanto o produto amadurece.',
    active: true,
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    entitlements: freeEntitlements
  },
  {
    id: 'duo',
    name: 'Duo',
    description: 'Espaço compartilhado incluso no acesso gratuito atual.',
    active: false,
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    entitlements: { ...freeEntitlements, canCreateCoupleWorkspace: true, canExportPdf: true, maxTransactionsPerMonth: 2000 }
  },
  {
    id: 'premium',
    name: 'Premium',
    description: 'Recursos avançados ficam reservados para uma decisão futura de produto.',
    active: false,
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    entitlements: {
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
    }
  }
];

export function billingAccountIdForUser(userId: string) {
  return `billing_${userId}`;
}

export function freeBillingAccountForUser(userId: string): BillingAccount {
  return {
    id: billingAccountIdForUser(userId),
    ownerUserId: userId,
    currentPlanId: 'free',
    subscriptionStatus: 'free',
    entitlements: freeEntitlements
  };
}

export function subscribePlanCatalog(onNext: (plans: PlanCatalogItem[]) => void, onError?: (error: Error) => void): Unsubscribe {
  const unsubscribers = defaultPlanCatalog.map((fallbackPlan) =>
    onSnapshot(
      doc(getFirebaseDb(), 'planCatalog', fallbackPlan.id),
      (snapshot) => {
        const current = new Map(defaultPlanCatalog.map((item) => [item.id, item]));

        if (snapshot.exists()) {
          const data = snapshot.data() as PlanCatalogItem;
          current.set(fallbackPlan.id, { ...fallbackPlan, ...data, id: fallbackPlan.id });
        }

        onNext([...current.values()]);
      },
      (error) => onError?.(error)
    )
  );

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

export function subscribeBillingAccount(userId: string, onNext: (account: BillingAccount) => void, onError?: (error: Error) => void) {
  return onSnapshot(
    doc(getFirebaseDb(), 'billingAccounts', billingAccountIdForUser(userId)),
    (snapshot) => {
      if (!snapshot.exists()) {
        onNext(freeBillingAccountForUser(userId));
        return;
      }

      const remoteAccount = snapshot.data() as Partial<BillingAccount>;
      const mergedAccount = { ...freeBillingAccountForUser(userId), ...remoteAccount, id: snapshot.id } as BillingAccount;
      const launchEntitlements =
        mergedAccount.currentPlanId === 'free' || mergedAccount.subscriptionStatus === 'free'
          ? freeEntitlements
          : { ...freeEntitlements, ...remoteAccount.entitlements };

      onNext({ ...mergedAccount, entitlements: launchEntitlements });
    },
    (error) => onError?.(error)
  );
}

export async function getBillingEntitlementsForUser(userId: string) {
  const snapshot = await new Promise<BillingAccount>((resolve, reject) => {
    const unsubscribe = subscribeBillingAccount(
      userId,
      (account) => {
        unsubscribe();
        resolve(account);
      },
      reject
    );
  });

  return snapshot.entitlements;
}

export async function createCheckoutSession(planId: Exclude<PlanId, 'free'>, billingInterval: BillingInterval) {
  const clientRequestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
  const callable = httpsCallable<
    {
      planId: Exclude<PlanId, 'free'>;
      billingInterval: BillingInterval;
      successUrl: string;
      cancelUrl: string;
      clientRequestId: string;
    },
    { url: string }
  >(getFirebaseFunctions(), 'createCheckoutSession');
  const origin = window.location.origin;
  const response = await callable({
    planId,
    billingInterval,
    successUrl: `${origin}/app/settings/billing?checkout=success`,
    cancelUrl: `${origin}/app/settings/billing?checkout=cancelled`,
    clientRequestId
  });

  return response.data.url;
}

export async function createCustomerPortalSession() {
  const callable = httpsCallable<{ returnUrl: string }, { url: string }>(getFirebaseFunctions(), 'createCustomerPortalSession');
  const response = await callable({ returnUrl: `${window.location.origin}/app/settings/billing` });

  return response.data.url;
}
