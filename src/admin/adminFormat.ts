// Quando ainda há mais páginas pra carregar (paginação por cursor), o número
// visível não é o total real — mostra "N+" em vez de um número que parece
// exato mas não é.
export function formatCount(count: number, hasMore: boolean): string {
  return hasMore ? `${count}+` : String(count);
}
