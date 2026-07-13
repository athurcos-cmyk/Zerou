# Investigação de Bugs — Granativa (2026-07-12)

Varredura completa do código por 4 agentes independentes: cartões/parcelamento,
cálculos financeiros, regras do Firestore vs payloads, e espaço do casal.

---

## Verificação (Claude, 2026-07-12)

Conferido item a item direto no código-fonte (não nos resumos do relatório) antes de
implementar qualquer fix. 18 dos 20 bugs foram **confirmados exatos** — descrição,
arquivo e comportamento batem com o código real. 2 foram **descartados** (não são bugs).
Ver nuances de severidade abaixo; a implementação dos fixes é feita em rodada separada.

### Nuances relevantes nos confirmados

- **BUG-1**: confirmado exato, mas só `createSharedExpenseClaim` é chamado pela UI hoje.
  `updateSharedExpenseClaimStatus`, `createSettlementProposal`, `acceptSettlement` e
  `recordSettlementPayment` são **código morto** — nenhuma página do app as invoca (busca
  por "settlement" em `src/pages/` não retorna nada). A severidade "Crítica" vale de fato
  só pra despesa compartilhada; as outras 4 são risco latente numa feature (acerto de
  contas) ainda não ligada na UI.
- **BUG-2**: confirmado, mas a causa é mais profunda do que o relatório descreve. O fix
  ingênuo ("sempre usar `calculation.status`") quebra faturas `partial`/`paid` sem
  novidade, porque a `lifecycle` passada pro cálculo (`useCardsData.ts:232`) também está
  errada — trata qualquer status pós-fechamento diferente de `'closed'` como `'open'`.
  Precisa corrigir a derivação de `lifecycle` **e** remover o congelamento do status juntos.
- **BUG-3**: confirmado — o id do lançamento usa um `seed` aleatório por chamada
  (`createId('anticipation')`), não é idempotente de verdade. Fix: id determinístico
  derivado de `sourceTransactionId`, mesmo padrão já usado em `recordRecurringPayment`,
  aproveitando que o ledger já é `allow update: if false`.
- **BUG-4**: confirmado, e mais grave do que parece — o `.catch(() => undefined)` nem loga
  em dev (diferente do `fireWrite`, que ao menos loga). Fix limpo sem Cloud Function: as
  duas escritas (cofrinho do casal + transação pessoal) estão no mesmo projeto Firestore,
  dá pra juntar num único `writeBatch` atômico.
- **BUG-5**: confirmado. Não dá pra eliminar 100% sem `runTransaction` (exige round-trip
  síncrono, contraria o padrão fire-and-forget do projeto). Fix pragmático: mensagem de
  erro específica quando o servidor rejeitar por saldo negativo, em vez da genérica atual.
- **BUG-7**: confirmado, e mais amplo que o relatório diz — `adjustment` também é ignorado
  pela Análise, não só `refund`/`reimbursement`.
- **BUG-14**: existe no código, mas é inofensivo hoje — o único call site (`BillsPage.tsx`)
  já normaliza `''` pra `undefined` antes de chamar `payBill`, então `||` e `??` se
  comportam igual na prática. Vale corrigir por robustez, sem urgência real.
- **BUG-16, BUG-17, BUG-18**: confirmados exatos, mas são só observações — zero impacto
  prático, nada a corrigir (código/regra morta, ou limite nunca atingível na prática).
- **BUG-20**: confirmado, impacto baixo — comparações de vencimento no app são por dia,
  não por hora, então o desalinhamento de horário não se manifesta hoje.

### Discordâncias (não são bugs)

**BUG-11 não é bug — é a arquitetura documentada do projeto.** `resetForm()` e
`setSheetOpen(false)` antes do write é exatamente o padrão fire-and-forget prescrito na
"REGRA PRINCIPAL" do `CLAUDE.md` ("feche o sheet, limpe o form — ANTES de chamar o
write"). Fazer o formulário esperar o write antes de fechar reintroduziria o "trava com
spinner se o transporte oscilar" que o projeto proíbe explicitamente. O sintoma real
("perde os dados digitados se falhar") é causado pelo **BUG-1**: quando o erro não
aparece pro usuário, parece que os dados sumiram sem explicação. Corrigido o BUG-1, o
padrão atual do formulário está correto e não deve mudar.

**BUG-19 não é bug acionável — é limitação de modelagem.** O cartão só guarda o *dia* de
fechamento, nunca o horário (`Card` não tem esse campo). A regra atual (compra no dia do
fechamento entra na fatura atual) é o comportamento comum de cartão brasileiro. Corrigir
isso exigiria adicionar hora de corte ao cadastro do cartão — uma feature nova pedida
pelo relatório, não um bug do código existente.

---

## Bugs Críticos

### BUG-1: 5 funções do espaço do casal engolem rejeição do Firestore via `fireWrite`

**Arquivo:** `src/shared/sharedService.ts:510, 534, 560, 583, 609`

**Funções afetadas:**
- `createSharedExpenseClaim`
- `updateSharedExpenseClaimStatus`
- `createSettlementProposal`
- `acceptSettlement`
- `recordSettlementPayment`

**Causa:** Essas 5 funções usam `fireWrite(batch.commit())` em vez de `await batch.commit()`. O `fireWrite` (`src/firebase/fireWrite.ts:19-28`) suprime a rejeição da Promise — só loga no console em dev e retorna `void`. O `.catch()` do caller **nunca dispara** porque a Promise já foi engolida antes de chegar nele.

**Sintoma:** O usuário cria uma despesa compartilhada, vê ela aparecer na UI (otimista, via `onSnapshot`), o servidor rejeita (ex.: split não bate), o `onSnapshot` reverte a entrada otimista, e a despesa **some da tela sem nenhuma mensagem de erro**. O usuário acha que o app "perdeu" o dado que ele acabou de cadastrar.

**Contexto:** Este é exatamente o padrão que o `fireWrite` foi criticado por ter "escondido dois bugs sérios por semanas" (`fireWrite.ts`). Nas funções financeiras (`financeService.ts`) o padrão fire-and-forget é intencional (offline-first). Mas no espaço do casal, onde o write é um `batch.commit()` multi-documento com validação server-side complexa, engolir o erro é perigoso.

**Comparação:** `createCoupleWorkspace` (mesmo arquivo, linha 242) usa `await batch.commit()` corretamente. `addGoalContribution` (`financeService.ts:279`) também. As 5 funções acima são a exceção inconsistente.

---

## Bugs Altos

### BUG-2: Status da fatura congela após reconciliação manual

**Arquivo:** `src/cards/useCardsData.ts:242`
```ts
status: invoice.status === 'open' || invoice.status === 'closed' ? calculation.status : invoice.status,
```

**Causa:** O ternário estrito só recalcula o status para faturas `open` ou `closed`. Se a fatura foi reconciliada manualmente (`reconcileInvoice` seta `status: 'paid'`, `'partial'` ou `'overpaid'`), o status **nunca mais atualiza**, mesmo que novos lançamentos de ledger mudem o saldo.

**Sintoma:** Fatura reconciliada como "Paga" recebe um reembolso (crédito de R$200). O cálculo interno diz `overpaid` (+R$200 de crédito), mas o status exibido continua "Paga". O valor está certo, o rótulo está errado.

---

### BUG-3: `anticipateInstallments` sem guarda contra dupla antecipação

**Arquivo:** `src/cards/cardService.ts:486-543`

**Causa:** Cada chamada gera um `seed` aleatório novo (`createId('anticipation')`) e cria ledger entries com ids derivados desse seed. Nunca verifica se já existe um crédito para o mesmo `(sourceTransactionId, invoiceId, amountCents)`. A UI (`groupAnticipatablePurchases`) filtra parcelas já antecipadas, mas a função de serviço não tem defesa própria.

**Sintoma:** Um retry de rede ou race condition criaria um segundo par débito/crédito. A fatura atual receberia débito em dobro (usuário deve 2x), a futura receberia crédito órfão. Dinheiro criado do nada no total das faturas.

---

### BUG-4: Guardar/Resgatar do cofrinho não é atômico

**Arquivo:** `src/pages/shared/CoupleSavingsSection.tsx:90-118`

**Causa:** `addGoalContribution` (workspace do casal) e `createTransaction` (workspace pessoal) são dois writes independentes, em batches diferentes, nenhum aguardado pelo caller. O `.catch(() => undefined)` na linha 103 engole o erro da transação pessoal silenciosamente.

**Sintoma:** Quatro cenários de falha parcial:
- Contribuição no cofrinho sobe, mas desconto na conta pessoal falha → cofrinho mostra dinheiro que nunca saiu de lugar nenhum
- Desconto na conta pessoal acontece, mas contribuição falha → dinheiro sumiu da conta e não apareceu no cofrinho
- Ambos falham → usuário vê erro da contribuição, mas não da transação (engolida)

---

### BUG-5: Validação de saldo do cofrinho tem race condition entre parceiros

**Arquivo:** `src/pages/shared/CoupleSavingsSection.tsx:74`

**Causa:** A validação `amountCents > guardarTarget.totalCents` usa o valor em cache local (`goal.savedCents`). Se os dois parceiros resgatam ao mesmo tempo, ambos passam na validação client-side. O segundo a chegar no servidor toma `permission-denied` porque `savedCents` ficaria negativo (a regra exige `>= 0`).

**Sintoma:** Parceiro A resgata R$150 de um goal de R$200. Parceiro B, olhando a tela com o valor antigo (R$200), também tenta resgatar R$150. A validação local deixa passar. O servidor rejeita. A mensagem de erro é genérica ("Não foi possível resgatar agora") — sem explicar que o parceiro já resgatou.

---

## Bugs Médios

### BUG-6: Status `overdue` definido mas nunca produzido

**Arquivos:** `src/domain/invoices/calculateInvoice.ts:95-122` (`resolveInvoiceStatus`) e `src/cards/cardSchemas.ts:91` (`reconcileInvoiceSchema`)

**Causa:** O tipo `InvoiceStatus` inclui `'overdue'`, a label "Vencida" existe em `cardLabels.ts`, mas:
- `resolveInvoiceStatus` só retorna `'overpaid'`, `'open'`, `'paid'`, `'partial'`, `'closed'` — nunca `'overdue'`
- `reconcileInvoiceSchema` não aceita `'overdue'` como target de reconciliação — só `['closed', 'partial', 'paid', 'overpaid']`

**Sintoma:** Fatura fechada e com vencimento no passado aparece como "Fechada" em vez de "Vencida". Nenhuma indicação visual de atraso.

---

### BUG-7: Análise mensal ignora transações `refund` e `reimbursement`

**Arquivo:** `src/finance/spendingAnalysis.ts:57-58, 136-137`

**Causa:** `isCountableExpense` só considera `type === 'expense'`. `monthlyTotals` só acumula `income` e `expense`. Transações `refund` e `reimbursement` (que afetam o saldo da conta como receita) passam batidas.

**Sintoma:** Usuário recebe R$500 de reembolso, saldo sobe R$500, mas a análise mensal não mostra de onde veio. O balanço e a análise ficam dessincronizados.

---

### BUG-8: `Math.max(0, expenseCents)` esconde meses com gasto líquido negativo

**Arquivo:** `src/finance/spendingAnalysis.ts:139`

**Causa:** Se um mês tem mais créditos de cartão (reembolsos, chargebacks, antecipação) do que débitos, `expenseCents` é negativo. O `Math.max(0, ...)` crava em zero.

**Sintoma:** Mês com devolução de R$3.000 mostra "R$0 gasto" na barra, mas o drilldown por categoria mostra "-R$3.000". Inconsistência interna visível pro usuário.

---

### BUG-9: Inconsistência latente na atribuição de transação a mês

**Arquivo:** `src/finance/spendingAnalysis.ts:59 vs 133`

**Causa:** Duas funções atribuem transação a mês de forma diferente:
- `spendingByCategoryForMonth` (linha 59): conta a transação em **qualquer** mês onde `cashMonth` OU `competenceMonth` bater — pode contar a mesma transação em 2 meses
- `monthlyTotals` (linha 133): `cashMonth ?? competenceMonth` — conta em **1** mês só

**Hoje é latente** porque todo código que cria transação seta os dois campos iguais. Mas se um dia alguém setar `cashMonth !== competenceMonth` (ex.: compra em julho, parcela paga em agosto), a análise quebra silenciosamente.

---

### BUG-10: `collectFutureInstallments` permite antecipar de fatura `partial`

**Arquivo:** `src/cards/anticipation.ts:58-65`

**Causa:** O filtro exclui só `paid` e `overpaid`. Uma fatura com status `partial` (pagamento parcial feito) ainda é elegível pra antecipação.

**Sintoma:** Usuário já pagou metade de uma fatura futura. Antecipa uma parcela de lá — o débito vai pra fatura atual. A fatura futura fica com o pagamento parcial órfão (a compra que justificava a dívida foi antecipada e sumiu). Dinheiro pago a mais.

---

### BUG-11: Formulários do casal resetam antes do write completar

**Arquivos:** `CoupleExpensesSection.tsx:86-87` e `CoupleSavingsSection.tsx:120-124`

**Causa:** `resetForm()` e `setSheetOpen(false)` executam **antes** da Promise do write. Se o write falhar, o formulário já fechou e foi limpo.

**Sintoma:** Usuário preenche uma despesa compartilhada detalhada, submete, sheet fecha, erro aparece. Precisa reabrir e redigitar tudo do zero.

---

### BUG-12: `cancelCoupleWorkspace` sem guarda de parceiro ativo

**Arquivo:** `src/shared/sharedService.ts:405-426`

**Causa:** A UI só chama quando `isOwnerAlone`, mas a função não valida isso. Se chamada com parceiro ativo (bug futuro, chamada direta), deleta o workspace e os docs do dono, mas **não** atualiza o `workspaceRef` do parceiro.

**Sintoma:** Parceiro fica com `workspaceRef.status: 'active'` apontando pra um workspace que não existe mais. O hook `useSharedWorkspaceData` vê o ref ativo mas o workspace é null → tela "Preparando seu espaço..." eterna, sem erro visível.

---

## Bugs Baixos

### BUG-13: `recordRecurringPayment` rejeita valor zero como se fosse undefined

**Arquivo:** `src/finance/financeService.ts:620`
```ts
if (!amount) return;
```

**Causa:** `!0` é `true`. Se `amountCents` for `0` (válido), a função retorna sem registrar pagamento nem avançar `nextOccurrenceAt`.

---

### BUG-14: `payBill` usa `||` em vez de `??` para resolver conta

**Arquivo:** `src/finance/financeService.ts:541`
```ts
const acctId = opts.accountId || bill.accountId;
```

**Causa:** `"" || "fallback"` retorna `"fallback"`. Se alguém passar `accountId: ""` querendo "sem conta", o `||` ignora e usa a conta do bill.

---

### BUG-15: Contadores de fatura no Firestore sempre zero

**Arquivo:** `src/cards/cardService.ts:108` (`invoicePayload`)

**Causa:** `purchasesTotalCents`, `paymentsTotalCents`, `creditsTotalCents`, `feesTotalCents`, `outstandingBalanceCents`, `overpaidCreditCents` nascem zero e **nenhum código jamais os atualiza**. O cliente recalcula via `calculateInvoice` em memória.

**Sintoma:** Quem ler o Firestore direto (Cloud Function, admin, futuro app nativo) vê tudo zerado. A Cloud Function `closeInvoicesDue` já foi vítima disso — lia `outstandingBalanceCents` cru e mandava push "Fatura fechada: R$ 0,00" (`SESSAO.md:84`).

---

### BUG-16: `parentCategoryId` nas regras mas nunca enviado pelo cliente

**Arquivo:** `firestore.rules:367` (`validCategoryCreate`) e `firestore.rules:404` (`validCategoryUpdate`)

**Causa:** O campo está no `hasOnly` de create e update de categoria, mas `createCategory` e `updateCategory` (`financeService.ts:182-216`) nunca enviam. Validado via `validOptionalString`, então não causa rejeição — é só código morto.

---

### BUG-17: `validAccountUpdate` é função inteira morta

**Arquivo:** `firestore.rules:349-361` e `firestore.rules:1467`

**Causa:** A regra existe e está conectada (`allow update: if validAccountUpdate(workspaceId)`), mas **nenhum código cliente faz update de conta**. Só existe `createAccount` e `deleteAccount`. Se um dia implementarem edição de conta, a regra está pronta — mas hoje é 100% não exercitada.

---

### BUG-18: Alcance dos limites monetários: Firestore mais restrito que cliente

**Arquivos:** `firestore.rules:272` vs `financeSchemas.ts:12-16`

**Causa:** O Zod aceita até `Number.MAX_SAFE_INTEGER` (~9 quatrilhões de centavos). A regra capa em 1 trilhão (10 bilhões de reais). Valores entre esses dois passam no cliente e são rejeitados pelo servidor.

**Sintoma:** Nenhum na prática (ninguém lança R$10 bi no app). Mas é uma inconsistência de limite.

---

### BUG-19: `resolveInstallmentCycle` — compra no dia exato do fechamento

**Arquivo:** `src/cards/cardDates.ts:40`
```ts
const firstMonthOffset = purchaseDay > closingDay ? 1 : 0;
```

**Causa:** `>` estrito. Compra exatamente no dia do fechamento vai pra fatura do mês atual. Se o banco considera o corte em horário específico (ex.: 17h do dia 25), compras depois desse horário deveriam cair no mês seguinte.

---

### BUG-20: Timestamps inconsistentes entre funções de data de fatura

**Arquivos:** `src/cards/cardDates.ts:18` vs `src/cards/cardDates.ts:41-48`

**Causa:** `invoiceDueDateForReferenceMonth` fixa hora `12:00:00`. `resolveInstallmentCycle` preserva a hora/minuto/segundo da data de compra. Mesmo `referenceMonth` produz timestamps com horas diferentes entre as duas funções.

---

## O que NÃO tem bug

A investigação de regras do Firestore confirmou explicitamente:

- **Zero rejeições silenciosas**: todos os 17 enums batem com `in [...]` das regras
- **Zero campos faltando em `hasOnly`**: todos os 22 updates têm `affectedKeys` correto
- **Zero divergências `hasAll`**: todos os payloads de create incluem os campos obrigatórios
- A sincronia entre serviços e `firestore.rules` está **impecável**

---

## Resumo por severidade

| Severidade | Quantidade | IDs |
|-----------|-----------|-----|
| Crítica | 1 | BUG-1 (severidade real só pra `createSharedExpenseClaim`; as outras 4 funções afetadas são código morto) |
| Alta | 4 | BUG-2, BUG-3, BUG-4, BUG-5 |
| Média | 6 | BUG-6, BUG-7, BUG-8, BUG-9, BUG-10, BUG-12 |
| Baixa | 7 | BUG-13, BUG-14, BUG-15, BUG-16, BUG-17, BUG-18, BUG-20 |
| **Descartado (não é bug)** | **2** | **BUG-11** (é a arquitetura offline-first documentada, não um defeito) · **BUG-19** (limitação de modelagem — cartão não guarda hora de fechamento, não bug de código) |

18 de 20 confirmados exatos contra o código-fonte em 2026-07-12 (ver seção "Verificação"
no topo do arquivo). Nenhum fix foi implementado ainda nesta rodada — só a verificação.

---

*Investigação por 4 agentes independentes. Cada agente leu os arquivos-fonte completos, não resumos.*
*Verificação linha a linha por Claude em 2026-07-12, antes de qualquer implementação.*
