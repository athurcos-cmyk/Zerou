import { addDays, compareAsc, endOfDay } from 'date-fns';
import { formatFriendlyMonth, toDate } from './financeDates';
import type { Account, Bill, CreditCard, Invoice, Receivable, RecurringRule, Transaction } from '../types/contracts';
import type { LocalSynced } from './financeService';

export interface AccountBalance extends Account {
  balanceCents: number;
}

export interface UpcomingCommitment {
  id: string;
  kind: 'bill' | 'recurring' | 'invoice';
  description: string;
  amountCents: number;
  dueAt: Date;
  /** Só em `kind: 'invoice'` — pra linkar direto pra fatura do cartão no Dashboard. */
  cardId?: string;
}

export interface UpcomingReceivable {
  id: string;
  description: string;
  fromWho?: string;
  amountCents: number;
  dueAt: Date;
}

/** Janela do Dashboard pra "Próximos a receber": só o que vence em até N dias (pedido do dono,
 * pra não dar ilusão de dinheiro distante). Inclui atrasados (venceram e não foram recebidos). */
export const RECEIVABLE_DASHBOARD_WINDOW_DAYS = 5;

/**
 * "Próximos a receber" do Dashboard: só `pending`/`overdue` com vencimento até hoje + 5 dias.
 * Puramente informativo — NÃO entra em saldo/comprometido nenhum (receivables vivem separados).
 */
export function buildUpcomingReceivables(
  receivables: Array<Pick<Receivable, 'id' | 'description' | 'fromWho' | 'amountCents' | 'dueDate' | 'status'>>,
  now: Date = new Date()
): UpcomingReceivable[] {
  const cutoff = endOfDay(addDays(now, RECEIVABLE_DASHBOARD_WINDOW_DAYS));
  return receivables
    .filter((receivable) => (receivable.status === 'pending' || receivable.status === 'overdue') && toDate(receivable.dueDate) <= cutoff)
    .map((receivable) => ({
      id: receivable.id,
      description: receivable.description,
      fromWho: receivable.fromWho,
      amountCents: receivable.amountCents,
      dueAt: toDate(receivable.dueDate)
    }))
    .sort((left, right) => compareAsc(left.dueAt, right.dueAt));
}

export interface DashboardSummary {
  totalBalanceCents: number;
  committedCents: number;
  upcomingCommitments: UpcomingCommitment[];
  recentTransactions: Transaction[];
}

function isActiveTransaction(transaction: Transaction) {
  return !transaction.deletedAt;
}

export interface AccountEffect {
  accountId: string;
  deltaCents: number;
}

/**
 * Delta de saldo que uma transação aplica, por conta afetada — fonte única de
 * verdade pro sinal de cada tipo, usada tanto pelo cálculo histórico
 * (`applyTransactionToBalances`, abaixo) quanto pelo saldo incremental
 * (`currentBalanceCents`, mantido via `increment()` no mesmo batch da escrita).
 */
export function transactionAccountEffects(
  transaction: Pick<Transaction, 'type' | 'amountCents' | 'accountId' | 'destinationAccountId' | 'deletedAt'>
): AccountEffect[] {
  if (transaction.deletedAt) {
    return [];
  }

  const sourceId = transaction.accountId;
  const destinationId = transaction.destinationAccountId;

  if (transaction.type === 'income' || transaction.type === 'refund' || transaction.type === 'reimbursement') {
    return sourceId ? [{ accountId: sourceId, deltaCents: transaction.amountCents }] : [];
  }

  if (transaction.type === 'expense' || transaction.type === 'card_payment') {
    return sourceId ? [{ accountId: sourceId, deltaCents: -transaction.amountCents }] : [];
  }

  if (transaction.type === 'card_purchase') {
    return [];
  }

  if (transaction.type === 'transfer') {
    const effects: AccountEffect[] = [];
    if (sourceId) effects.push({ accountId: sourceId, deltaCents: -transaction.amountCents });
    if (destinationId) effects.push({ accountId: destinationId, deltaCents: transaction.amountCents });
    return effects;
  }

  if (transaction.type === 'adjustment') {
    return sourceId ? [{ accountId: sourceId, deltaCents: transaction.amountCents }] : [];
  }

  return [];
}

/**
 * Soma deltas por conta vindos de múltiplos grupos (ex.: reverter o efeito antigo +
 * aplicar o novo numa edição) e descarta entradas cujo delta líquido ficou zero —
 * evita um `increment(0)` inútil no batch.
 */
export function mergeAccountEffects(...groups: AccountEffect[][]): AccountEffect[] {
  const totals = new Map<string, number>();
  for (const group of groups) {
    for (const effect of group) {
      totals.set(effect.accountId, (totals.get(effect.accountId) ?? 0) + effect.deltaCents);
    }
  }
  return [...totals.entries()]
    .filter(([, deltaCents]) => deltaCents !== 0)
    .map(([accountId, deltaCents]) => ({ accountId, deltaCents }));
}

export function invertAccountEffects(effects: AccountEffect[]): AccountEffect[] {
  return effects.map((effect) => ({ accountId: effect.accountId, deltaCents: -effect.deltaCents }));
}

/**
 * Saldo atual (agora), lido direto do campo mantido incrementalmente — nunca precisa
 * reler o histórico de transações. Fallback pro saldo de abertura em contas criadas
 * antes do backfill (`currentBalanceCents` ainda ausente).
 */
export function currentAccountBalances(accounts: Account[]): AccountBalance[] {
  return accounts.map((account) => ({
    ...account,
    balanceCents: account.currentBalanceCents ?? account.openingBalanceCents
  }));
}

export function currentTotalBalance(accounts: Account[]): number {
  return currentAccountBalances(accounts).reduce((total, account) => total + account.balanceCents, 0);
}

function applyTransactionToBalances(
  balances: Map<string, number>,
  transaction: Transaction,
  accountIds: Set<string>
) {
  for (const effect of transactionAccountEffects(transaction)) {
    if (accountIds.has(effect.accountId)) {
      balances.set(effect.accountId, (balances.get(effect.accountId) ?? 0) + effect.deltaCents);
    }
  }
}

export function calculateAccountBalances(accounts: Account[], transactions: Transaction[]): AccountBalance[] {
  const accountIds = new Set(accounts.map((account) => account.id));
  const balances = new Map(accounts.map((account) => [account.id, account.openingBalanceCents]));

  transactions.forEach((transaction) => applyTransactionToBalances(balances, transaction, accountIds));

  return accounts.map((account) => ({
    ...account,
    balanceCents: balances.get(account.id) ?? account.openingBalanceCents
  }));
}

export function calculateTotalBalance(accounts: Account[], transactions: Transaction[]) {
  return calculateAccountBalances(accounts, transactions).reduce((total, account) => total + account.balanceCents, 0);
}

/**
 * Soma, por fatura, as compras que vieram de uma recorrência (`card_purchase` com
 * `recurringId` setado — marcado por `recordRecurringPayment`). É esse valor que se
 * desconta do total da fatura no Comprometido: a recorrência já conta como linha própria,
 * então contar a mesma cobrança de novo pela fatura seria duplicidade.
 *
 * Usa só as transações que o boot já carrega (as 300 mais recentes) — zero leitura nova.
 * Faturas em aberto são do ciclo atual, então suas cobranças são recentes e caem dentro
 * dessa janela pra qualquer uso realista; o caso extremo (300+ lançamentos por cima antes
 * de a fatura ser paga) só deixa de descontar 1 item, e o aviso de `hasPendingCardLedgerActivity`
 * já sinaliza que o número pode estar desatualizado.
 */
function recurringChargesByInvoice(transactions: Transaction[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    if (
      transaction.type === 'card_purchase' &&
      !transaction.deletedAt &&
      transaction.recurringId &&
      transaction.invoiceId
    ) {
      totals.set(transaction.invoiceId, (totals.get(transaction.invoiceId) ?? 0) + transaction.amountCents);
    }
  }
  return totals;
}

/**
 * As faturas que o Comprometido conta, por cartão: só o CICLO ATUAL — as fechadas/vencidas/
 * parciais (não pagas, já "pra pagar") contam todas, e das abertas só a de vencimento mais
 * próximo (a que está acumulando agora). Faturas `open` de meses futuros (as parcelas de uma
 * compra parcelada) ficam de fora até chegarem — decisão do dono (2026-07-28): "em aberto e a
 * que está pra ser paga, não todas que existem". Sempre exige saldo devedor > 0.
 */
function selectCurrentCycleInvoices(invoices: Invoice[]): Invoice[] {
  const unpaid = invoices.filter(
    (invoice) => invoice.status !== 'paid' && invoice.status !== 'overpaid' && invoice.outstandingBalanceCents > 0
  );
  const byCard = new Map<string, Invoice[]>();
  for (const invoice of unpaid) {
    const list = byCard.get(invoice.cardId);
    if (list) list.push(invoice);
    else byCard.set(invoice.cardId, [invoice]);
  }

  const result: Invoice[] = [];
  for (const list of byCard.values()) {
    // Fechada/vencida/parcial: já é "pra pagar", conta todas.
    result.push(...list.filter((invoice) => invoice.status !== 'open'));
    // Aberta: só a do ciclo atual (vencimento mais próximo), nunca as parcelas futuras.
    const nearestOpen = list
      .filter((invoice) => invoice.status === 'open')
      .sort((left, right) => compareAsc(toDate(left.dueDate), toDate(right.dueDate)))[0];
    if (nearestOpen) result.push(nearestOpen);
  }
  return result;
}

/**
 * Comprometido = contas a pagar pendentes + TODAS as recorrências ativas (cartão e conta,
 * uma ocorrência cada) + faturas em aberto SEM a parte que já é recorrência. Sem corte por
 * data: tudo que a pessoa já deve conta.
 *
 * A recorrência sempre conta como linha própria (aparece antes de ser registrada). A fatura
 * conta só o que NÃO é recorrência (compra avulsa, parcelado) — `recurringChargesByInvoice`
 * desconta as cobranças de recorrência já lançadas, senão a mesma assinatura contaria duas
 * vezes ao ser registrada no cartão. `transactions` é passado só pra esse desconto.
 */
export function buildUpcomingCommitments(
  bills: Bill[],
  recurringRules: RecurringRule[],
  invoices: Invoice[] = [],
  cards: CreditCard[] = [],
  transactions: Transaction[] = []
): UpcomingCommitment[] {
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const recurringInInvoice = recurringChargesByInvoice(transactions);

  const billCommitments = bills
    .filter((bill) => bill.status === 'pending' || bill.status === 'overdue')
    .map(
      (bill) =>
        ({
          id: bill.id,
          kind: 'bill',
          description: bill.description,
          amountCents: bill.amountCents,
          dueAt: toDate(bill.dueDate)
        }) satisfies UpcomingCommitment
    );

  // Toda recorrência ativa conta uma ocorrência (a próxima), pelo `nextOccurrenceAt`.
  // Cartão e conta contam igual — a duplicidade da de cartão é desfeita descontando a
  // cobrança dela da fatura (abaixo), não excluindo a recorrência.
  const recurringCommitments = recurringRules
    .filter((rule) => rule.isActive && typeof rule.amountCents === 'number')
    .map(
      (rule) =>
        ({
          id: rule.id,
          kind: 'recurring',
          description: rule.description,
          amountCents: rule.amountCents ?? 0,
          dueAt: toDate(rule.nextOccurrenceAt)
        }) satisfies UpcomingCommitment
    );

  // Só as faturas do CICLO ATUAL entram — não todas as que existem. Por cartão: as
  // fechadas/vencidas/parciais (já estão "pra pagar") contam todas, e das abertas só a de
  // vencimento mais próximo (a que está acumulando agora). As parcelas de meses futuros
  // (faturas `open` de compra parcelada) ficam de fora até chegarem — senão uma compra em
  // 10x derrubaria o Comprometido inteiro de uma vez. O valor é o saldo devedor MENOS as
  // cobranças que vieram de recorrência (já contadas como linha acima), com piso em 0.
  const invoiceCommitments = selectCurrentCycleInvoices(invoices)
    .map((invoice) => {
      const cardName = cardById.get(invoice.cardId)?.name;
      const amountCents = Math.max(0, invoice.outstandingBalanceCents - (recurringInInvoice.get(invoice.id) ?? 0));
      return {
        id: invoice.id,
        kind: 'invoice',
        // Sem prefixo "Fatura"/mês de referência: a linha já mostra "Fatura · <data>"
        // embaixo. Fallback mantém o texto antigo se o cartão sumiu (excluído).
        description: cardName ?? `Fatura ${formatFriendlyMonth(invoice.referenceMonth)}`,
        amountCents,
        dueAt: toDate(invoice.dueDate),
        cardId: invoice.cardId
      } satisfies UpcomingCommitment;
    })
    // Fatura que era 100% recorrência fica com 0 depois do desconto — não vira linha.
    .filter((commitment) => commitment.amountCents > 0);

  return [...billCommitments, ...recurringCommitments, ...invoiceCommitments].sort((left, right) =>
    compareAsc(left.dueAt, right.dueAt)
  );
}

/**
 * "Disponível"/"Comprometido" no Dashboard e o "Disponível" da lista de Cartões somam
 * `invoice.outstandingBalanceCents` — um campo que só a Cloud Function
 * (`invoiceLedgerEntryTrigger.ts`) atualiza, rodando no SERVIDOR depois que a escrita chega
 * lá. Offline, ela nunca roda. `CardDetailPage`/`InvoicePage`/Análise já resolvem isso
 * calculando ao vivo a partir do ledger que carregam sob demanda (`mergeInvoicesWithLedger`)
 * — mas Dashboard/Cartões não carregam esse ledger, de propósito, pra não pagar o custo de
 * leitura em toda tela de resumo/lista (ver `docs/COSTS.md`). Em vez de calcular o valor
 * certo sem esse dado, avisa que ele pode estar desatualizado — honesto em vez de preciso.
 *
 * Detecta pela transação, não pelo lançamento da fatura: `card_purchase`/`card_payment` já
 * são gravados em `finance.transactions` (que o boot já carrega) no MESMO batch que cria o
 * lançamento — se a transação ainda não sincronizou (`localSyncStatus: 'pending'`, o próprio
 * Firestore dizendo "não cheguei no servidor"), o lançamento correspondente também não
 * chegou, e a Cloud Function não teve chance de rodar. Zero leitura nova.
 *
 * Cobre criar E excluir: excluir uma compra (`softDeleteTransaction`) faz um `batch.update()`
 * marcando `deletedAt`, que fica `localSyncStatus: 'pending'` do mesmo jeito até sincronizar
 * — é esse update que dispara a OUTRA Cloud Function relevante, `reverseCardPurchaseOnDelete`
 * (estorna a compra na fatura). Sem contar `deletedAt` aqui, excluir uma compra offline
 * deixaria "Comprometido"/"Disponível" com o valor antigo (mais alto) e SEM aviso nenhum —
 * o próprio bug que este aviso existe pra evitar, só que na ponta de excluir em vez de criar.
 *
 * Limite conhecido: crédito/tarifa lançados direto na fatura (`recordInvoiceCredit`/
 * `recordInvoiceFee`) não criam transação — ficam fora dessa detecção. Ação bem mais rara
 * que lançar compra; o pior caso é igual ao de hoje (sem aviso), não uma regressão.
 */
export function hasPendingCardLedgerActivity(transactions: Array<LocalSynced<Transaction>>): boolean {
  return transactions.some(
    (t) => (t.type === 'card_purchase' || t.type === 'card_payment') && t.localSyncStatus === 'pending'
  );
}

export function calculateDashboardSummary(input: {
  accounts: Account[];
  transactions: Transaction[];
  bills: Bill[];
  recurringRules: RecurringRule[];
  invoices?: Invoice[];
  cards?: CreditCard[];
}): DashboardSummary {
  const totalBalanceCents = currentTotalBalance(input.accounts);
  const commitments = buildUpcomingCommitments(
    input.bills,
    input.recurringRules,
    input.invoices ?? [],
    input.cards ?? [],
    input.transactions
  );
  const committedCents = commitments.reduce((total, commitment) => total + commitment.amountCents, 0);
  const recentTransactions = input.transactions
    .filter(isActiveTransaction)
    .slice()
    .sort((left, right) => compareAsc(toDate(right.date), toDate(left.date)))
    .slice(0, 5);

  return {
    totalBalanceCents,
    committedCents,
    upcomingCommitments: commitments.slice(0, 3),
    recentTransactions
  };
}

/**
 * Card "Projeção do próximo mês" (Dashboard) — `sobra = salário previsto − Comprometido`,
 * mais o saldo total atual quando `includeCurrentBalance` estiver ligado (preferência da
 * pessoa, `profile.projectionIncludesBalance`). Diferente da extinta "Fluxo de Caixa"
 * (removida 2026-07-18 por especular receita futura pela MÉDIA histórica): o salário vem
 * 100% do que a pessoa declarou (`profile.projectedSalaryCents`), nunca de estimativa
 * automática — `null` quando ainda não configurado, sem inventar um valor. Somar o saldo
 * atual (quando ligado) não fere essa regra: é um número real e já confirmado (o que já
 * está na conta hoje), não uma projeção de dinheiro que ainda não existe.
 *
 * Usa o MESMO Comprometido do Dashboard (`buildUpcomingCommitments`, sem corte por data):
 * salário previsto menos tudo que já se deve. Isolado de propósito do saldo real — não lê
 * `accounts` (recebe só o total já calculado, se pedido) e nunca escreve nada.
 */
export function calculateNextMonthProjection(input: {
  projectedSalaryCents?: number;
  transactions: Transaction[];
  bills: Bill[];
  recurringRules: RecurringRule[];
  invoices?: Invoice[];
  cards?: CreditCard[];
  includeCurrentBalance?: boolean;
  totalBalanceCents?: number;
}): { committedCents: number; leftoverCents: number } | null {
  if (!input.projectedSalaryCents) return null;

  const committedCents = buildUpcomingCommitments(
    input.bills,
    input.recurringRules,
    input.invoices ?? [],
    input.cards ?? [],
    input.transactions
  ).reduce((total, commitment) => total + commitment.amountCents, 0);

  const balanceCents = input.includeCurrentBalance ? input.totalBalanceCents ?? 0 : 0;

  return { committedCents, leftoverCents: input.projectedSalaryCents + balanceCents - committedCents };
}
