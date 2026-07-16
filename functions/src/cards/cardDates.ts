// Porta de src/cards/cardDates.ts (resolveInstallmentCycle, invoiceIdFor). Cloud Functions
// não importa src/ do app cliente — mantenha em sincronia manualmente se a logica original mudar.

function clampDay(date: Date, day: number): Date {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const result = new Date(date);
  result.setDate(Math.min(day, lastDay));
  return result;
}

function formatYyyyMm(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Ciclo (fatura + vencimento) da parcela `installmentIndex` de uma compra.
 *
 * O mes da parcela e contado a partir do mes da PRIMEIRA fatura, ancorado no dia 1 —
 * nunca somando meses a data da compra. Somar a data da compra clampa em fevereiro
 * (31/jan + 1 mes = 28/fev) e, num cartao que fecha dia 28, o dia clampado deixa de
 * ser "depois do fechamento": a 2a parcela caia na MESMA fatura da 1a e marco ficava
 * sem parcela nenhuma. Parcelas sempre ocupam faturas consecutivas.
 */
export function resolveInstallmentCycle(
  purchaseDate: Date,
  closingDay: number,
  dueDay: number,
  installmentIndex = 0,
): { referenceMonth: string; dueDate: Date } {
  const purchaseDay = purchaseDate.getDate();
  // Compra depois do fechamento entra na fatura do mes seguinte.
  const firstMonthOffset = purchaseDay > closingDay ? 1 : 0;
  const referenceDate = new Date(
    purchaseDate.getFullYear(),
    purchaseDate.getMonth() + firstMonthOffset + installmentIndex,
    1,
    purchaseDate.getHours(),
    purchaseDate.getMinutes(),
    purchaseDate.getSeconds(),
    purchaseDate.getMilliseconds(),
  );
  const referenceMonth = formatYyyyMm(referenceDate);
  // Padrao comum de cartao brasileiro: fecha tarde no mes (ex. dia 25), vence cedo no
  // mes seguinte (ex. dia 5) — dueDay < closingDay indica que o vencimento cai no mes
  // depois do referenceDate, nunca no mesmo mes.
  const dueMonthDate = dueDay < closingDay
    ? new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth() + 1,
        1,
        referenceDate.getHours(),
        referenceDate.getMinutes(),
        referenceDate.getSeconds(),
        referenceDate.getMilliseconds(),
      )
    : referenceDate;
  const dueDate = clampDay(dueMonthDate, dueDay);

  return { referenceMonth, dueDate };
}

export function invoiceIdFor(cardId: string, referenceMonth: string): string {
  return `${cardId}_${referenceMonth}`;
}
