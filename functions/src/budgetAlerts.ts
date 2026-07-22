import { getFirestore } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { sendPushToUser } from './push.js';
import { createActiveMemberCheck } from './shared/activeMember.js';

const region = 'southamerica-east1';

function nowInBRT(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

function currentYearMonth(): string {
  const d = nowInBRT();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentYear(): number {
  return nowInBRT().getFullYear();
}

function currentMonth(): number {
  return nowInBRT().getMonth() + 1;
}

function formatBRL(amountCents: number): string {
  return (amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const sendBudgetAlerts = onSchedule(
  {
    schedule: '0 10 * * *',
    timeZone: 'America/Sao_Paulo',
    region,
    maxInstances: 1,
  },
  async () => {
    const db = getFirestore();
    const isActiveMember = createActiveMemberCheck();
    const month = currentYearMonth();
    const year = currentYear();
    const mon = currentMonth();

    // Collection group query: all active budgets across all workspaces
    const budgetsSnap = await db
      .collectionGroup('budgets')
      .where('isActive', '==', true)
      .get();

    if (budgetsSnap.empty) {
      logger.info('budgetAlerts: no active budgets found');
      return;
    }

    logger.info(`budgetAlerts: checking ${budgetsSnap.size} active budgets`);

    for (const budgetDoc of budgetsSnap.docs) {
      const budget = budgetDoc.data();
      const workspaceId = budget.workspaceId as string;
      const categoryId = budget.categoryId as string;
      const limitCents = budget.limitCents as number;
      const createdBy = budget.createdBy as string;

      if (!workspaceId || !categoryId || !limitCents || !createdBy) continue;

      // Só notifica quem ainda é membro ativo do espaço: o Admin SDK ignora as regras, então
      // sem isto um ex-parceiro receberia nome de categoria e valores gastos de um espaço que
      // já não acessa (ver shared/activeMember.ts). Checar aqui, ANTES da consulta de gastos
      // do mês, também evita a leitura cara pra quem saiu.
      if (!(await isActiveMember(workspaceId, createdBy))) continue;

      // Check alert state — has this threshold been notified this month?
      const alertStateRef = db
        .collection('workspaces')
        .doc(workspaceId)
        .collection('budgetAlertState')
        .doc(categoryId);

      const alertStateDoc = await alertStateRef.get();
      const alertState = alertStateDoc.data() ?? {};

      // Reset state if month changed
      if (alertState.month !== month) {
        await alertStateRef.set({ month, notified80: false, notified100: false });
      }

      // Compute current-month spending for this category
      const startOfMonth = new Date(year, mon - 1, 1);
      const startOfNextMonth = new Date(year, mon, 1);

      const txnsSnap = await db
        .collection('workspaces')
        .doc(workspaceId)
        .collection('transactions')
        .where('categoryId', '==', categoryId)
        .where('type', 'in', ['expense', 'card_purchase'])
        .where('date', '>=', startOfMonth)
        .where('date', '<', startOfNextMonth)
        .get();

      let spentCents = 0;
      for (const txnDoc of txnsSnap.docs) {
        const txn = txnDoc.data();
        if (!txn.deletedAt) {
          spentCents += (txn.amountCents as number) ?? 0;
        }
      }

      // Also count card installment expenses in the ledger for this category
      // (approximation: we count only direct transactions; ledger entries are covered
      // by the card_purchase type which we already include above)

      const pct = limitCents > 0 ? Math.round((spentCents / limitCents) * 100) : 0;

      // Find category name for message
      const catDoc = await db
        .collection('workspaces')
        .doc(workspaceId)
        .collection('categories')
        .doc(categoryId)
        .get();
      const catName = catDoc.data()?.name ?? 'Categoria';

      const refreshedState = (await alertStateRef.get()).data() ?? {};

      if (pct >= 100 && !refreshedState.notified100) {
        await sendPushToUser(
          createdBy,
          `Orçamento estourado: ${catName}`,
          `Você já gastou ${formatBRL(spentCents)} de ${formatBRL(limitCents)} em ${catName} este mês (${pct}%).`,
          '/app/search',
        );
        await alertStateRef.update({ notified100: true, updatedAt: new Date() });
        logger.info(`budgetAlerts: 100% alert sent for ${catName} (${workspaceId})`);
      } else if (pct >= 80 && !refreshedState.notified80 && !refreshedState.notified100) {
        await sendPushToUser(
          createdBy,
          `Limite próximo: ${catName}`,
          `Você já gastou ${pct}% do orçamento de ${catName} este mês (${formatBRL(spentCents)} de ${formatBRL(limitCents)}).`,
          '/app/search',
        );
        await alertStateRef.update({ notified80: true, updatedAt: new Date() });
        logger.info(`budgetAlerts: 80% alert sent for ${catName} (${workspaceId})`);
      }
    }

    logger.info('budgetAlerts: finished');
  },
);
