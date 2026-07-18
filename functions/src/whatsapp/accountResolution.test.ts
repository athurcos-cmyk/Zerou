import { describe, expect, it } from 'vitest';
import { accountCandidates, resolveDebitCreditAccount, resolveTransferSide, type AccountRow } from './accountResolution.js';

const nubank: AccountRow = { id: 'acc_nubank', name: 'Nubank', isPrimary: false };
const itau: AccountRow = { id: 'acc_itau', name: 'Itaú', isPrimary: false };
const carteira: AccountRow = { id: 'acc_carteira', name: 'Carteira', isPrimary: false };

describe('resolveDebitCreditAccount', () => {
  it('prioriza a conta casada por nome na mensagem', () => {
    const accounts = [{ ...nubank, isPrimary: true }, itau];
    expect(resolveDebitCreditAccount('acc_itau', accounts)).toBe('acc_itau');
  });

  it('cai pra conta principal quando a mensagem nao identifica conta', () => {
    const accounts = [nubank, { ...itau, isPrimary: true }, carteira];
    expect(resolveDebitCreditAccount(null, accounts)).toBe('acc_itau');
  });

  it('cai pra unica conta ativa quando nao ha principal marcada', () => {
    expect(resolveDebitCreditAccount(null, [nubank])).toBe('acc_nubank');
  });

  it('retorna null quando ha ambiguidade real (2+ contas, nenhuma principal, nenhuma citada)', () => {
    expect(resolveDebitCreditAccount(null, [nubank, itau])).toBeNull();
  });
});

describe('resolveTransferSide', () => {
  it('prioriza o match explicito mesmo se bater com a conta principal de outra pessoa', () => {
    const accounts = [{ ...nubank, isPrimary: true }, itau];
    expect(resolveTransferSide('acc_itau', accounts, 'acc_nubank')).toBe('acc_itau');
  });

  it('nunca sugere a mesma conta que ja foi resolvida do outro lado', () => {
    const accounts = [{ ...nubank, isPrimary: true }, itau];
    // Nubank e principal, mas ja e a origem -> destino cai pro Itau (unica sobrando), nao pro Nubank de novo.
    expect(resolveTransferSide(null, accounts, 'acc_nubank')).toBe('acc_itau');
  });

  it('cai pra principal entre as contas restantes quando disponivel', () => {
    const accounts = [nubank, { ...itau, isPrimary: true }, carteira];
    expect(resolveTransferSide(null, accounts, 'acc_carteira')).toBe('acc_itau');
  });

  it('retorna null quando sobra mais de uma candidata sem principal', () => {
    const accounts = [nubank, itau, carteira];
    expect(resolveTransferSide(null, accounts, 'acc_carteira')).toBeNull();
  });
});

describe('accountCandidates', () => {
  it('mapeia contas pra candidatos, excluindo o id informado', () => {
    expect(accountCandidates([nubank, itau, carteira], 'acc_itau')).toEqual([
      { id: 'acc_nubank', label: 'Nubank' },
      { id: 'acc_carteira', label: 'Carteira' },
    ]);
  });

  it('sem exclusao, retorna todas as contas', () => {
    expect(accountCandidates([nubank, itau])).toEqual([
      { id: 'acc_nubank', label: 'Nubank' },
      { id: 'acc_itau', label: 'Itaú' },
    ]);
  });
});
