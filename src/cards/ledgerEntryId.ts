/**
 * Id de documento de um lançamento do ledger de fatura, derivado da chave de idempotência.
 *
 * ## Por que isto é um módulo próprio
 *
 * `firestore.rules` (`validInvoiceLedgerCreate`) exige **`idempotencyKey == entryId`**. Essa
 * invariante liga cliente e regra, e ficou meses quebrada sem ninguém ver porque **o teste de regras
 * montava o payload à mão com os dois iguais** (`idempotencyKey: entryId` no helper) — o teste
 * satisfazia a invariante que o cliente violava. Extrair a derivação pra cá permite que o teste de
 * regras use **a função de verdade**, e não uma versão idealizada dela.
 *
 * É o espelho do erro que a REGRA PRINCIPAL do `CLAUDE.md` descreve: lá o payload de teste era
 * simplificado *demais* e escondia regra desatualizada; aqui ele era *correto demais* e escondia
 * cliente errado. Nos dois casos o teste testava a si mesmo.
 */

/** Teto do id. Não é limite do Firestore (1500 bytes) — é o nosso, pra id continuar legível no
 *  console e caber no `sourceTransactionId` de 140 que a regra valida. */
export const MAX_LEDGER_ENTRY_ID_LENGTH = 140;

/** Hash estável e curto (FNV-1a, base36). Determinístico entre sessões, máquinas e recargas — é o
 *  que preserva a idempotência quando a chave não cabe inteira no id. */
export function shortHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * ⚠️ **`slice(140)` puro estava quebrando o pagamento de fatura** — achado ao vivo em 07/08/2026 e
 * medido nos dados reais do dono: chave de **150** caracteres, id de **140**. Dois defeitos vinham
 * do corte:
 *
 * 1. **A regra recusa a escrita**, porque `idempotencyKey != entryId`. O batch do pagamento é
 *    atômico, então o pagamento inteiro caía — e `fireWrite` engolia o erro. Pagar a fatura daquele
 *    cartão era impossível **sempre**, não às vezes.
 * 2. **Colisão silenciosa**: dois lançamentos cujas chaves só diferem depois do caractere 140
 *    truncariam pro mesmo id, e o segundo viraria "duplicata" e desapareceria. É o mesmo defeito
 *    corrigido em 23/07/2026 nos ids de estorno de antecipação — voltou por outro caminho.
 *
 * Quando não cabe, o excedente vira **hash** em vez de ser jogado fora: o id segue determinístico
 * (mesma entrada ⇒ mesmo id, que é o que idempotência exige) e volta a ser único, mantendo um
 * prefixo legível pra diagnóstico.
 */
export function idempotentEntryId(idempotencyKey: string) {
  const sanitized = idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (sanitized.length <= MAX_LEDGER_ENTRY_ID_LENGTH) return sanitized;

  const suffix = `_${shortHash(sanitized)}`;
  return sanitized.slice(0, MAX_LEDGER_ENTRY_ID_LENGTH - suffix.length) + suffix;
}
