import { describe, expect, it } from 'vitest';
import { resolvePaymentMethod } from './resolvePaymentMethod';

describe('resolvePaymentMethod', () => {
  it('opts.cardId vence sobre o fallback (accountId ou cardId)', () => {
    expect(resolvePaymentMethod({ cardId: 'card-new' }, { accountId: 'acct-1', cardId: 'card-old' })).toEqual({
      cardId: 'card-new'
    });
  });

  it('opts.accountId vence sobre o fallback quando não há cardId em nenhum dos dois', () => {
    expect(resolvePaymentMethod({ accountId: 'acct-new' }, { accountId: 'acct-old' })).toEqual({
      accountId: 'acct-new'
    });
  });

  it('usa o fallback quando opts está vazio', () => {
    expect(resolvePaymentMethod({}, { accountId: 'acct-1' })).toEqual({ accountId: 'acct-1' });
    expect(resolvePaymentMethod({}, { cardId: 'card-1' })).toEqual({ cardId: 'card-1' });
  });

  it('nada definido em nenhum dos dois lados retorna accountId undefined', () => {
    expect(resolvePaymentMethod({}, {})).toEqual({ accountId: undefined });
  });

  it('opts.accountId vence mesmo quando o fallback tem cardId (override troca pra banco desta vez)', () => {
    // opts é um método COMPLETO — escolher pagar no banco desta vez não pode ser ignorado só
    // porque a recorrência tem um cartão salvo como padrão.
    expect(resolvePaymentMethod({ accountId: 'acct-override' }, { cardId: 'card-1' })).toEqual({
      accountId: 'acct-override'
    });
  });
});
