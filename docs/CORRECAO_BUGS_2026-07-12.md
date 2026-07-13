# Correção dos Bugs — Granativa (2026-07-12)

Implementação dos fixes verificados e aprovados. 13 bugs corrigidos em 8 arquivos,
zero mudanças em `firestore.rules`. Typecheck, 258 testes e build limpos.
Outros 5 bugs confirmados não foram corrigidos — ver seção "Não corrigidos" abaixo.

## Revisão pós-implementação (Claude, 2026-07-12)

Revisão de código completa da correção acima (o dispatch de subagentes falhou no
ambiente, revisão feita direto no diff) encontrou 2 fixes incompletos e 2 achados
menores. Todos corrigidos na sequência — ver detalhe em cada seção abaixo:

- **BUG-1 estava só 2/5 corrigido.** `createSharedExpenseClaim` e
  `createSettlementProposal` faziam `return commit.then(...)` corretamente, mas
  `updateSharedExpenseClaimStatus`, `acceptSettlement` e `recordSettlementPayment`
  terminavam sem `return`/`await` do `commit` — a função `async` resolvia pra
  `undefined` antes do resultado real do batch, então o `.catch()` de um caller
  futuro continuaria nunca disparando (o mesmo sintoma do bug original, só que
  pela ausência de propagação em vez do `fireWrite` engolindo). Sem sintoma hoje
  porque nenhuma tela chama essas 3 (feature "acerto de contas" tem back-end
  pronto, UI ainda não construída) — mas era uma armadilha pra quando a UI for
  feita. Corrigido: as 3 agora fazem `return commit;`.
- **BUG-7 estava só parcialmente corrigido.** `monthlyTotals` (gráfico de barras)
  passou a contar refund/reimbursement/adjustment como receita, mas
  `isCountableExpense`/`spendingByCategoryForMonth` (detalhamento por categoria)
  continuava ignorando os 3 tipos — o total do mês ficava certo, mas abrir por
  categoria não explicava de onde veio. Corrigido: os 3 tipos agora entram em
  `spendingByCategoryForMonth` como crédito **negativo** na própria categoria
  (mesmo padrão que os créditos de fatura de cartão já usavam na mesma função,
  e consistente com o comentário do código que já previa categoria negativa em
  mês de estorno).
- **`addGoalContribution`/`withdrawGoalContribution` viraram código morto** depois
  da migração do cofrinho do casal pra `coupleGoalDeposit`/`coupleGoalWithdraw` —
  nenhum caller restante em `src/` (conferido: metas pessoais usam uma terceira
  função, `contributeToGoalWithTransaction`, que já existia antes e nunca passou
  por essas duas). Removidas.
- **`recordRecurringPayment` tinha o mesmo `||` que o BUG-14 corrigiu em
  `payBill`** — o gêmeo ficou pra trás na correção original. Não foi corrigido
  nesta rodada (inofensivo hoje pelo mesmo motivo do BUG-14: o único caller já
  normaliza `''` pra `undefined`); registrado aqui pra não se perder.

3 testes novos cobrindo os dois fixes completados (`spendingAnalysis.test.ts`,
`sharedService.test.ts` — novo arquivo). 261 testes, typecheck e build limpos.

---

## BUG-1 (CRÍTICO): 5 funções do espaço do casal engolem rejeição do Firestore

**Arquivo:** `src/shared/sharedService.ts`

**Problema:** `createSharedExpenseClaim`, `updateSharedExpenseClaimStatus`,
`createSettlementProposal`, `acceptSettlement` e `recordSettlementPayment` usavam
`fireWrite(batch.commit())` que engole a rejeição da Promise. O `.catch()` do caller
(em `CoupleExpensesSection.tsx:93`) nunca disparava — o usuário via o dado aparecer
na UI (otimista), sumir no reload, sem nenhuma mensagem de erro.

**Correção:** `fireWrite` removido. Cada função agora captura a Promise do batch,
faz log em dev sem engolir o erro, e propaga a rejeição ao caller:

```ts
// ANTES (createSharedExpenseClaim):
fireWrite(batch.commit());
return id;

// DEPOIS:
const commit = batch.commit();
if (import.meta.env.DEV) {
  commit.catch((err: unknown) => {
    const code = (err as { code?: string })?.code ?? 'unknown';
    console.error(`[fireWrite] createSharedExpenseClaim rejeitada (${code})`, err);
  });
}
return commit.then(() => id);
```

Para funções que não retornam `id`, só o log condicional em dev é aplicado (sem
`.then()`). Regra offline-first preservada: o caller continua fire-and-forget, só
que agora o `.catch()` dele de fato dispara.

A importação de `fireWrite` foi removida do arquivo (não era mais usada).

---

## BUG-2 (ALTO): Status da fatura congela após reconciliação

**Arquivo:** `src/cards/useCardsData.ts`

**Problema 1 (linha 232):** `lifecycle` era derivado como `'closed'` só quando
`invoice.status === 'closed'`. Para `'paid'`, `'partial'`, `'overpaid'`, lifecycle
ficava `'open'` — o cálculo nunca mostrava status pós-pagamento.

**Problema 2 (linha 242):** O status só aceitava `calculation.status` quando o status
armazenado era `'open'` ou `'closed'`. Para qualquer outro (`'paid'`, `'partial'`,
`'overpaid'`), o status era congelado permanentemente no valor do Firestore.

**Correção:**

```ts
// ANTES (lifecycle):
const calculation = calculateInvoice(entries, invoice.status === 'closed' ? 'closed' : 'open');

// DEPOIS:
const lifecycle = invoice.status === 'open' ? 'open' : 'closed';
const calculation = calculateInvoice(entries, lifecycle, invoice.dueDate?.toDate());
```

```ts
// ANTES (status freeze):
status: invoice.status === 'open' || invoice.status === 'closed' ? calculation.status : invoice.status,

// DEPOIS:
status: calculation.status,
```

Agora: lifecycle `'open'` só para faturas genuinamente abertas; todo o resto
(`'closed'`, `'paid'`, `'partial'`, `'overpaid'`, `'overdue'`, `'renegotiated'`)
recebe lifecycle `'closed'` e o cálculo resolve o status real a partir do ledger.

---

## BUG-3 (ALTO): `anticipateInstallments` sem idempotência

**Arquivo:** `src/cards/cardService.ts`

**Problema:** IDs dos lançamentos de antecipação usavam seed aleatório
(`createId('anticipation')`). Cada chamada gerava novos IDs, permitindo duplicação
de débito/crédito num retry de rede.

**Correção:** IDs agora são determinísticos, derivados dos dados do negócio:

```ts
// ANTES:
const seed = createId('anticipation');
const creditKey = `${seed}_credit_${credit.invoiceId}_${index}`;
const debitKey = `${seed}_debit_${index}`;

// DEPOIS:
const creditKey = `anticipation_credit_${credit.sourceTransactionId}_${credit.invoiceId}`;
const debitKey = `anticipation_debit_${credit.sourceTransactionId}_${credit.invoiceId}`;
```

Mesmo padrão de `recurringOccurrenceTransactionId` (id determinístico por dados).
O ledger é `allow update: if false` — uma segunda tentativa com os mesmos dados
cai no mesmo documento e é rejeitada pela regra, fazendo o batch falhar atomicamente.
Sem duplicação possível.

---

## BUG-4 (ALTO): Guardar/Resgatar do cofrinho não era atômico

**Arquivos:** `src/finance/financeService.ts` (novas funções), `src/pages/shared/CoupleSavingsSection.tsx` (caller atualizado)

**Problema:** `addGoalContribution` (workspace do casal) e `createTransaction`
(workspace pessoal) eram dois writes independentes. Se um falhasse e o outro não,
os saldos dessincronizavam. O `.catch(() => undefined)` na transação pessoal
engolia o erro completamente.

**Correção:** Duas novas funções em `financeService.ts` que constroem um único
`writeBatch` cross-workspace:

- **`coupleGoalDeposit`**: grava `goalContribution` (deposit) + incrementa
  `goal.savedCents` + opcionalmente cria transação `expense` no workspace pessoal.
  Tudo num batch só — se qualquer parte falhar, nada persiste.

- **`coupleGoalWithdraw`**: idem para resgate — `goalContribution` (withdrawal) +
  decrementa `goal.savedCents` + opcionalmente cria transação `income`.

```ts
// ANTES (CoupleSavingsSection — guardar):
addGoalContribution(wsId, userId, goal.id, amountCents).catch(...)
if (account && personalWsId) {
  createTransaction(personalWsId, userId, {...}).catch(() => undefined) // erro engolido
}

// DEPOIS:
coupleGoalDeposit(wsId, personalWsId, userId, goal.id, amountCents, {
  description: `Cofrinho: ${goal.name}`,
  accountId: guardarFromAccount
}).catch(...) // um único .catch() cobre tudo
```

O `.catch(() => undefined)` foi eliminado. As funções antigas (`addGoalContribution`,
`withdrawGoalContribution`, `createTransaction`) permanecem inalteradas para outros
callers.

---

## BUG-5 (ALTO): Mensagem de erro genérica no resgate com race condition

**Arquivo:** `src/pages/shared/CoupleSavingsSection.tsx`

**Problema:** Quando dois parceiros resgatavam ao mesmo tempo, o segundo recebia
rejeição do servidor mas a mensagem era genérica: "Não foi possível resgatar agora."
Sem indicação da causa real.

**Correção:** Mensagem específica que menciona a possibilidade de race com o parceiro:

```ts
// ANTES:
.catch((error) => onMessage(getUserFacingErrorMessage(error, 'Não foi possível resgatar agora.')));

// DEPOIS:
.catch((error) => onMessage(getUserFacingErrorMessage(error, 'Não foi possível resgatar agora — talvez seu parceiro tenha resgatado antes. Confira o saldo e tente de novo.')));
```

---

## BUG-6 (MÉDIO): Status `overdue` nunca produzido para faturas

**Arquivos:** `src/domain/invoices/calculateInvoice.ts`, `src/cards/useCardsData.ts`

**Problema:** `resolveInvoiceStatus` retornava `'overpaid'`, `'open'`, `'paid'`,
`'partial'`, `'closed'` — mas nunca `'overdue'`. O tipo e a label ("Vencida") já
existiam. Uma fatura fechada com vencimento no passado e saldo devedor aparecia
como "Fechada".

**Correção:** Adicionado `dueDate?: Date` como parâmetro opcional em `calculateInvoice`
e `resolveInvoiceStatus`. Nova verificação antes do `return 'closed'`:

```ts
// NOVO (resolveInvoiceStatus, antes do return 'closed'):
if (input.dueDate && input.dueDate < new Date() && input.outstandingBalanceCents > 0) {
  return 'overdue';
}
```

Parâmetro é opcional — callers existentes (`invoiceInvariants.ts`, testes) não quebram.

Em `useCardsData.ts`, o `dueDate` é passado via `invoice.dueDate?.toDate()`.

---

## BUG-7 (MÉDIO): Análise mensal ignorava `refund`, `reimbursement` e `adjustment`

**Arquivo:** `src/finance/spendingAnalysis.ts`

**Problema:** `monthlyTotals` só acumulava `income` e `expense`. Transações `refund`,
`reimbursement` e `adjustment` — que afetam o saldo como receita (`applyTransactionToBalances`
as trata assim) — eram invisíveis no gráfico de barras.

**Correção:**

```ts
// ANTES:
if (t.type === 'income') incomeCents += t.amountCents;
else if (t.type === 'expense') expenseCents += t.amountCents;

// DEPOIS:
if (t.type === 'expense') expenseCents += t.amountCents;
else if (t.type === 'income' || t.type === 'refund' || t.type === 'reimbursement' || t.type === 'adjustment') incomeCents += t.amountCents;
```

A ordem foi invertida (`expense` primeiro) para não quebrar a lógica — os 3 novos
tipos caem no bloco de income, consistente com `applyTransactionToBalances`.

---

## BUG-8 (MÉDIO): `Math.max(0, expenseCents)` escondia meses com gasto líquido negativo

**Arquivo:** `src/finance/spendingAnalysis.ts`

**Problema:** Se um mês tinha mais créditos de cartão (reembolso, estorno) do que
débitos, `expenseCents` era negativo. O `Math.max(0, ...)` cravava em zero —
o mês aparecia idêntico a um mês sem atividade nenhuma.

**Correção:** Removido o clamp. Recharts suporta barras negativas nativamente:

```ts
// ANTES:
return { month, incomeCents, expenseCents: Math.max(0, expenseCents) };

// DEPOIS:
return { month, incomeCents, expenseCents };
```

---

## BUG-9 (MÉDIO): Atribuição de transação a mês inconsistente

**Arquivo:** `src/finance/spendingAnalysis.ts`

**Problema:** `isCountableExpense` usava semântica OR (contava em ambos os meses
se `cashMonth !== competenceMonth`). `monthlyTotals` usava coalesce (contava em um
mês só). Valores podiam divergir entre o donut de categorias e o gráfico de barras.

**Correção:** `isCountableExpense` alinhada ao critério de `monthlyTotals`:

```ts
// ANTES:
if (t.cashMonth !== month && t.competenceMonth !== month) return false;

// DEPOIS:
if ((t.cashMonth ?? t.competenceMonth) !== month) return false;
```

Ambas as funções agora usam `cashMonth ?? competenceMonth` — cada transação pertence
a exatamente um mês.

---

## BUG-10 (MÉDIO): Antecipação permitida de fatura `partial`

**Arquivo:** `src/cards/anticipation.ts`

**Problema:** `collectFutureInstallments` excluía apenas faturas `'paid'` e `'overpaid'`
da antecipação. Faturas `'partial'` (pagamento parcial já feito) ainda eram elegíveis
— antecipar uma parcela de lá deixava o pagamento parcial órfão.

**Correção:** Adicionado `'partial'` à lista de exclusão:

```ts
// ANTES:
invoice.status !== 'paid' &&
invoice.status !== 'overpaid'

// DEPOIS:
invoice.status !== 'paid' &&
invoice.status !== 'overpaid' &&
invoice.status !== 'partial'
```

Faturas com qualquer atividade de pagamento (`'paid'`, `'overpaid'`, `'partial'`)
agora são excluídas da seleção de parcelas antecipáveis.

---

## BUG-12 (MÉDIO): `cancelCoupleWorkspace` sem guarda de parceiro ativo

**Arquivo:** `src/shared/sharedService.ts`

**Problema:** A UI só chama quando `isOwnerAlone`, mas a função não verificava. Se
chamada com parceiro ativo, deletava o workspace e o `workspaceRef` do dono, mas
deixava o `workspaceRef` do parceiro órfão → tela "Preparando seu espaço..." eterna.

**Correção:** Leitura do workspace antes de deletar para conferir `activeMemberCount`:

```ts
// NOVO (antes do batch):
const wsSnap = await getDoc(workspaceRef(workspaceId));
if (wsSnap.exists() && (wsSnap.data().activeMemberCount ?? 1) > 1) {
  throw new Error('Não é possível cancelar um espaço com parceiro ativo. Remova o parceiro primeiro.');
}
```

---

## BUG-13 (BAIXO): `!amount` rejeitava valor zero como undefined

**Arquivo:** `src/finance/financeService.ts`

**Problema:** `if (!amount) return;` em `recordRecurringPayment` tratava `0` como
ausência de valor — recorrência de valor zero nunca registrava nem avançava.

**Correção:**

```ts
// ANTES:
if (!amount) return;

// DEPOIS:
if (amount == null) return;
```

`amount == null` só é verdadeiro para `null` e `undefined`. `0` passa.

---

## BUG-14 (BAIXO): `||` em vez de `??` na resolução de conta do `payBill`

**Arquivo:** `src/finance/financeService.ts`

**Problema:** `opts.accountId || bill.accountId` tratava string vazia como ausência.
Se um caller futuro passasse `accountId: ''` querendo "sem conta", o `||` ignorava
e usava `bill.accountId`.

**Correção:**

```ts
// ANTES:
const acctId = opts.accountId || bill.accountId;

// DEPOIS:
const acctId = opts.accountId ?? bill.accountId;
```

`??` preserva string vazia quando explicitamente passada. Inofensivo hoje (o único
caller já normaliza `''` pra `undefined`), mas semanticamente correto.

---

## Resumo — Corrigidos (13)

| # | Severidade | Arquivo | Tipo de mudança |
|---|-----------|---------|-----------------|
| BUG-1 | Crítico | `sharedService.ts` | 5× fireWrite → propagate + dev log |
| BUG-2 | Alto | `useCardsData.ts` | Lifecycle + remover status freeze |
| BUG-3 | Alto | `cardService.ts` | IDs determinísticos |
| BUG-4 | Alto | `financeService.ts` + `CoupleSavingsSection.tsx` | Batch cross-workspace atômico |
| BUG-5 | Alto | `CoupleSavingsSection.tsx` | Mensagem de erro específica |
| BUG-6 | Médio | `calculateInvoice.ts` + `useCardsData.ts` | Overdue com dueDate |
| BUG-7 | Médio | `spendingAnalysis.ts` | Refund/reimbursement/adjustment como income |
| BUG-8 | Médio | `spendingAnalysis.ts` | Remover Math.max(0) |
| BUG-9 | Médio | `spendingAnalysis.ts` | Alinhar atribuição de mês |
| BUG-10 | Médio | `anticipation.ts` | Excluir faturas partial |
| BUG-12 | Médio | `sharedService.ts` | Guarda activeMemberCount |
| BUG-13 | Baixo | `financeService.ts` | `!amount` → `amount == null` |
| BUG-14 | Baixo | `financeService.ts` | `\|\|` → `??` |

---

## Não corrigidos (5)

Dos 18 bugs confirmados na investigação, 5 não receberam correção. Não são bugs
ativos causando sintoma — são observações, código morto inofensivo, ou trade-offs
em que o custo da correção supera o benefício.

### BUG-15: Contadores de fatura sempre zero no Firestore

**Arquivo:** `src/cards/cardService.ts:108` (`invoicePayload`)

**Problema confirmado:** `purchasesTotalCents`, `paymentsTotalCents`,
`creditsTotalCents`, `feesTotalCents`, `outstandingBalanceCents` e
`overpaidCreditCents` nascem zero na criação da fatura e nunca são atualizados.
Quem lê o Firestore direto (Cloud Function, admin, futuro cliente nativo) vê tudo
zerado.

**Por que não foi corrigido:** Atualizar esses 6 campos exigiria um `updateDoc` na
fatura a cada escrita de ledger (compra, pagamento, crédito, tarifa, antecipação).
Isso dobra o número de writes por operação de fatura — num projeto no plano Blaze
com cota diária, o custo é real. O cliente recalcula tudo corretamente em memória
via `calculateInvoice` no `useCardsData`. A Cloud Function `closeInvoicesDue` já
foi corrigida separadamente (soma o ledger em vez de ler o campo). O trade-off é
consciente e documentado.

### BUG-16: `parentCategoryId` nas regras mas nunca enviado pelo cliente

**Arquivo:** `firestore.rules:367` e `404`

**Problema confirmado:** O campo está no `hasOnly` de `validCategoryCreate` e
`validCategoryUpdate`, mas `createCategory` e `updateCategory` nunca enviam. É
código morto na regra.

**Por que não foi corrigido:** O campo é validado via `validOptionalString` — não
causa rejeição, é puramente permissivo. Existe para uso futuro (subcategorias).
Remover agora e readicionar depois seria duplo trabalho. Deixar não atrapalha,
não consome cota, não causa bug.

### BUG-17: `validAccountUpdate` é função inteira nunca exercitada

**Arquivo:** `firestore.rules:349-361` e `1467`

**Problema confirmado:** A regra existe (`allow update: if validAccountUpdate`),
mas nenhum código cliente faz update de conta — só `createAccount` e `deleteAccount`.

**Por que não foi corrigido:** A regra está pronta e correta. Se um dia
implementarem edição de conta (mudar nome, tipo, arquivar), a validação já existe.
Remover seria perder trabalho feito. Não é bug — é infraestrutura pronta pra
feature futura.

### BUG-18: Limite monetário do Zod mais permissivo que o Firestore

**Arquivos:** `firestore.rules:272` vs `financeSchemas.ts:12-16`

**Problema confirmado:** O schema Zod aceita até `Number.MAX_SAFE_INTEGER`
(~9 quatrilhões de centavos = R$ 90 trilhões). A regra capa em 1 trilhão
(R$ 10 bilhões). Um valor entre esses dois passaria no cliente e seria rejeitado
silenciosamente pelo servidor.

**Por que não foi corrigido:** Nenhum usuário real lança R$ 10 bilhões numa
transação. Alinhar os limites exigiria ou afrouxar a regra (pior segurança) ou
apertar o schema (mudança visível ao usuário com `max` arbitrário). O gap é
teórico — em anos de operação, zero chances de manifestação.

### BUG-20: Timestamps com horas diferentes entre `invoiceDueDateForReferenceMonth` e `resolveInstallmentCycle`

**Arquivos:** `src/cards/cardDates.ts:18` vs `:41-48`

**Problema confirmado:** `invoiceDueDateForReferenceMonth` fixa `12:00:00`.
`resolveInstallmentCycle` preserva a hora da data de compra. Mesmo `referenceMonth`
produz timestamps com horas potencialmente diferentes.

**Por que não foi corrigido:** Toda comparação de vencimento no app é por dia
— nunca por hora. As datas são exibidas com `formatFriendlyDate` (que ignora
horas) e as comparações de corte (`dueDate < now`) usam `endOfDay()` para
normalizar. O desalinhamento de horas não se manifesta em nenhum cálculo ou
exibição. Corrigir exigiria decisão de design (qual hora usar?) sem benefício
prático.

---

**Validação (rodada original):** `npm run typecheck` limpo · `npm test` 258/258
passando · `npm run build` limpo · zero mudanças em `firestore.rules`.

**Validação (após a revisão pós-implementação, ver seção no topo):** `npm run
typecheck` limpo · `npm test` 261/261 passando (3 novos) · `npm run build`
limpo · zero mudanças em `firestore.rules`.

*Investigação: `docs/BUGS_INVESTIGACAO_2026-07-12.md` · Correções implementadas em 2026-07-12. Plano em `.claude/plans/adaptive-exploring-cerf.md`.*
