# Revisao de Auditoria de Integridade Financeira — Camada 2

**Data:** 2026-07-19
**Revisor:** Camada 2 (auditoria da auditoria)
**Arquivo revisado:** `docs/security/auditoria-2026-07-19/11-finance.md`

---

## Metodo

Cada achado da Camada 1 foi classificado como:

- **CONFIRMADO**: o achado procede, a analise esta correta, a severidade e adequada
- **SUBESTIMADO**: o achado e real, mas o impacto e maior do que o reportado
- **SUPERESTIMADO**: o achado e real, mas o impacto e menor do que o reportado
- **FALSO-POSITIVO**: o achado nao procede (a analise esta incorreta)

Apos a revisao dos achados, apresento **lacunas nao cobertas** pela Camada 1 — bugs de integridade financeira que o auditor nao identificou.

---

## Classificacao dos Achados da Camada 1

### FIN-01: `payBill` sem idempotencia — CONFIRMADO

**Severidade: Alta** — mantida.

O codigo em `src/finance/financeService.ts:980-1006` gera `id = createId('txn')` a cada chamada. Nao ha chave deterministica. Duas chamadas geram duas transacoes distintas e debitam a conta duas vezes via `increment()` no mesmo batch da transacao.

A regra `validBillUpdate` (`firestore.rules:620`) nao impede transicao `paid -> paid`. Confirmado pela leitura da regra: `status in ['pending', 'paid', 'overdue', 'cancelled']` sem verificacao de estado anterior.

**Observacao adicional**: a solucao sugerida (ID deterministico derivado de `(bill.id, userId, dueDate)`) quebraria o cenario de pagamento com valor diferente do original (`payBill` aceita `opts.amountCents`). Se o usuario pagar R$100 num dia e R$50 no outro (parcial), o ID deterministico rejeitaria o segundo. Melhor usar chave composta incluindo o valor ou usar um token de idempotencia separado. Nao invalida o achado, apenas a solucao sugerida merece refinamento.

---

### FIN-02: `markReceivableReceived` sem idempotencia — CONFIRMADO

**Severidade: Alta** — mantida.

Mesmo padrao de FIN-01. `src/finance/financeService.ts:913-938` gera `createId('txn')` a cada chamada. A regra `validReceivableUpdate` (`firestore.rules:676`) permite `received -> received`.

Confirmado.

---

### FIN-03: `recordInvoicePayment` sem idempotencia — CONFIRMADO

**Severidade: Alta** — mantida.

`src/cards/cardService.ts:451-506`: `transactionId = createId('txn')` e `idempotencyKey` derivado do `transactionId` aleatorio. Duas chamadas geram duas entradas de ledger distintas e duas transacoes `card_payment`.

Alem do impacto financeiro (conta debitada duas vezes), a Cloud Function `onInvoiceLedgerEntryCreated` tambem contabilizaria o pagamento em dobro nos totais da fatura (`paymentsTotalCents`), distorcendo o saldo da fatura.

Confirmado.

---

### FIN-04: `createTransaction` sem protecao de idempotencia — CONFIRMADO

**Severidade: Media** — mantida.

`src/finance/financeService.ts:187-223`: gera `id = createId('txn')` a cada chamada. O campo `clientMutationId` replica o `transactionId` e a regra `validTransactionCreate` exige `clientMutationId == transactionId`, mas isso so evita falsificacao, nao repeticoes.

A probabilidade de duplicata e menor que FIN-01/FIN-02 porque cada transacao e semanticamente unica para o usuario. Mas retry de rede apos timeout poderia gerar duplicata. Severidade Media e adequada.

Confirmado.

---

### FIN-05: Sincronia dos 14 `InvoiceLedgerEntryType` — CONFIRMADO

**Severidade: Informativa** — mantida.

Auditei os tres pontos de sincronia:

1. `src/types/contracts.ts:28` — enum TypeScript com 14 valores
2. `functions/src/cards/invoiceTotals.ts:5-19` — mesmo enum, bucketizado em debitTypes, feeTypes, paymentTypes, creditTypes, mais `installment_anticipation` (debit) e `installment_anticipation_credit` (credit)
3. `firestore.rules:311` — funcao `validInvoiceLedgerEntryType` com os 14 valores

Bucketizacao em `invoiceTotalsDeltaForEntry`:
- `debitTypes` (`purchase`, `manual_debit`): `purchasesTotalCents`
- `installment_anticipation` (catch explicito): `purchasesTotalCents`
- `installment_anticipation_credit` (catch explicito): `creditsTotalCents`
- `creditTypes` (`refund_credit`, `chargeback_credit`, `manual_credit`, `purchase_reversal`): `creditsTotalCents`
- `feeTypes` (`interest`, `fine`, `iof`, `fee`): `feesTotalCents`
- `paymentTypes` (`payment`, `advance_payment`): `paymentsTotalCents`

Nenhum tipo cai no `return zero` final. Confirmado.

---

### FIN-06: Centavos inteiros — CONFIRMADO

**Severidade: Informativa** — mantida.

`moneyCentsSchema` em `src/finance/financeSchemas.ts:14-18`: `z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)`. `signedMoneyCentsSchema` permite negativo para `openingBalanceCents`. `installmentAmounts` usa `Math.floor` + resto. `transactionAccountEffects` retorna inteiros. Confirmado.

**Observacao adicional**: o schema permite `amountCents = 0` (`min(0)`, nao `min(1)`). Transacoes com valor zero sao tecnicamente validas, o que poderia levar a entradas de ledger com valor zero (ver GAP-D abaixo). Nao invalida o achado, mas e uma observacao de edge case.

---

### FIN-07: `adjustment` unidirecional — CONFIRMADO

**Severidade: Baixa** — mantida.

`transactionAccountEffects` em `src/finance/financeCalculations.ts:118-120` retorna `deltaCents = +transaction.amountCents` para `type === 'adjustment'`. `moneyCentsSchema` tem `min(0)`, entao `adjustment` sempre adiciona saldo. Para reduzir saldo, o usuario precisa usar `expense`.

Isso e uma limitacao de design, nao um bug. Confirmado.

---

### FIN-08: Saldo incremental via `FieldValue.increment()` — CONFIRMADO

**Severidade: Informativa** — mantida.

`applyAccountEffectsToBatch` em `src/finance/financeService.ts:67-78` usa `increment(effect.deltaCents)`. Todas as operacoes de escrita que afetam saldo passam por aqui, no mesmo batch da operacao que as originou. `increment()` e atomico no servidor e funciona offline. Confirmado.

---

### FIN-09: Transferencias atomicas — CONFIRMADO

**Severidade: Informativa** — mantida.

`transactionAccountEffects` para `type === 'transfer'` retorna dois efeitos (origem negativo, destino positivo), ambos aplicados no mesmo batch por `applyAccountEffectsToBatch`. A regra `validTransactionAccounts` exige que ambas as contas existam e sejam diferentes.

O cenario de falha (conta excluida entre a leitura e a escrita) e mitigado pela atomicidade do batch: o batch inteiro falha se uma das contas nao existir. Confirmado.

---

### FIN-10: `reverseCardPurchaseOnDelete` + `onInvoiceLedgerEntryCreated` — CONFIRMADO, com LACUNA

**Severidade: Informativa** — **SUBESTIMADO**. Ha uma lacuna nao reportada (ver GAP-A abaixo).

O fluxo descrito esta correto:
1. `softDeleteTransaction` marca `deletedAt`
2. `reverseCardPurchaseOnDelete` (trigger `onDocumentUpdated`) cria `purchase_reversal`
3. `onInvoiceLedgerEntryCreated` (trigger `onDocumentCreated`) incrementa `creditsTotalCents`
4. Cliente filtra entries com `sourceTransactionId` da transacao excluida

A observacao sobre risco de falha do trigger (timeout, crash) e correta. O retry padrao do Firestore Functions mitiga, mas nao elimina.

**Lacuna nao reportada**: se as entradas de ledger da compra ainda nao tiverem sincronizado com o servidor no momento em que o trigger rodar, a `collectionGroup` query nao as encontra e nenhuma reversao e criada. Detalhado em GAP-A.

---

### FIN-11: `signedCharge` vs `calculateInvoice` — CONFIRMADO

**Severidade: Informativa** — mantida.

`purchase_reversal` nao esta em `cardChargeTypes` nem `cardCreditTypes` em `spendingAnalysis.ts:20-35`. `signedCharge` retorna 0 para `purchase_reversal`. Isso e intencional e correto: quando uma compra e excluida, tanto o `purchase` original quanto o `purchase_reversal` sao filtrados por `sourceTransactionId` em `useInvoiceLedger`. Confirmado.

---

### FIN-12: `sourceTransactionId` como string vazia — CONFIRMADO

**Severidade: Informativa** — mantida.

`ledgerPayload` em `cardService.ts:155` define `sourceTransactionId: input.sourceTransactionId ?? ''`. O filtro em `useInvoiceLedger.ts:129` usa `!entry.sourceTransactionId` — `!''` = `true`, entao entradas sem `sourceTransactionId` sao mantidas. Comportamento correto. Confirmado.

---

### FIN-13: `currentAccountBalances` fallback para `openingBalanceCents` — CONFIRMADO

**Severidade: Informativa** — mantida.

`currentAccountBalances` em `financeCalculations.ts:151-156` usa `account.currentBalanceCents ?? account.openingBalanceCents`. Contas criadas antes do backfill de `currentBalanceCents` reportam o saldo de abertura, que pode estar drasticamente incorreto. Confirmado.

---

### FIN-14: `sharedService.ts` sem efeitos de conta — CONFIRMADO

**Severidade: Informativa** — mantida.

SharedExpenseClaims e Settlements nao movem dinheiro real — apenas rastreiam dividas/divisoes. Auditado: nenhuma chamada a `applyAccountEffectsToBatch` em `sharedService.ts`. Confirmado.

---

## Lacunas Nao Cobertas pela Camada 1

### GAP-A: `reverseCardPurchaseOnDelete` — reversao parcial se ledger ainda nao sincronizou

**Severidade: Media**
**Local:** `functions/src/cards/reverseCardPurchaseOnDelete.ts:41-45`

**Descricao:**
A funcao usa `collectionGroup('ledger')` para encontrar as entradas de ledger da compra excluida. Se o usuario excluir a compra antes das entradas de ledger sincronizarem com o servidor (cenario: criou a compra offline, deletou ainda offline, depois sincronizou tudo junto), o trigger `onDocumentUpdated` dispara quando `deletedAt` e escrito no servidor. Nesse momento, as entradas de ledger podem ou nao estar no servidor — a ordem de sincronizacao entre o batch de criacao e o batch de exclusao nao e deterministica.

Se as entradas de ledger ainda nao estiverem no servidor quando a query rodar, o resultado e `ledgerSnap.empty`, e nenhuma reversao e criada. As entradas de ledger permanecem como `purchase` sem `purchase_reversal` correspondente. Os totais da fatura ficam permanentemente inflados.

**Cenario concreto:**
1. Usuario cria compra parcelada no cartao (offline)
2. Batch de criacao (transacao + N entradas de ledger) fica pendente no cache local
3. Usuario imediatamente exclui a transacao (ainda offline)
4. `softDeleteTransaction` marca `deletedAt` — batch de exclusao fica pendente
5. Conexao volta — Firestore SDK envia os batches na ordem
6. `onDocumentUpdated` dispara para a exclusao
7. `collectionGroup('ledger')` query executa — entradas de ledger podem ja estar no ar ou nao
8. Se nao estiverem: `ledgerSnap.empty` = true, zero reversoes criadas

**Por que a Camada 1 nao viu:** o fluxo assume que as entradas de ledger ja existem no servidor quando o trigger roda. Em operacao normal (criacao online, exclusao depois), isso e verdade. O cenario offline-e-depois-online e uma edge case.

**Mitigacao possivel:** alem do trigger de exclusao, adicionar um trigger de criacao de ledger que verifica se a transacao de origem ja foi excluida (`deletedAt` presente). Ou executar um job de reconciliacao periodica.

---

### GAP-B: `updateBillStatus` permite transicao `pending -> overdue` apos `payBill` — corrida entre `markOverdueBills` e pagamento

**Severidade: Baixa**
**Local:** `src/finance/financeService.ts:591-597`, `src/finance/useFinanceData.ts:263`

**Descricao:**
`markOverdueBills` e chamado a cada snapshot de `subscribeBills`. Se uma conta estiver `pending` e vencida, marca como `overdue`. O problema: a chamada a `updateDoc` nao e atomica nem serializada com `payBill`.

Se o usuario paga uma conta vencida (`payBill` → status `paid`) e `markOverdueBills` roda concorrentemente com dados ligeiramente dessincronizados, pode ocorrer:

1. Snapshot A (antes do pagamento): bill = `{status: 'pending'}` 
2. `payBill`: escreve `{status: 'paid'}` + cria transacao
3. `markOverdueBills` (com dados do Snapshot A, antes do sync): escreve `{status: 'overdue'}`
4. Ultimo escritor vence → bill fica `overdue` no servidor

**Impacto:** a transacao de pagamento existe (conta debitada, dinheiro movimentado corretamente), mas a bill mostra `overdue` em vez de `paid`. O usuario pode tentar pagar de novo. Nao ha dano financeiro direto, mas a experiencia e enganosa.

**Probabilidade:** baixa. `markOverdueBills` executa dentro do callback do snapshot, que inclui `includeMetadataChanges: true`. O snapshot reflete o estado local com as escritas pendentes de `payBill` (bill = `paid`), entao o filtro `status === 'pending'` normalmente exclui a bill ja paga. A corrida so acontece se a execucao de `markOverdueBills` usar dados de um snapshot anterior ao `payBill`.

**Observacao:** mesmo padrao se aplica a `markClosedInvoices` (`src/cards/useCardsData.ts:116`) com `closeInvoice`.

---

### GAP-C: `generateRecurrences` — regras sem `accountId` geram loop infinito de leituras

**Severidade: Baixa**
**Local:** `functions/src/automation.ts:188-190`

**Descricao:**
Em `generateRecurrences`, se uma regra de recorr^encia tem `amountCents` definido (truthy) mas `accountId` e `null`/`undefined`, o codigo faz `continue` sem avancar `nextOccurrenceAt`:

```ts
if (!rule.accountId) continue;
```

Isso significa que a mesma regra sera encontrada novamente no dia seguinte (`nextOccurrenceAt <= now` continua verdadeiro), processada, ignorada novamente — um loop infinito de queries e log `skipped++` todo dia.

**Impacto:** nenhum dano financeiro. Mas:
- Uma leitura desnecessaria por dia por regra sem conta
- Logs inchados com `skipped`
- Nao ha saida a menos que o usuario edite a regra e adicione uma conta

---

### GAP-D: `installmentAmounts` pode gerar entradas de ledger com valor zero

**Severidade: Baixa**
**Local:** `src/cards/cardService.ts:93-98`

**Descricao:**
`installmentAmounts` distribui `totalCents` por N parcelas usando `Math.floor` + resto. Se `totalCents` for muito pequeno em relacao ao numero de parcelas (ex.: 1 centavo em 3 parcelas), o resultado e `[1, 0, 0]` — duas parcelas com valor zero.

`createCardPurchaseSchema` valida `amountCents: moneyCentsSchema` (`min(0)`), entao zero e aceito. A parcela zero cria uma entrada de ledger com `amountCents: 0`. A Cloud Function `onInvoiceLedgerEntryCreated` adiciona 0 aos totais (inofensivo). Mas:
- Entradas de ledger com valor zero poluem a UI
- Derivam do schema permitir `min(0)` em vez de `min(1)` (improbavel mas possivel)

**Exemplo:** `createCardPurchase({ amountCents: 2, installments: 3 })` → `installmentAmounts(2, 3)` → `[1, 1, 0]`. A terceira parcela tem valor zero.

**Probabilidade:** muito baixa em producao (minimo viavel em BRL e R$ 0,01 = 1 centavo, e ninguem parcelaria 1 centavo em 3 vezes). Mas o schema nao impede.

---

### GAP-E: `closeInvoice` sem verificacao de versao

**Severidade: Informativa**
**Local:** `src/cards/cardService.ts:420-424`

**Descricao:**
`closeInvoice` escreve `{status: 'closed', updatedAt: ...}` sem usar `version` no Firestore (nem leer nem verificar). O documento `Invoice` tem campo `version`. A Cloud Function `closeInvoicesDue` (scheduler) e o callback `markClosedInvoices` (cliente) podem escrever concorrentemente.

Ambos escrevem o mesmo valor (`status: 'closed'`), entao nao ha divergencia de dados. Mas se no futuro `closeInvoice` for modificada para fazer mais do que so mudar o status (ex.: recalcular saldo), a ausencia de controle de concorrencia poderia causar perda de atualizacao.

---

### GAP-F: `updateBillStatus` aceita qualquer transicao de estado — complementa FIN-01

**Severidade: Media** (como complemento de FIN-01/FIN-02)
**Local:** `firestore.rules:620-643`, `src/finance/financeService.ts:582-586`

**Descricao:**
A regra `validBillUpdate` nao implementa uma maquina de estados. Qualquer transicao entre `pending`, `paid`, `overdue`, `cancelled` e permitida, inclusive `paid -> paid` e `cancelled -> paid`.

Da mesma forma, `validReceivableUpdate` permite `received -> received`.

Se `validBillUpdate` exigisse que a transicao fosse de um estado valido (ex.: so `pending -> paid`, nunca `paid -> paid`), isso serviria como defesa em profundidade para FIN-01: mesmo que `payBill` fosse chamada duas vezes, a segunda chamada teria o batch rejeitado pelas regras porque o bill ja esta `paid`.

**Nota:** a regra nao precisa de versao (o estado do documento e suficiente), entao seria uma camada de protecao mais simples do que adicionar versao a bills.

---

### GAP-G: `coupleGoalDeposit` e `coupleGoalWithdraw` sem validacao de schema

**Severidade: Baixa**
**Local:** `src/finance/financeService.ts:304-422`

**Descricao:**
`coupleGoalDeposit` e `coupleGoalWithdraw` aceitam `amountCents: number` sem passar por schema Zod. Nao ha validacao de que `amountCents` e inteiro, positivo (para deposito), ou dentro dos limites.

Se um caller passar `amountCents: -500` em `coupleGoalDeposit`:
- `savedCents: increment(-500)` — reduz o saldo da meta (comportamento de saque, nao deposito)
- No workspace pessoal: transacao do tipo `expense` com `amountCents: 500` (valor absoluto via magnitude) — mas o increment reduz, nao aumenta

Felizmente, os unicos callers sao funcoes internas que ja tratam o valor corretamente. Mas a falta de validacao schema-level significa que um bug em um caller futuro poderia passar valores incorretos sem deteccao.

---

### GAP-H: `updateTransaction` com `previous` estale — reversao de efeitos incorreta se dados desatualizados

**Severidade: Baixa**
**Local:** `src/finance/financeService.ts:518-558`

**Descricao:**
`updateTransaction` recebe `previous` como parametro do caller (o estado anterior da transacao). Se o caller passar um `previous` desatualizado (ex.: `accountId` errado porque o snapshot local ainda nao refletiu uma edicao anterior), os efeitos revertidos serao incorretos:

```ts
mergeAccountEffects(
  invertAccountEffects(transactionAccountEffects(previous)), // reverte baseado no previous passado
  transactionAccountEffects(parsed)                          // aplica o novo
)
```

Se `previous.accountId` for `'A'` mas o documento no Firestore tem `accountId: 'B'`:
- Reverte efeitos de `'A'`: credita R$X em `'A'`
- Aplica novos efeitos em `parsed.accountId`: debita R$Y de `newAccount`
- `'A'` fica com saldo inflado artificialmente (nunca foi debitado de fato)
- `'B'` fica com saldo pendurado (o debito original nunca foi revertido)

**Probabilidade:** baixa. O `previous` vem do snapshot local (`useFinanceData`), que e mantido atualizado via `onSnapshot`. Mas em cenarios de edicao concorrente (dois abas, ou edicao enquanto offline e o snapshot atrasou), o `previous` pode ficar desatualizado.

**Mitigacao:** ler o documento atual do Firestore (`getDoc`) antes de editar, ou usar transacao do lado do servidor. O custo seria 1 leitura extra por edicao.

---

## Resumo de Classificacoes

| ID | Titulo | Severidade (original) | Classificacao |
|---|---|---|---|
| FIN-01 | `payBill` sem idempotencia | Alta | CONFIRMADO |
| FIN-02 | `markReceivableReceived` sem idempotencia | Alta | CONFIRMADO |
| FIN-03 | `recordInvoicePayment` sem idempotencia | Alta | CONFIRMADO |
| FIN-04 | `createTransaction` sem protecao de idempotencia | Media | CONFIRMADO |
| FIN-05 | Sincronia dos 14 InvoiceLedgerEntryType | Info | CONFIRMADO |
| FIN-06 | Centavos inteiros consistente | Info | CONFIRMADO |
| FIN-07 | `adjustment` unidirecional | Baixa | CONFIRMADO |
| FIN-08 | Saldo incremental via `increment()` | Info | CONFIRMADO |
| FIN-09 | Transferencias atomicas | Info | CONFIRMADO |
| FIN-10 | `reverseCardPurchaseOnDelete` chain | Info | CONFIRMADO, **mas SUBESTIMADO** (ver GAP-A) |
| FIN-11 | `signedCharge` vs `calculateInvoice` | Info | CONFIRMADO |
| FIN-12 | `sourceTransactionId` string vazia | Info | CONFIRMADO |
| FIN-13 | Fallback `currentBalanceCents` | Info | CONFIRMADO |
| FIN-14 | sharedService sem efeitos | Info | CONFIRMADO |

| ID | Titulo | Severidade | Tipo |
|---|---|---|---|
| GAP-A | `reverseCardPurchaseOnDelete` + ledger offline | Media | Lacuna |
| GAP-B | `markOverdueBills` race com `payBill` | Baixa | Lacuna |
| GAP-C | `generateRecurrences` loop sem accountId | Baixa | Lacuna |
| GAP-D | `installmentAmounts` gera parcelas zero | Baixa | Lacuna |
| GAP-E | `closeInvoice` sem versao | Info | Lacuna |
| GAP-F | `updateBillStatus` sem maquina de estados | Media | Lacuna (complementar) |
| GAP-G | `coupleGoalDeposit`/`Withdraw` sem schema | Baixa | Lacuna |
| GAP-H | `updateTransaction` com `previous` estale | Baixa | Lacuna |

---

## Conclusao

A auditoria da Camada 1 foi **satisfatoria e correta** para 13 dos 14 achados. A classificacao FIN-10 merece atencao: o fluxo descrito esta correto para operacao online, mas a lacuna offline (GAP-A) nao foi identificada e torna o risco maior do que o reportado ("Informativa").

Os tres achados de severidade Alta (FIN-01, FIN-02, FIN-03) sao reais e compartilham a mesma causa raiz: ausencia de chave de idempotencia. A Camada 2 acrescenta a observacao de que a defesa em profundidade (GAP-F — maquina de estados nas regras do Firestore) poderia mitigar parte do risco mesmo sem a solucao completa.

As lacunas encontradas pela Camada 2 sao predominantemente de severidade Baixa ou Media, com excecao de GAP-A (Media) que tem potencial de corromper permanentemente os totais de fatura em um cenario de offline seguido de sync.
