# Auditoria de Integridade Financeira

**Data:** 2026-07-19
**Escopo:** `financeService.ts`, `financeCalculations.ts`, `spendingAnalysis.ts`, `dashboardViewCache.ts`, `cardService.ts`, `anticipation.ts`, `useCardsData.ts`, `useInvoiceLedger.ts`, `contracts.ts`, `invoiceTotals.ts`, `accountEffects.ts`, `reverseCardPurchaseOnDelete.ts`, `sharedService.ts`, `financeSchemas.ts`, `cardSchemas.ts`, `firestore.rules`

---

## FIN-01: `payBill` sem idempotência — chamada duplicada cria despesa extra

**Severidade:** Alta
**Local:** `src/finance/financeService.ts:980`

**Descrição:**
A função `payBill` cria um novo `id = createId('txn')` a cada chamada e usa `fireWrite(batch.commit())`. Se `payBill` for chamada duas vezes para a mesma conta (duplo clique, retry automático após timeout, etc.), dois batches são cometidos, cada um criando uma transação de despesa distinta e debitando `currentBalanceCents` da conta duas vezes por `FieldValue.increment()`.

A regra `validBillUpdate` (`firestore.rules:620`) não impede transições `paid → paid`, então a segunda chamada atualiza o status da conta para `paid` sem erro. A transação da segunda chamada tem ID aleatório diferente, então `validTransactionCreate` passa.

**Impacto:**
O usuário paga a mesma conta duas vezes. O saldo da conta é debitado em dobro. O valor sai do Disponível duas vezes.

**Solução sugerida:**
Usar ID determinístico para a transação de pagamento, similar a `recurringOccurrenceTransactionId`. Derivar de `(bill.id, userId, dueDate)` ou similar, para que a segunda chamada sobrescreva a mesma transação em vez de criar uma nova. Como a transação já existiria, a segunda chamada cairia em `validTransactionUpdate` (que exige `version == resource.data.version + 1`), e o batch inteiro seria rejeitado — protegendo a conta de débito duplicado.

**Confiança:** 10

---

## FIN-02: `markReceivableReceived` sem idempotência — chamada duplicada cria receita extra

**Severidade:** Alta
**Local:** `src/finance/financeService.ts:913`

**Descrição:**
Mesmo padrão de `FIN-01`. `markReceivableReceived` cria `id = createId('txn')` a cada chamada. Duas chamadas geram duas transações `income` e creditam a conta duas vezes via `FieldValue.increment()`.

A regra `validReceivableUpdate` (`firestore.rules:676`) permite transição `received → received`.

**Impacto:**
Usuário registra o mesmo recebimento duas vezes. Saldo da conta creditado em dobro. Disponível inflado.

**Solução sugerida:**
ID determinístico para a transação de recebimento, derivado de `(receivable.id, userId)`, mesma abordagem de FIN-01.

**Confiança:** 10

---

## FIN-03: `recordInvoicePayment` sem idempotência — pagamento de fatura duplicado

**Severidade:** Alta
**Local:** `src/cards/cardService.ts:451`

**Descrição:**
Cada chamada de `recordInvoicePayment` gera `transactionId = createId('txn')` e `idempotencyKey = `${transactionId}_payment``. A entrada de ledger tem id derivado da idempotencyKey. Como o `transactionId` é aleatório, duas chamadas geram duas entradas de ledger diferentes e duas transações `card_payment` diferentes. A conta de débito é debitada duas vezes.

**Impacto:**
Pagamento da fatura registrado em dobro. Saldo da conta debitado duas vezes. A fatura fica com 2 pagamentos no ledger. O Outstanding Balance da fatura fica incorreto (crédito extra de `paymentsTotalCents`).

**Solução sugerida:**
Idempotência por invoice + amount + effectiveAt. Derivar o `transactionId` da invoice (determinístico), em vez de randômico. Ou usar uma collection de idempotency tokens separada.

**Confiança:** 10

---

## FIN-04: `createTransaction` sem proteção de idempotência

**Severidade:** Média
**Local:** `src/finance/financeService.ts:187`

**Descrição:**
`createTransaction` define `clientMutationId: id` onde `id = createId('txn')`. O campo `clientMutationId` existe no schema e na regra (`validTransactionCreate` verifica `clientMutationId == transactionId`), mas serve apenas para garantir que o campo não seja falsificado — não previne duplicatas. Cada chamada gera um ID de documento único.

Diferente de FIN-01 e FIN-02, a probabilidade de chamada duplicada é menor porque cada transação é semanticamente única (descrição, valor, data). Mas em cenários de retry de rede, a transação poderia ser criada duas vezes pelo usuário sem perceber.

**Impacto:**
Menor que FIN-01/FIN-02, pois cada transação é semanticamente diferente. Ainda assim, mecanismo de idempotência não seria caro e quebraria a simetria com `recordRecurringPayment` que usa ID determinístico.

**Solução sugerida:**
Se o caller tiver um `clientMutationId` próprio, usá-lo como ID do documento. Ou criar um padrão de idempotência usando `getDoc` antes de escrever (com `await` — que é permitido: ver REGRA PRINCIPAL no CLAUDE.md — escritas subsequentes continuam fire-and-forget).

**Confiança:** 7

---

## FIN-05: Sincronia dos 14 `InvoiceLedgerEntryType` confirmada nos 3 lugares

**Severidade:** Informativa
**Local:** `src/types/contracts.ts:28`, `firestore.rules:311`, `functions/src/cards/invoiceTotals.ts:5`

**Descrição:**
Auditoria manual dos 14 valores de `InvoiceLedgerEntryType`:

| # | Valor | contracts.ts | firestore.rules | invoiceTotals.ts |
|---|---|---|---|---|
| 1 | purchase | sim | sim | sim (debitTypes) |
| 2 | payment | sim | sim | sim (paymentTypes) |
| 3 | advance_payment | sim | sim | sim (paymentTypes) |
| 4 | refund_credit | sim | sim | sim (creditTypes) |
| 5 | chargeback_credit | sim | sim | sim (creditTypes) |
| 6 | manual_credit | sim | sim | sim (creditTypes) |
| 7 | manual_debit | sim | sim | sim (debitTypes) |
| 8 | interest | sim | sim | sim (feeTypes) |
| 9 | fine | sim | sim | sim (feeTypes) |
| 10 | iof | sim | sim | sim (feeTypes) |
| 11 | fee | sim | sim | sim (feeTypes) |
| 12 | installment_anticipation | sim | sim | sim (catch explícito) |
| 13 | installment_anticipation_credit | sim | sim | sim (catch explícito) |
| 14 | purchase_reversal | sim | sim | sim (creditTypes) |

Bucketização no `invoiceTotalsDeltaForEntry`:

| Destino | Tipos |
|---|---|
| `purchasesTotalCents` | purchase, manual_debit, installment_anticipation |
| `paymentsTotalCents` | payment, advance_payment |
| `creditsTotalCents` | refund_credit, chargeback_credit, manual_credit, purchase_reversal, **installment_anticipation_credit** |
| `feesTotalCents` | interest, fine, iof, fee |

Fórmula de saldo (`outstandingFromTotals`):
```
rawBalance = purchasesTotalCents + feesTotalCents - paymentsTotalCents - creditsTotalCents
outstandingBalanceCents = max(rawBalance, 0)
overpaidCreditCents = max(-rawBalance, 0)
```

Todos os 14 tipos estão sincronizados. Nenhum tipo cairia no `return zero` final de `invoiceTotalsDeltaForEntry`.

**Testes existentes:** Teste de regressão para `installment_anticipation_credit` em `firestore.rules.test.ts:1283`. Teste de `purchase_reversal` indiretamente coberto pelo fluxo de exclusão.

**Confiança:** 10

---

## FIN-06: Centavos inteiros — consistente em toda a stack

**Severidade:** Informativa
**Local:** `src/finance/money.ts`, `src/finance/financeSchemas.ts`, `src/cards/cardSchemas.ts`

**Descrição:**
- `moneyCentsSchema`: `z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)` — força inteiro, sem sinal
- `signedMoneyCentsSchema`: mesma coisa, mas permite negativo (usado só em `openingBalanceCents`)
- `formatMoney(amountCents)`: `BRL_FORMATTER.format(amountCents / 100)` — sempre divide por 100
- `parseMoneyToCents`: multiplica string por 100 e aplica `Math.round` — sem ponto flutuante
- `installmentAmounts(totalCents, installments)`: usa `Math.floor` + resto, sem divisão de ponto flutuante. Exemplo: 1000 centavos / 3 parcelas → [334, 333, 333] = 1000
- `transactionAccountEffects`: retorna `deltaCents` como inteiro (não divide por 100)

Nenhum ponto de introdução de float encontrado. Todos os cálculos operam em inteiros.

**Confiança:** 10

---

## FIN-07: `adjustment` é unidirecional — sempre adiciona ao saldo

**Severidade:** Baixa
**Local:** `src/finance/financeCalculations.ts:118`, `src/finance/financeSchemas.ts:14`

**Descrição:**
Em `transactionAccountEffects`, o tipo `adjustment` retorna `deltaCents = +transaction.amountCents`. O `createTransactionSchema` usa `moneyCentsSchema` (min: 0), então `amountCents` é sempre >= 0. Consequentemente, ajustes sempre aumentam o saldo da conta.

Não existe mecanismo para criar um ajuste negativo (diminuir saldo) via `adjustment`. Para diminuir, o usuário precisaria usar `expense`.

**Impacto:**
Limitação de design, não um bug propriamente dito. Um ajuste corretivo que devesse reduzir saldo (ex.: "lançou R$100 a mais sem querer") não tem representação semântica própria.

**Confiança:** 10

---

## FIN-08: Saldo incremental via `FieldValue.increment()` — atômico e offline-safe

**Severidade:** Informativa
**Local:** `src/finance/financeService.ts:67`, `src/finance/financeService.ts:219`

**Descrição:**
`applyAccountEffectsToBatch` usa `increment(effect.deltaCents)` para atualizar `currentBalanceCents`. O `increment()` é atômico no servidor Firestore e também funciona offline (o SDK gerencia conflitos). Todas as escritas que afetam saldo passam por esta função:

- `createTransaction`
- `updateTransaction` (reverte efeito antigo + aplica novo via `mergeAccountEffects`)
- `softDeleteTransaction` (reverte efeito via `invertAccountEffects`)
- `payBill`
- `markReceivableReceived`
- `recordRecurringPayment`
- `recordInvoicePayment`
- `coupleGoalDeposit` / `coupleGoalWithdraw` / `deleteGoalWithRefund` / `contributeToGoalWithTransaction`

Cada escrita está no mesmo batch da transação que a originou, garantindo atomicidade local.

**IMPORTANTE:** O `increment()` é server-side. Quando offline, o SDK aplica o delta localmente, e na reconexão o servidor recalcula a partir do último valor confirmado. O SD韓 faz merge correto de múltiplos `increment()` offline. Não há risco de double-apply.

**Confiança:** 10

---

## FIN-09: Transferências atômicas — origem e destino no mesmo batch

**Severidade:** Informativa
**Local:** `src/finance/financeCalculations.ts:111`, `src/finance/financeService.ts:67`

**Descrição:**
`transactionAccountEffects` para `type = 'transfer'` retorna dois efeitos:
```js
if (sourceId) effects.push({ accountId: sourceId, deltaCents: -amountCents });
if (destinationId) effects.push({ accountId: destinationId, deltaCents: +amountCents });
```

Ambos são aplicados no mesmo batch por `applyAccountEffectsToBatch`. A regra `validTransactionAccounts` no Firestore exige que conta de origem exista, conta de destino exista, e sejam diferentes. A transação também só é criada se ambas as contas forem válidas.

**Cenário de falha:** Se uma das contas for excluída entre a leitura da UI e a escrita, o batch inteiro falha (atomicamente). Como é fire-and-forget, o erro é silencioso, mas nenhum dos lados é debitado/creditado parcialmente.

**Confiança:** 10

---

## FIN-10: `reverseCardPurchaseOnDelete` + `onInvoiceLedgerEntryCreated` — encadeamento correto

**Severidade:** Informativa
**Local:** `functions/src/cards/reverseCardPurchaseOnDelete.ts`, `functions/src/cards/invoiceLedgerEntryTrigger.ts`, `src/cards/useInvoiceLedger.ts`

**Descrição:**
Fluxo completo de exclusão de compra no cartão:

1. `softDeleteTransaction` marca `deletedAt` na transação `card_purchase`
2. `reverseCardPurchaseOnDelete` (trigger `onDocumentUpdated`) detecta `!before.deletedAt && after.deletedAt` e cria entradas `purchase_reversal` para cada entrada de ledger original
3. `onInvoiceLedgerEntryCreated` (trigger `onDocumentCreated`) dispara em cada `purchase_reversal`, incrementando `creditsTotalCents` no documento da fatura
4. No cliente (`useInvoiceLedger`), entries com `sourceTransactionId` da transação excluída são filtradas — tanto o `purchase` original quanto o `purchase_reversal` somem da UI

**Proteções:**
- `reverseCardPurchaseOnDelete` ignora entries já do tipo `purchase_reversal` (evita recursão)
- `onInvoiceLedgerEntryCreated` usa `processedLedgerEntryIds` + transação para idempotência contra reentrega do trigger
- A reversão nunca é criada se a transação original não for `card_purchase` ou se `deletedAt` não for recém-definido

**Risco potencial:** Se `reverseCardPurchaseOnDelete` falhar (timeout, crash), as reversões não são criadas e os totais da fatura ficam permanentemente incorretos (a compra excluída continua somando). O Firestore Functions retry padrão mitiga, mas não elimina, este risco. Seria ideal ter um job de reconciliação periódico.

**Confiança:** 9

---

## FIN-11: `spendingAnalysis.signedCharge` vs `calculateInvoice` — diferença no tratamento de `purchase_reversal`

**Severidade:** Informativa
**Local:** `src/finance/spendingAnalysis.ts:20`, `src/domain/invoices/calculateInvoice.ts:4`

**Descrição:**
Em `calculateInvoice.ts`, `purchase_reversal` é tratado como crédito (vai para `creditsTotalCents`). Em `spendingAnalysis.ts`, `signedCharge` não inclui `purchase_reversal` em nenhum dos sets (`cardChargeTypes` nem `cardCreditTypes`), retornando 0.

Isso é **intencional e correto**: quando uma compra é excluída, tanto a entrada `purchase` original quanto a `purchase_reversal` são filtradas pelo `sourceTransactionId` em `useInvoiceLedger`. Se `signedCharge` retornasse valor para `purchase_reversal`, haveria dupla contagem: o `purchase` original teria sido filtrado, mas o `purchase_reversal` não (se fosse incluído em `cardCreditTypes`). Retornar 0 é seguro.

**Confiança:** 10

---

## FIN-12: `sourceTransactionId` como string vazia — comportamento correto no filtro

**Severidade:** Informativa
**Local:** `src/cards/cardService.ts:155`, `src/cards/useInvoiceLedger.ts:128`

**Descrição:**
A função `ledgerPayload` define `sourceTransactionId: input.sourceTransactionId ?? ''`. Entradas sem transação de origem (tarifas, créditos manuais, juros) recebem `''`.

No filtro de `useInvoiceLedger.ts`:
```js
return ledgerEntries.filter(
  (entry) => !entry.sourceTransactionId || !deletedTransactionIds.has(entry.sourceTransactionId)
);
```

`!entry.sourceTransactionId` para string vazia = `!''` = `true`. Essas entradas são mantidas. Entradas com `sourceTransactionId` não vazio que está no conjunto de excluídas são removidas. Comportamento correto.

**Confiança:** 10

---

## FIN-13: `currentAccountBalances` fallback para `openingBalanceCents`

**Severidade:** Informativa
**Local:** `src/finance/financeCalculations.ts:151`

**Descrição:**
Contas criadas antes do backfill de `currentBalanceCents` têm este campo ausente. `currentAccountBalances` faz fallback:
```js
balanceCents: account.currentBalanceCents ?? account.openingBalanceCents
```

Isso retorna o saldo inicial para contas antigas sem `currentBalanceCents`. Como o backfill ainda não foi discutido/rodado, contas criadas antes da implementação do saldo incremental reportam o saldo de abertura — que pode estar drasticamente incorreto se houver transações pós-criação.

**Impacto:**
Potencialmente grave se o backfill não tiver sido rodado. O saldo exibido no Dashboard e usado no cálculo de Disponível pode estar errado para contas antigas. O valor de `openingBalanceCents` não reflete transações subsequentes.

**Ação:** Verificar se o backfill (`scripts/backfillAccountBalances.mjs`) já foi rodado em produção. Se não, o saldo de todas as contas criadas antes da feature de `currentBalanceCents` está incorreto.

**Confiança:** 9

---

## FIN-14: `sharedService.ts` sem efeitos de conta — correto por design

**Severidade:** Informativa
**Local:** `src/shared/sharedService.ts`

**Descrição:**
SharedExpenseClaims e Settlements não movem dinheiro real — apenas rastreiam dívidas/divisões entre membros do casal. O dinheiro efetivo só se move quando um membro cria uma transação pessoal (income/expense). Auditado: nenhuma chamada a `applyAccountEffectsToBatch` em `sharedService.ts`. Correto.

**Confiança:** 10

---

## Resumo

| ID | Título | Severidade | Confiança |
|---|---|---|---|
| FIN-01 | `payBill` sem idempotência | Alta | 10 |
| FIN-02 | `markReceivableReceived` sem idempotência | Alta | 10 |
| FIN-03 | `recordInvoicePayment` sem idempotência | Alta | 10 |
| FIN-04 | `createTransaction` sem proteção de idempotência | Média | 7 |
| FIN-05 | Sincronia dos 14 InvoiceLedgerEntryType confirmada | Informativa | 10 |
| FIN-06 | Centavos inteiros consistente em toda a stack | Informativa | 10 |
| FIN-07 | `adjustment` unidirecional (sempre adiciona saldo) | Baixa | 10 |
| FIN-08 | Saldo incremental via `FieldValue.increment()` atômico | Informativa | 10 |
| FIN-09 | Transferências atômicas (origem + destino no mesmo batch) | Informativa | 10 |
| FIN-10 | `reverseCardPurchaseOnDelete` + `onInvoiceLedgerEntryCreated` | Informativa | 9 |
| FIN-11 | `signedCharge` vs `calculateInvoice` em `purchase_reversal` | Informativa | 10 |
| FIN-12 | `sourceTransactionId` como string vazia | Informativa | 10 |
| FIN-13 | Fallback `currentBalanceCents ?? openingBalanceCents` | Informativa | 9 |
| FIN-14 | sharedService sem efeitos de conta | Informativa | 10 |

**3 achados de severidade Alta**, todos por falta de chave de idempotência em operações de pagamento/recebimento — o padrão `recordRecurringPayment` (que usa ID determinístico) já resolve isso, mas não foi replicado para as funções de pay/receive.
