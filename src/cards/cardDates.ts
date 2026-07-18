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
  // Compra depois do fechamento entra na fatura do mês seguinte.
  const firstMonthOffset = purchaseDay > closingDay ? 1 : 0;
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
 * Início (00:00) do dia de fechamento da fatura de um `referenceMonth`, dado o cartão —
 * sempre o `closingDay` clampado no próprio mês de referência (é a definição de
 * referenceMonth: uma compra até o dia de fechamento cai na fatura DESSE mês; ver
 * `resolveInstallmentCycle`). Meia-noite de propósito, não meio-dia: quem usa isso pra
 * decidir "essa fatura já fechou?" precisa comparar por DIA inteiro — `resolveInstallmentCycle`
 * trata o dia de fechamento inteiro como parte do ciclo atual, então fechar a fatura a
 * partir do meio-dia desse mesmo dia fecharia horas antes de uma compra da tarde ainda
 * poder cair nela.
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
