import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

initializeApp();

const db = getFirestore();

function centsFromEnv(name) {
  const value = process.env[name];
  const parsed = value ? Number.parseInt(value, 10) : 0;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

const freeEntitlements = {
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

const duoEntitlements = {
  ...freeEntitlements,
  canCreateCoupleWorkspace: true,
  canExportPdf: true,
  maxTransactionsPerMonth: 2000
};

const premiumEntitlements = {
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

const plans = [
  {
    id: 'free',
    name: 'Gratuito',
    description: 'Acesso gratuito ao app Zerou enquanto o produto amadurece.',
    active: true,
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    entitlements: freeEntitlements
  },
  {
    id: 'duo',
    name: 'Duo',
    description: 'Espaco compartilhado incluso no acesso gratuito atual.',
    active: false,
    monthlyPriceCents: centsFromEnv('ZEROU_DUO_MONTHLY_PRICE_CENTS'),
    annualPriceCents: centsFromEnv('ZEROU_DUO_ANNUAL_PRICE_CENTS'),
    stripeMonthlyPriceId: process.env.STRIPE_PRICE_DUO_MONTHLY || '',
    stripeAnnualPriceId: process.env.STRIPE_PRICE_DUO_ANNUAL || '',
    entitlements: duoEntitlements
  },
  {
    id: 'premium',
    name: 'Premium',
    description: 'Recursos avancados ficam reservados para uma decisao futura de produto.',
    active: false,
    monthlyPriceCents: centsFromEnv('ZEROU_PREMIUM_MONTHLY_PRICE_CENTS'),
    annualPriceCents: centsFromEnv('ZEROU_PREMIUM_ANNUAL_PRICE_CENTS'),
    stripeMonthlyPriceId: process.env.STRIPE_PRICE_PREMIUM_MONTHLY || '',
    stripeAnnualPriceId: process.env.STRIPE_PRICE_PREMIUM_ANNUAL || '',
    entitlements: premiumEntitlements
  }
];

const batch = db.batch();

for (const plan of plans) {
  batch.set(db.doc(`planCatalog/${plan.id}`), { ...plan, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

await batch.commit();
console.log(`Seeded ${plans.length} Zerou planCatalog documents.`);
