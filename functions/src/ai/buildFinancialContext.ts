import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatBRL(amountCents: number): string {
  return (amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface CategoryInfo {
  id: string;
  name: string;
}

export async function buildFinancialContext(
  db: Firestore,
  workspaceId: string,
): Promise<string> {
  const now = new Date();
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const currentMonth = monthKey(now);
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = monthKey(previousMonthDate);

  // ── Categories lookup ──────────────────────────────────────────────────────
  const categoriesSnap = await db
    .collection(`workspaces/${workspaceId}/categories`)
    .where('isActive', '==', true)
    .get();

  const categoryMap = new Map<string, string>();
  for (const doc of categoriesSnap.docs) {
    const cat = doc.data() as CategoryInfo;
    categoryMap.set(doc.id, cat.name ?? doc.id);
  }

  // ── Transactions: last 90 days, only expenses ───────────────────────────────
  const txnSnap = await db
    .collection(`workspaces/${workspaceId}/transactions`)
    .where('date', '>=', Timestamp.fromDate(ninetyDaysAgo))
    .get();

  const spendingByCategoryThisMonth = new Map<string, number>();
  const spendingByCategoryPrevMonth = new Map<string, number>();

  for (const doc of txnSnap.docs) {
    const txn = doc.data();
    if (txn.deletedAt) continue;
    if (txn.type !== 'expense') continue;

    const amount = txn.amountCents as number;
    const catId = (txn.categoryId as string) ?? '_uncategorized';
    const txnMonth = (txn.competenceMonth as string) ?? monthKey((txn.date as Timestamp).toDate());

    if (txnMonth === currentMonth) {
      spendingByCategoryThisMonth.set(catId, (spendingByCategoryThisMonth.get(catId) ?? 0) + amount);
    } else if (txnMonth === previousMonth) {
      spendingByCategoryPrevMonth.set(catId, (spendingByCategoryPrevMonth.get(catId) ?? 0) + amount);
    }
  }

  const totalThisMonth = [...spendingByCategoryThisMonth.values()].reduce((a, b) => a + b, 0);
  const totalPrevMonth = [...spendingByCategoryPrevMonth.values()].reduce((a, b) => a + b, 0);

  // ── Top 5 categorias de gasto (mês atual) ───────────────────────────────────
  const topCategories = [...spendingByCategoryThisMonth.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([catId, amount]) => {
      const name = categoryMap.get(catId) ?? (catId === '_uncategorized' ? 'Sem categoria' : catId);
      const prevAmount = spendingByCategoryPrevMonth.get(catId) ?? 0;
      return { name, amount, prevAmount };
    });

  // ── Bills: due in next 7 days ──────────────────────────────────────────────
  const sevenDaysAhead = new Date(now);
  sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);

  const billsSnap = await db
    .collection(`workspaces/${workspaceId}/bills`)
    .where('status', '==', 'pending')
    .where('dueDate', '>=', Timestamp.fromDate(now))
    .where('dueDate', '<=', Timestamp.fromDate(sevenDaysAhead))
    .get();

  const upcomingBills: Array<{ description: string; amountCents: number; dueDate: string }> = [];
  for (const doc of billsSnap.docs) {
    const bill = doc.data();
    upcomingBills.push({
      description: (bill.description as string) ?? '',
      amountCents: bill.amountCents as number,
      dueDate: (bill.dueDate as Timestamp).toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    });
  }

  // ── Account names (balance would need all-time txns per account — too costly) ──
  const accountsSnap = await db
    .collection(`workspaces/${workspaceId}/accounts`)
    .where('isActive', '==', true)
    .get();

  const accountNames: string[] = [];
  for (const doc of accountsSnap.docs) {
    const acct = doc.data();
    accountNames.push((acct.name as string) ?? '');
  }

  // ── Build context string ───────────────────────────────────────────────────
  const lines: string[] = [];

  lines.push(`Mês atual: ${currentMonth}. Mês anterior: ${previousMonth}.`);
  lines.push(`Gasto total no mês atual: ${formatBRL(totalThisMonth)}.`);
  lines.push(`Gasto total no mês anterior: ${formatBRL(totalPrevMonth)}.`);

  if (topCategories.length > 0) {
    lines.push('Top categorias de gasto no mês atual:');
    for (const cat of topCategories) {
      const prevStr = cat.prevAmount > 0
        ? ` (mês anterior: ${formatBRL(cat.prevAmount)})`
        : '';
      lines.push(`- ${cat.name}: ${formatBRL(cat.amount)}${prevStr}`);
    }
  } else {
    lines.push('Nenhum gasto registrado no mês atual.');
  }

  if (upcomingBills.length > 0) {
    lines.push('Contas a pagar nos próximos 7 dias:');
    for (const bill of upcomingBills) {
      lines.push(`- ${bill.description}: ${formatBRL(bill.amountCents)} (vence ${bill.dueDate})`);
    }
  } else {
    lines.push('Nenhuma conta a pagar nos próximos 7 dias.');
  }

  if (accountNames.length > 0) {
    lines.push(`Contas: ${accountNames.join(', ')}.`);
  }

  // Limit context to keep prompt small and cheap
  const text = lines.join('\n');
  if (text.length <= 2000) return text;

  // Trim longest lines if too large
  return lines.slice(0, 30).join('\n').slice(0, 2000);
}
