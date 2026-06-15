const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

export function formatMoney(amountCents: number) {
  return BRL_FORMATTER.format(amountCents / 100);
}

export function parseMoneyToCents(value: string) {
  const normalized = value
    .replace(/\s/g, '')
    .replace(/[R$]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  if (!normalized || normalized === '-' || normalized === '.') {
    return 0;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    throw new Error('Informe um valor em reais válido.');
  }

  return Math.round(parsed * 100);
}

export function centsToInputValue(amountCents: number) {
  return (amountCents / 100).toFixed(2).replace('.', ',');
}
