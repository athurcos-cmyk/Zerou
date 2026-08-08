import { initializeApp } from 'firebase-admin/app';

// ─── Automação server-side ────────────────────────────────────────────────────
export { closeInvoicesDue, generateRecurrences, sendDueReminders, sendDailyLogReminder } from './automation.js';
// `sendBudgetAlerts` foi REMOVIDA em 06/08/2026 (decisão do dono) junto com o banner de
// orçamento do Dashboard: as duas contavam compra parcelada no cartão pelo VALOR CHEIO no mês
// da compra, discordando da Análise (que conta por parcela desde a ancoragem de 05/08). Notificar
// "estourou 196%" quando a tela mostra 49% é pior que não notificar. Orçamento agora vive só na
// Análise, que é a única tela que carrega o ledger da fatura e aplica a regra certa.
// Pra ressuscitar o push: o cálculo tem que ler o ledger, não só as transações do mês —
// ver `docs/history/2026-08.md` (06/08) e `docs/planning/TODOS.md`.

// ─── Assistente de IA ─────────────────────────────────────────────────────────
export { financialAssistantChat } from './ai/financialAssistant.js';

// ─── WhatsApp ─────────────────────────────────────────────────────────────────
export { whatsappWebhook } from './whatsapp/webhookHandler.js';
export { generateWhatsappLinkCode } from './whatsapp/linkAccount.js';
export { unlinkWhatsapp } from './whatsapp/unlinkWhatsapp.js';

// ─── Cartões: totais de fatura mantidos incrementalmente ──────────────────────
export { onInvoiceLedgerEntryCreated } from './cards/invoiceLedgerEntryTrigger.js';
export { reverseCardPurchaseOnDelete } from './cards/reverseCardPurchaseOnDelete.js';

// ─── Emails transacionais (Resend) ──────────────────────────────────────────────
export { onUserCreated, send3DayFollowUp, sendGoodbyeEmail } from './email/triggers.js';

// ─── Auth ────────────────────────────────────────────────────────────────────
export { forceLogoutAllDevices } from './forceLogoutAllDevices.js';

// ─── Casal ───────────────────────────────────────────────────────────────────
export { cancelCoupleWorkspace } from './cancelCoupleWorkspace.js';

// ─── Limpeza automática ───────────────────────────────────────────────────────
export { dailyCleanup } from './cleanup.js';

// ─── Admin: mensagens (push/email) individual e broadcast ────────────────────
export { adminSendMessage, adminBroadcastMessage } from './admin/adminMessaging.js';

// ─── Admin ────────────────────────────────────────────────────────────────────
// adminDeleteUser NÃO fica aqui — vive isolado em functions-admin/ (codebase
// "admin"), sem dependência do Stripe, pra poder deployar independente do
// codebase "billing". Ver firebase.json. Não recriar aqui — isso já causou um
// conflito de deploy ("More than one codebase claims following functions").

// ─── Billing / Stripe ─────────────────────────────────────────────────────────
// REMOVIDO em 08/08/2026 (decisão do dono). Eram 5 functions (createCheckoutSession,
// createCustomerPortalSession, stripeWebhook, processBillingEvent e o
// retryFailedBillingEvents agendado a cada 15 min) + todo o `src/billing/`, escritas
// antes de existir qualquer decisão de preço. O produto é gratuito e não vende nada.
// O código inteiro está na tag `billing-stripe-v0` — recuperar com:
//   git checkout billing-stripe-v0 -- functions/src/billing functions/src/index.ts
// As regras do Firestore (`billingAccounts`, `planCatalog`) FICARAM: já liberam por
// padrão quando não existe documento, que é o caso de todo mundo hoje.
// Ver docs/BILLING.md — as decisões continuam documentadas lá, só o código saiu.
// ─────────────────────────────────────────────────────────────────────────────

initializeApp();
