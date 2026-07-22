import { describe, expect, it } from 'vitest';
import { buildAccountOrCardOptions, parseAccountOrCard, CARD_PREFIX } from './accountOrCardOptions';
import type { Account, CreditCard } from '../types/contracts';

function account(id: string, name: string): Account {
  return { id, workspaceId: 'ws1', name, type: 'wallet', openingBalanceCents: 0, isActive: true } as Account;
}

function card(id: string, name: string, isActive = true): CreditCard {
  return {
    id,
    workspaceId: 'ws1',
    name,
    lastFour: '1234',
    brand: 'Mastercard',
    limitCents: 100000,
    closingDay: 10,
    dueDay: 20,
    colorToken: 'card-1',
    isActive
  } as CreditCard;
}

describe('buildAccountOrCardOptions', () => {
  it('mescla contas e cartões ativos, prefixando cartões com card:', () => {
    const { accountOptions, cardOptions } = buildAccountOrCardOptions(
      [account('acct-1', 'Carteira')],
      [card('card-1', 'Nubank')]
    );

    expect(accountOptions).toEqual([expect.objectContaining({ value: 'acct-1', label: 'Carteira' })]);
    expect(cardOptions).toEqual([
      expect.objectContaining({ value: `${CARD_PREFIX}card-1`, label: 'Nubank', description: 'Cartão · Mastercard' })
    ]);
  });

  it('exclui cartões inativos', () => {
    const { cardOptions } = buildAccountOrCardOptions([], [card('card-1', 'Nubank', false)]);
    expect(cardOptions).toEqual([]);
  });
});

describe('parseAccountOrCard', () => {
  it('separa um valor de cartão prefixado', () => {
    expect(parseAccountOrCard(`${CARD_PREFIX}card-1`)).toEqual({ cardId: 'card-1' });
  });

  it('trata um valor sem prefixo como accountId', () => {
    expect(parseAccountOrCard('acct-1')).toEqual({ accountId: 'acct-1' });
  });

  it('valor vazio vira accountId e cardId undefined (nenhum dos dois escolhido)', () => {
    expect(parseAccountOrCard('')).toEqual({ accountId: undefined, cardId: undefined });
  });
});
