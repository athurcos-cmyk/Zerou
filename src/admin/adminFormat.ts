// Quando a contagem bate exatamente no teto de uma query administrativa, o
// resultado pode estar truncado — mostra "N+" em vez de um número que parece
// exato mas não é.
export function formatCount(count: number, cap: number): string {
  return count >= cap ? `${count}+` : String(count);
}
