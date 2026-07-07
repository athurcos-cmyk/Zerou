import { describe, expect, it } from 'vitest';
import { centsToInputValue, formatMoney, parseMoneyToCents } from './money';

describe('formatMoney', () => {
  it('formats cents as BRL currency', () => {
    expect(formatMoney(1050)).toBe('R$ 10,50');
    expect(formatMoney(100000)).toBe('R$ 1.000,00');
  });

  it('formats zero as R$ 0,00', () => {
    expect(formatMoney(0)).toBe('R$ 0,00');
  });

  it('formats negative values with a leading minus sign', () => {
    expect(formatMoney(-1050)).toBe('-R$ 10,50');
  });

  it('rounds sub-cent floating point noise from division', () => {
    // 1 e 2 centavos somados em ponto flutuante podem gerar 0.030000000000000002;
    // o Intl.NumberFormat deve arredondar isso para 0,03 e não travar em algo estranho.
    expect(formatMoney(3)).toBe('R$ 0,03');
  });
});

describe('parseMoneyToCents', () => {
  it('parses a plain comma-decimal value', () => {
    expect(parseMoneyToCents('10,50')).toBe(1050);
  });

  it('parses values with a thousands separator', () => {
    expect(parseMoneyToCents('1.234,56')).toBe(123456);
  });

  it('strips the currency symbol and surrounding spaces', () => {
    expect(parseMoneyToCents('R$ 10,00')).toBe(1000);
    expect(parseMoneyToCents('  10,00  ')).toBe(1000);
  });

  it('treats an empty or bare-dash input as zero', () => {
    expect(parseMoneyToCents('')).toBe(0);
    expect(parseMoneyToCents('-')).toBe(0);
    expect(parseMoneyToCents('.')).toBe(0);
  });

  it('parses negative amounts', () => {
    expect(parseMoneyToCents('-10,00')).toBe(-1000);
  });

  it('parses a value with no decimal part as whole reais', () => {
    expect(parseMoneyToCents('10')).toBe(1000);
  });

  it('throws a friendly error for non-numeric input', () => {
    expect(() => parseMoneyToCents('abc')).toThrow('Informe um valor em reais válido.');
  });

  it('FIXED: parses a dot used as a decimal separator instead of misreading it as a thousands separator', () => {
    // Teclado numérico físico ou locale do sistema em inglês pode produzir "."
    // como decimal em vez de ",". Um único ponto com 1-2 dígitos depois agora é
    // tratado como decimal, não como separador de milhar.
    expect(parseMoneyToCents('10.50')).toBe(1050);
    expect(parseMoneyToCents('10.5')).toBe(1050);
  });

  it('still treats a single dot with exactly 3 digits after it as a thousands separator', () => {
    // Dinheiro nunca tem 3+ casas decimais, então "1.234" só pode ser "mil,
    // duzentos e trinta e quatro reais", não "1 real e 234 centésimos".
    expect(parseMoneyToCents('1.234')).toBe(123400);
  });

  it('treats multiple dots as thousands separators for large numbers', () => {
    expect(parseMoneyToCents('1.234.567')).toBe(123456700);
  });

  it('parses US-style formatting (comma thousands, dot decimal) when the dot comes last', () => {
    expect(parseMoneyToCents('1,234.56')).toBe(123456);
  });

  it('parses a negative value typed with a dot decimal separator', () => {
    expect(parseMoneyToCents('-10.50')).toBe(-1050);
  });
});

describe('centsToInputValue', () => {
  it('converts cents back to a comma-decimal string', () => {
    expect(centsToInputValue(1050)).toBe('10,50');
    expect(centsToInputValue(0)).toBe('0,00');
  });

  it('round-trips through parseMoneyToCents for positive values', () => {
    expect(parseMoneyToCents(centsToInputValue(123456))).toBe(123456);
  });

  it('keeps the minus sign for negative values', () => {
    expect(centsToInputValue(-1050)).toBe('-10,50');
  });
});
