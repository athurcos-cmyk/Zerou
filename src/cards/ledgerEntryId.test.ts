import { describe, expect, it } from 'vitest';
import { MAX_LEDGER_ENTRY_ID_LENGTH, idempotentEntryId } from './ledgerEntryId';

describe('idempotentEntryId', () => {
  it('sanitiza caractere inválido pra id de documento', () => {
    expect(idempotentEntryId('a/b c:d')).toBe('a_b_c_d');
  });

  it('devolve a chave intacta quando ela cabe', () => {
    expect(idempotentEntryId('card_1_2026-06_payment')).toBe('card_1_2026-06_payment');
  });

  it('nunca passa do teto', () => {
    expect(idempotentEntryId('z'.repeat(500)).length).toBeLessThanOrEqual(MAX_LEDGER_ENTRY_ID_LENGTH);
  });

  it('é determinístico — mesma chave, mesmo id', () => {
    const chave = `${'x'.repeat(200)}_payment`;
    expect(idempotentEntryId(chave)).toBe(idempotentEntryId(chave));
  });

  // ⚠️ ESTE é o teste de regressão do bug de 07/08/2026. Com `slice(140)` puro, duas chaves que só
  // diferem DEPOIS do caractere 140 truncavam pro MESMO id: o segundo lançamento virava "duplicata"
  // e desaparecia em silêncio. Era o mesmo defeito já corrigido em 23/07 nos ids de estorno de
  // antecipação, voltando por outro caminho. Falha se alguém trocar o hash por corte de novo.
  it('duas chaves que diferem só depois do teto geram ids DIFERENTES', () => {
    const prefixo = 'p'.repeat(160);
    const a = idempotentEntryId(`${prefixo}_pagamento_de_10000`);
    const b = idempotentEntryId(`${prefixo}_pagamento_de_99999`);

    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(MAX_LEDGER_ENTRY_ID_LENGTH);
    expect(b.length).toBeLessThanOrEqual(MAX_LEDGER_ENTRY_ID_LENGTH);
  });

  it('mantém um prefixo legível pra diagnóstico no console do Firebase', () => {
    const id = idempotentEntryId(`card_abc_invoice_2026-06_${'z'.repeat(200)}_payment`);
    expect(id.startsWith('card_abc_invoice_2026-06_')).toBe(true);
  });
});
