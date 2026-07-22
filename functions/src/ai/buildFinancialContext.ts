import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { onboardingChallengeLabels, onboardingGoalLabels } from './onboardingLabels.js';
import { resolveCommittedCutoff, type AvailableMode, type PaydayRule } from '../shared/committedCutoff.js';

function nowInBRT(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${months[parseInt(m, 10) - 1]}/${y.slice(2)}`;
}

function formatBRL(amountCents: number): string {
  return (amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function sanitize(text: string): string {
  // Dado do usuario (nome de conta/categoria/descricao) vai cru pro prompt do DeepSeek.
  // Remove caracteres de controle (C0/C1, inclui quebras) e invisiveis (zero-width, bidi,
  // separadores, BOM) usados pra smugglar instrucao / quebrar o prompt (prompt injection),
  // filtrando por code point. Depois colapsa espacos e trima.
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    const isInvisible = (code >= 0x200b && code <= 0x200f) || code === 0x2028 || code === 0x2029 || code === 0xfeff;
    out += (isControl || isInvisible) ? ' ' : ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function friendlyDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}


const SPENDING_TYPES = new Set(['expense', 'card_purchase']);
const MAX_CONTEXT_CHARS = 5000;

interface CategoryInfo {
  id: string;
  name: string;
}

interface BudgetData {
  id: string;
  categoryId: string;
  limitCents: number;
  isActive: boolean;
}

interface GoalData {
  id: string;
  name: string;
  kind: 'save' | 'debt';
  targetCents: number;
  savedCents: number;
  isActive: boolean;
}

interface RecurringRuleData {
  id: string;
  description: string;
  amountCents?: number;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  nextOccurrenceAt: Timestamp;
  categoryId?: string;
  isActive: boolean;
}

interface InvoiceData {
  id: string;
  cardId: string;
  referenceMonth: string;
  dueDate: Timestamp;
  status: string;
  outstandingBalanceCents: number;
  purchasesTotalCents: number;
  paymentsTotalCents: number;
}

export async function buildFinancialContext(
  db: Firestore,
  workspaceId: string,
  uid: string,
): Promise<string> {
  const now = nowInBRT();
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const currentMonth = monthKey(now);
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = monthKey(previousMonthDate);

  // ── User profile (payday, availableMode, objetivo/desafio do onboarding) ──
  // `paydayInfo` só é montado mais abaixo, depois que o cutoff real (resolveCommittedCutoff)
  // é calculado — precisa das transações (próxima receita já lançada) pra decidir a fonte.
  let payday: PaydayRule | undefined;
  let availableMode: AvailableMode = 'until_payday';
  let windowDays = 30;
  let onboardingInfo = '';
  let hasProfile = false;
  try {
    const userDoc = await db.doc(`users/${uid}`).get();
    if (userDoc.exists) {
      hasProfile = true;
      const profile = userDoc.data() ?? {};
      payday = profile.payday as PaydayRule | undefined;
      availableMode = (profile.availableMode as AvailableMode) ?? 'until_payday';
      windowDays = (profile.committedWindowDays as number) ?? 30;

      // Respostas do onboarding — editaveis depois em Configuracoes > Objetivo e desafio,
      // por isso podem estar ausentes ou desatualizadas; usar so como tempero de tom, nunca
      // como fato garantido.
      const goalLabel = onboardingGoalLabels[(profile.onboardingGoal as string) ?? ''];
      const challengeLabel = onboardingChallengeLabels[(profile.onboardingChallenge as string) ?? ''];
      const onboardingLines: string[] = [];
      if (goalLabel) onboardingLines.push(`Objetivo declarado: ${goalLabel}.`);
      if (challengeLabel) onboardingLines.push(`Maior desafio declarado: ${challengeLabel}.`);
      onboardingInfo = onboardingLines.join(' ');
    }
  } catch {
    // Perfil ausente nao quebra o contexto
  }

  // ── Categories ─────────────────────────────────────────────────────────────
  const categoriesSnap = await db
    .collection(`workspaces/${workspaceId}/categories`)
    .where('isActive', '==', true)
    .get();

  const categoryMap = new Map<string, string>();
  for (const doc of categoriesSnap.docs) {
    const cat = doc.data() as CategoryInfo;
    categoryMap.set(doc.id, sanitize(cat.name ?? '') || doc.id);
  }

  // ── Transactions ───────────────────────────────────────────────────────────
  const txnSnap = await db
    .collection(`workspaces/${workspaceId}/transactions`)
    .where('date', '>=', Timestamp.fromDate(ninetyDaysAgo))
    .limit(2000)
    .get();

  let incomeThisMonth = 0;
  const spendingByCategoryThisMonth = new Map<string, number>();
  const spendingByCategoryPrevMonth = new Map<string, number>();
  const monthlyTotals = new Map<string, number>();
  const incomeTransactions: Array<{ type: string; date: Date; tags?: string[]; deletedAt?: unknown }> = [];

  for (const doc of txnSnap.docs) {
    const txn = doc.data();
    if (txn.deletedAt) continue;

    const amount = (txn.amountCents as number) ?? 0;
    const txnDate = (txn.date as Timestamp).toDate();
    const txnMonth = (txn.cashMonth || txn.competenceMonth || monthKey(txnDate)) as string;

    if (txn.type === 'income') {
      incomeTransactions.push({ type: 'income', date: txnDate, tags: txn.tags as string[] | undefined });
      if (txnMonth === currentMonth) {
        incomeThisMonth += amount;
      }
    }

    if (!SPENDING_TYPES.has(txn.type as string)) continue;

    // Monthly trend (6 months back)
    if (txnMonth >= monthKey(new Date(now.getFullYear(), now.getMonth() - 5, 1))) {
      monthlyTotals.set(txnMonth, (monthlyTotals.get(txnMonth) ?? 0) + amount);
    }

    const catId = (txn.categoryId as string) || '_uncategorized';

    if (txnMonth === currentMonth) {
      spendingByCategoryThisMonth.set(catId, (spendingByCategoryThisMonth.get(catId) ?? 0) + amount);
    } else if (txnMonth === previousMonth) {
      spendingByCategoryPrevMonth.set(catId, (spendingByCategoryPrevMonth.get(catId) ?? 0) + amount);
    }
  }

  const totalThisMonth = [...spendingByCategoryThisMonth.values()].reduce((a, b) => a + b, 0);
  const totalPrevMonth = [...spendingByCategoryPrevMonth.values()].reduce((a, b) => a + b, 0);

  // ── Cutoff do Comprometido — mesma lógica do Dashboard (resolveCommittedCutoff) ──
  const committedCutoff = resolveCommittedCutoff({
    transactions: incomeTransactions,
    payday,
    committedWindowDays: windowDays,
    availableMode,
    now
  });

  let paydayInfo = '';
  if (hasProfile) {
    if (availableMode === 'conservative') {
      paydayInfo = `Modo conservador: nao assume recebimento futuro. Janela de ${windowDays} dias.`;
    } else if (committedCutoff.source === 'income') {
      paydayInfo = `Tem uma receita futura ja lancada em ${friendlyDate(committedCutoff.cutoff)} — o Comprometido considera ate essa data.`;
    } else if (payday) {
      if (payday.type === 'fixed_day') paydayInfo = `Recebe dia ${payday.day} (fixo).`;
      else if (payday.type === 'business_day') paydayInfo = `Recebe ate o ${payday.day}o dia util.`;
      else if (payday.type === 'end_of_month') paydayInfo = `Recebe no fim do mes.`;
      else if (payday.type === 'variable_income') paydayInfo = `Renda variavel. Janela de ${windowDays} dias.`;
    } else {
      paydayInfo = `Nao informou data de recebimento. Janela de ${windowDays} dias.`;
    }
  }

  // ── Top 5 categories ──────────────────────────────────────────────────────
  const topCategories = [...spendingByCategoryThisMonth.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([catId, amount]) => {
      const name = categoryMap.get(catId) ?? (catId === '_uncategorized' ? 'Sem categoria' : catId);
      const prevAmount = spendingByCategoryPrevMonth.get(catId) ?? 0;
      return { name, amount, prevAmount };
    });

  // ── 6-month trend ──────────────────────────────────────────────────────────
  const trendMonths: string[] = [];
  for (let i = 5; i >= 0; i--) {
    trendMonths.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  const trendLines = trendMonths.map((m) => ({
    month: m,
    total: monthlyTotals.get(m) ?? 0,
  }));

  // ── Bills: pending + overdue, up to 30 days out ────────────────────────────
  const billsSnap = await db
    .collection(`workspaces/${workspaceId}/bills`)
    .where('status', 'in', ['pending', 'overdue'])
    .get();

  let billsCommitted = 0;
  const upcomingBills: Array<{ description: string; amountCents: number; dueDate: string; overdue: boolean }> = [];

  for (const doc of billsSnap.docs) {
    const bill = doc.data();
    const dueDateTs = bill.dueDate as Timestamp | null | undefined;
    if (!dueDateTs || !dueDateTs.toDate) continue;

    const dueDate = dueDateTs.toDate();
    if (isNaN(dueDate.getTime())) continue;

    const amount = bill.amountCents as number;
    const isOverdue = bill.status === 'overdue' || dueDate < todayStart;

    // Bills vencidas ou que vencem até o cutoff (mesmo corte do Comprometido do Dashboard)
    if (isOverdue || (dueDate >= todayStart && dueDate <= committedCutoff.cutoff)) {
      billsCommitted += amount;
      upcomingBills.push({
        description: sanitize((bill.description as string) ?? ''),
        amountCents: amount,
        dueDate: friendlyDate(dueDate),
        overdue: isOverdue,
      });
    }
  }

  upcomingBills.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  // ── Recurring rules ───────────────────────────────────────────────────────
  const recurringSnap = await db
    .collection(`workspaces/${workspaceId}/recurring`)
    .where('isActive', '==', true)
    .get();

  let recurringCommitted = 0;
  const upcomingRecurring: Array<{ description: string; amountCents: number; nextDate: string }> = [];

  for (const doc of recurringSnap.docs) {
    const rule = doc.data() as RecurringRuleData;

    if (typeof rule.amountCents !== 'number' || rule.amountCents <= 0) continue;

    const nextDate = rule.nextOccurrenceAt.toDate();
    if (isNaN(nextDate.getTime())) continue;

    // Conta como comprometido se a proxima ocorrencia cai até o cutoff (ou já passou —
    // está devendo registrar)
    if (nextDate <= committedCutoff.cutoff) {
      recurringCommitted += rule.amountCents;
      upcomingRecurring.push({
        description: sanitize(rule.description ?? ''),
        amountCents: rule.amountCents,
        nextDate: friendlyDate(nextDate),
      });
    }
  }

  upcomingRecurring.sort((a, b) => a.nextDate.localeCompare(b.nextDate));

  // ── Credit card invoices (faturas com saldo devedor) ──────────────────────
  let invoiceCommitted = 0;
  const activeInvoices: Array<{ cardName: string; referenceMonth: string; outstandingCents: number; dueDate: string }> = [];

  const cardsSnap = await db
    .collection(`workspaces/${workspaceId}/cards`)
    .where('isActive', '==', true)
    .get();

  for (const cardDoc of cardsSnap.docs) {
    const card = cardDoc.data() as { name: string };

    const invoicesSnap = await db
      .collection(`workspaces/${workspaceId}/cards/${cardDoc.id}/invoices`)
      .where('status', 'in', ['open', 'closed', 'overdue', 'partial'])
      .get();

    for (const invDoc of invoicesSnap.docs) {
      const inv = invDoc.data() as InvoiceData;

      // outstandingBalanceCents e mantido incrementalmente por
      // invoiceLedgerEntryTrigger.ts a cada lancamento novo no ledger.
      const outstanding = inv.outstandingBalanceCents ?? 0;
      if (outstanding <= 0) continue;

      const dueDate = inv.dueDate.toDate();
      if (isNaN(dueDate.getTime())) continue;

      // Fatura fechada sempre conta (pagamento iminente); em aberto só se o vencimento
      // real cair até o cutoff — mesma regra de buildUpcomingCommitments no client.
      if (inv.status !== 'closed' && dueDate > committedCutoff.cutoff) continue;

      invoiceCommitted += outstanding;
      activeInvoices.push({
        cardName: sanitize(card.name ?? 'Cartao'),
        referenceMonth: inv.referenceMonth,
        outstandingCents: outstanding,
        dueDate: friendlyDate(dueDate),
      });
    }
  }

  activeInvoices.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  // ── Account balances ──────────────────────────────────────────────────────
  const accountsSnap = await db
    .collection(`workspaces/${workspaceId}/accounts`)
    .where('isActive', '==', true)
    .get();

  let totalBalance = 0;
  const accountLines: string[] = [];

  for (const doc of accountsSnap.docs) {
    const acct = doc.data();
    const name = sanitize((acct.name as string) ?? '');
    if (!name) continue;

    // currentBalanceCents e mantido incrementalmente a cada transacao (ver
    // src/finance/financeService.ts). Cai pro saldo de abertura em conta anterior ao backfill.
    const balance = (acct.currentBalanceCents as number | undefined) ?? (acct.openingBalanceCents as number) ?? 0;

    totalBalance += balance;
    accountLines.push(`${name}: ${formatBRL(balance)}`);
  }

  // ── Budgets ────────────────────────────────────────────────────────────────
  const budgetsSnap = await db
    .collection(`workspaces/${workspaceId}/budgets`)
    .where('isActive', '==', true)
    .get();

  const budgetLines: Array<{ name: string; limit: number; spent: number; pct: number }> = [];

  for (const doc of budgetsSnap.docs) {
    const budget = doc.data() as BudgetData;
    if (!budget.limitCents || budget.limitCents <= 0) continue;
    const catName = categoryMap.get(budget.categoryId) ?? budget.categoryId;
    const spent = spendingByCategoryThisMonth.get(budget.categoryId) ?? 0;
    const pct = budget.limitCents > 0 ? (spent / budget.limitCents) * 100 : 0;
    budgetLines.push({ name: sanitize(catName), limit: budget.limitCents, spent, pct });
  }
  budgetLines.sort((a, b) => b.pct - a.pct);

  // ── Goals ──────────────────────────────────────────────────────────────────
  const goalsSnap = await db
    .collection(`workspaces/${workspaceId}/goals`)
    .where('isActive', '==', true)
    .get();

  const goalLines: Array<{ name: string; kind: string; saved: number; target: number; pct: number }> = [];

  for (const doc of goalsSnap.docs) {
    const goal = doc.data() as GoalData;
    const pct = goal.targetCents > 0 ? ((goal.savedCents ?? 0) / goal.targetCents) * 100 : 0;
    goalLines.push({
      name: sanitize(goal.name ?? ''),
      kind: goal.kind === 'debt' ? 'quitacao' : 'guardar',
      saved: goal.savedCents,
      target: goal.targetCents,
      pct,
    });
  }
  goalLines.sort((a, b) => b.pct - a.pct);

  // ── Couple workspace ───────────────────────────────────────────────────────
  let coupleGoalLines: Array<{ name: string; saved: number; target: number; pct: number }> = [];

  try {
    const refsSnap = await db
      .collection(`users/${uid}/workspaceRefs`)
      .where('status', '==', 'active')
      .where('type', '==', 'couple')
      .limit(1)
      .get();

    if (!refsSnap.empty) {
      const coupleWsId = refsSnap.docs[0].id;
      const coupleGoalsSnap = await db
        .collection(`workspaces/${coupleWsId}/goals`)
        .where('isActive', '==', true)
        .get();

      for (const doc of coupleGoalsSnap.docs) {
        const goal = doc.data() as GoalData;
        const pct = goal.targetCents > 0 ? ((goal.savedCents ?? 0) / goal.targetCents) * 100 : 0;
        coupleGoalLines.push({
          name: sanitize(goal.name ?? ''),
          saved: goal.savedCents,
          target: goal.targetCents,
          pct,
        });
      }
      coupleGoalLines.sort((a, b) => b.pct - a.pct);
    }
  } catch {
    // Espaco do casal ausente ou sem permissao nao quebra o contexto
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalCommitted = billsCommitted + recurringCommitted + invoiceCommitted;
  const freeToSpend = totalBalance - totalCommitted;

  // ── Build context string ──────────────────────────────────────────────────
  const lines: string[] = [];

  // SEU CICLO
  if (paydayInfo || onboardingInfo) {
    lines.push('=== SEU CICLO ===');
    if (paydayInfo) lines.push(paydayInfo);
    if (onboardingInfo) lines.push(onboardingInfo);
    lines.push('');
  }

  // RESUMO
  lines.push('=== RESUMO ===');
  lines.push(`Mes atual: ${currentMonth}. Mes anterior: ${previousMonth}.`);
  lines.push(`Gasto total no mes atual: ${formatBRL(totalThisMonth)}.`);
  if (totalPrevMonth > 0) {
    const diff = totalThisMonth - totalPrevMonth;
    const pct = totalPrevMonth > 0 ? Math.round((diff / totalPrevMonth) * 100) : 0;
    const dir = diff > 0 ? 'a mais' : 'a menos';
    lines.push(`Comparado ao mes anterior: ${formatBRL(Math.abs(diff))} ${dir} (${Math.abs(pct)}%).`);
  }
  if (incomeThisMonth > 0) {
    lines.push(`Receitas no mes atual: ${formatBRL(incomeThisMonth)}.`);
  }
  if (accountLines.length > 0) {
    lines.push('Saldos:');
    for (const line of accountLines) {
      lines.push(`- ${line}`);
    }
  }
  lines.push(`Saldo total em contas: ${formatBRL(totalBalance)}.`);
  lines.push(`Total comprometido (contas + faturas): ${formatBRL(totalCommitted)}.`);
  lines.push(`Livre para gastar: ${formatBRL(freeToSpend)}.`);
  lines.push('');

  // TENDENCIA (6 meses)
  const nonZeroTrend = trendLines.filter((t) => t.total > 0);
  if (nonZeroTrend.length >= 2) {
    lines.push('=== TENDENCIA (6 meses) ===');
    lines.push(nonZeroTrend.map((t) => `${monthLabel(t.month)}: ${formatBRL(t.total)}`).join(' | '));
    lines.push('');
  }

  // GASTOS POR CATEGORIA
  if (topCategories.length > 0) {
    lines.push('=== GASTOS POR CATEGORIA ===');
    for (const cat of topCategories) {
      const prevStr = cat.prevAmount > 0 ? ` (mes anterior: ${formatBRL(cat.prevAmount)})` : '';
      lines.push(`- ${cat.name}: ${formatBRL(cat.amount)}${prevStr}`);
    }
    lines.push('');
  }

  // ORCAMENTOS
  if (budgetLines.length > 0) {
    lines.push('=== ORCAMENTOS ===');
    for (const b of budgetLines) {
      lines.push(`- ${b.name}: ${formatBRL(b.spent)} de ${formatBRL(b.limit)} (${formatPercent(b.pct)})`);
    }
    lines.push('');
  }

  // METAS
  if (goalLines.length > 0) {
    lines.push('=== METAS ===');
    for (const g of goalLines) {
      const targetStr = g.target > 0 ? ` de ${formatBRL(g.target)}` : '';
      lines.push(`- ${g.name} (${g.kind}): ${formatBRL(g.saved)}${targetStr} (${formatPercent(g.pct)})`);
    }
    lines.push('');
  }

  // COMPROMETIDO — Contas a Pagar (avulsas + recorrentes) + Faturas
  const totalBills = upcomingBills.length + upcomingRecurring.length;
  lines.push(`=== COMPROMETIDO (ate ${friendlyDate(committedCutoff.cutoff)}) ===`);

  if (totalBills > 0) {
    lines.push(`Contas a pagar (${totalBills}):`);
    for (const bill of upcomingBills) {
      const prefix = bill.overdue ? 'VENCIDA' : `Vence ${bill.dueDate}`;
      lines.push(`- ${bill.description}: ${formatBRL(bill.amountCents)} (${prefix})`);
    }
    for (const rec of upcomingRecurring) {
      lines.push(`- ${rec.description}: ${formatBRL(rec.amountCents)} (prox. ${rec.nextDate}, se repete)`);
    }
  } else {
    lines.push(`Nenhuma conta a pagar ate ${friendlyDate(committedCutoff.cutoff)}.`);
  }

  if (activeInvoices.length > 0) {
    lines.push(`Faturas de cartao (${activeInvoices.length}):`);
    for (const inv of activeInvoices) {
      lines.push(`- ${inv.cardName} (${inv.referenceMonth}): ${formatBRL(inv.outstandingCents)} (vence ${inv.dueDate})`);
    }
  }

  lines.push('');
  lines.push(`Total comprometido: ${formatBRL(totalCommitted)} (contas: ${formatBRL(billsCommitted + recurringCommitted)} + faturas: ${formatBRL(invoiceCommitted)}).`);

  // CASAL
  if (coupleGoalLines.length > 0) {
    lines.push('');
    lines.push('=== CASAL ===');
    for (const g of coupleGoalLines) {
      const targetStr = g.target > 0 ? ` de ${formatBRL(g.target)}` : '';
      lines.push(`- Cofrinho ${g.name}: ${formatBRL(g.saved)}${targetStr} (${formatPercent(g.pct)})`);
    }
  }

  const text = lines.join('\n');
  if (text.length <= MAX_CONTEXT_CHARS) return text;

  const truncated = text.slice(0, MAX_CONTEXT_CHARS);
  const lastBreak = truncated.lastIndexOf('\n');
  return lastBreak > 0 ? truncated.slice(0, lastBreak) : truncated;
}
