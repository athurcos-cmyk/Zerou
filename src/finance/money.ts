const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

export function formatMoney(amountCents: number) {
  return BRL_FORMATTER.format(amountCents / 100);
}

export function parseMoneyToCents(value: string) {
  let normalized = value.replace(/\s/g, '').replace(/[R$]/g, '');

  if (!normalized || normalized === '-' || normalized === '.' || normalized === ',') {
    return 0;
  }

  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');

  if (hasComma && hasDot) {
    // Os dois aparecem: o separador decimal é o que vem por último
    // ("1.234,56" formato BR → vírgula decimal; "1,234.56" formato US → ponto decimal).
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');
    normalized = lastComma > lastDot
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '');
  } else if (hasComma) {
    normalized = normalized.replace(',', '.');
  } else if (hasDot) {
    const dotCount = normalized.split('.').length - 1;
    const digitsAfterLastDot = normalized.length - normalized.lastIndexOf('.') - 1;

    // Um único ponto seguido de 1-2 dígitos é decimal ("10.5", "10.50" — ex.:
    // teclado numérico físico ou locale do sistema em inglês). Múltiplos pontos,
    // ou um único ponto seguido de exatamente 3 dígitos, só fazem sentido como
    // separador de milhar ("1.234", "1.234.567"), já que dinheiro nunca tem 3+
    // casas decimais.
    if (dotCount > 1 || digitsAfterLastDot === 3) {
      normalized = normalized.replace(/\./g, '');
    }
  }

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
