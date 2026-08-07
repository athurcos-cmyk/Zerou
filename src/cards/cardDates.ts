import { addMonths, format, lastDayOfMonth, setDate } from 'date-fns';

function clampDay(date: Date, day: number) {
  const lastDay = lastDayOfMonth(date).getDate();
  return setDate(date, Math.min(day, lastDay));
}

/**
 * Data de vencimento da fatura de um `referenceMonth` ('yyyy-MM'), dado o cartão.
 *
 * Usado ao lançar uma compra parcelada JÁ EM ANDAMENTO, quando a pessoa diz em qual mês
 * cai a próxima parcela — aí não temos data de compra pra `resolveInstallmentCycle`, só o
 * mês da fatura. A regra do vencimento é a mesma: se o cartão vence antes de fechar
 * (ex.: fecha 25, vence 5), o vencimento cai no mês seguinte ao de referência.
 */
export function invoiceDueDateForReferenceMonth(referenceMonth: string, closingDay: number, dueDay: number) {
  const [year, month] = referenceMonth.split('-').map(Number);
  const referenceDate = new Date(year, month - 1, 1, 12, 0, 0);
  const dueMonthDate = dueDay < closingDay ? addMonths(referenceDate, 1) : referenceDate;
  return clampDay(dueMonthDate, dueDay);
}

/**
 * Ciclo (fatura + vencimento) da parcela `installmentIndex` de uma compra.
 *
 * ⚠️ **Esta função tem uma cópia manual no servidor**, `functions/src/cards/cardDates.ts`, usada
 * quando a Vic lança compra pelo WhatsApp (`createCardPurchaseFromMessage.ts`). Mudança aqui
 * **precisa ir junto lá, no mesmo commit** — senão lançar pelo app e lançar pelo WhatsApp caem
 * em faturas diferentes, e `git push` nem reimplanta a de lá (ver `docs/RUNBOOK.md`).
 *
 * O mês da parcela é contado a partir do mês da PRIMEIRA fatura, ancorado no dia 1 —
 * nunca somando meses à data da compra. Somar à data da compra clampa em fevereiro
 * (31/jan + 1 mês = 28/fev) e, num cartão que fecha dia 28, o dia clampado deixa de
 * ser "depois do fechamento": a 2ª parcela caía na MESMA fatura da 1ª e março ficava
 * sem parcela nenhuma. Parcelas sempre ocupam faturas consecutivas.
 */
export function resolveInstallmentCycle(
  purchaseDate: Date,
  closingDay: number,
  dueDay: number,
  installmentIndex = 0
) {
  const purchaseDay = purchaseDate.getDate();
  // Compra NO dia do fechamento ou depois entra na fatura do mês seguinte — `>=`, não `>`.
  //
  // Era `>` e isso contradizia o fechamento (bug real, achado pelo dono em 2026-08-02): num
  // cartão que fecha dia 2, a fatura de agosto já aparecia FECHADA no dia 2 — tanto no app do
  // banco quanto aqui, porque `closeInvoicesDue` (`functions/src/automation.ts`) roda no dia do
  // fechamento e fecha `referenceMonth <= currentMonth`. Só que a compra feita nesse mesmo dia
  // era roteada com offset 0, ou seja, PRA DENTRO da fatura que acabara de fechar. Uma compra
  // de hoje entrava numa fatura fechada que vence em 8 dias.
  //
  // Com `>=`, a fatura de um mês cobre do dia seguinte ao fechamento anterior até a véspera do
  // próprio fechamento, e o dia do fechamento já pertence ao ciclo seguinte — que é como o
  // cartão brasileiro funciona e o que o app do banco mostra.
  //
  // Nenhum dos 9 testes que já existiam mudou de resultado: a fronteira `purchaseDay ===
  // closingDay` era justamente o único caso que nenhum deles cobria.
  const firstMonthOffset = purchaseDay >= closingDay ? 1 : 0;
  const referenceDate = new Date(
    purchaseDate.getFullYear(),
    purchaseDate.getMonth() + firstMonthOffset + installmentIndex,
    1,
    purchaseDate.getHours(),
    purchaseDate.getMinutes(),
    purchaseDate.getSeconds(),
    purchaseDate.getMilliseconds()
  );
  const referenceMonth = format(referenceDate, 'yyyy-MM');
  // Padrão comum de cartão brasileiro: fecha tarde no mês (ex. dia 25), vence cedo no
  // mês seguinte (ex. dia 5) — dueDay < closingDay indica que o vencimento cai no mês
  // depois do referenceDate, nunca no mesmo mês. Sem isso, o vencimento calculado podia
  // cair ANTES do próprio fechamento (e até antes da compra que o gerou).
  const dueMonthDate = dueDay < closingDay ? addMonths(referenceDate, 1) : referenceDate;
  const dueDate = clampDay(dueMonthDate, dueDay);

  return {
    referenceMonth,
    dueDate
  };
}

export function resolveInvoiceCycle(purchaseDate: Date, closingDay: number, dueDay: number) {
  return resolveInstallmentCycle(purchaseDate, closingDay, dueDay, 0);
}

export function invoiceIdFor(cardId: string, referenceMonth: string) {
  return `${cardId}_${referenceMonth}`;
}

/**
 * O inverso de `invoiceIdFor`: tira o `referenceMonth` de um id de fatura. `undefined` quando o
 * sufixo não é um mês válido (id de outro formato, ou dado torto).
 *
 * Mora aqui porque quem define o formato do id é `invoiceIdFor`, logo acima — as duas precisam
 * mudar juntas se o formato mudar. Consumidores: a reconstrução de parcelas sem ler o ledger
 * (`installmentSchedule.ts`) e o deslocamento da série (`spendingAnalysis.ts`), que usam o mês da
 * PRIMEIRA fatura gravado na própria transação (`invoiceId`) em vez de precisar da fatura carregada.
 */
export function referenceMonthFromInvoiceId(invoiceId: string | undefined): string | undefined {
  if (!invoiceId) return undefined;
  const candidate = invoiceId.slice(invoiceId.lastIndexOf('_') + 1);
  return /^\d{4}-\d{2}$/.test(candidate) ? candidate : undefined;
}

/**
 * Início (00:00) do dia de fechamento da fatura de um `referenceMonth`, dado o cartão —
 * sempre o `closingDay` clampado no próprio mês de referência.
 *
 * **A fatura está fechada A PARTIR desse instante, inclusive** (comparar com `<=`, não `<`).
 * O dia do fechamento pertence ao ciclo SEGUINTE: `resolveInstallmentCycle` roteia a compra
 * desse dia pra próxima fatura (`purchaseDay >= closingDay`). As duas regras são a mesma
 * fronteira vista dos dois lados e **precisam andar juntas** — enquanto discordavam, a compra
 * do dia do fechamento caía dentro da fatura que fechava naquele mesmo dia (bug de 2026-08-02).
 *
 * Meia-noite de propósito, não meio-dia: a decisão é por DIA inteiro, sem depender da hora em
 * que o lançamento aconteceu nem da hora em que o scheduler rodou.
 */
export function invoiceClosingDateForReferenceMonth(referenceMonth: string, closingDay: number) {
  const [year, month] = referenceMonth.split('-').map(Number);
  return clampDay(new Date(year, month - 1, 1), closingDay);
}

/**
 * Escolhe a fatura "atual" (a que está acumulando compras novas agora, mais próxima
 * de fechar) entre as faturas abertas de um cartão. Compras parceladas criam faturas
 * abertas em vários meses futuros ao mesmo tempo — sem ordenar por referenceMonth,
 * `.find(status === 'open')` pega a ordem de chegada do array (desc por padrão em
 * subscribeInvoices), o que pode devolver uma fatura futura em vez da que está
 * realmente em aberto para novas compras.
 */
export function pickCurrentInvoice<T extends { status: string; referenceMonth: string }>(
  invoices: T[]
): T | null {
  const openSorted = invoices
    .filter((invoice) => invoice.status === 'open')
    .sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth));

  return openSorted[0] ?? invoices[0] ?? null;
}
