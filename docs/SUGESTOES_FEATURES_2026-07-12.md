# Plano de implementação — Features Granativa

> Revisão de 2026-07-13 sobre o documento original de 2026-07-12. A lista original era
> uma sugestão de IA sem acesso ao código; esta versão foi reescrita depois de ler o
> código real (tipos, hooks, `firestore.rules`, páginas) e inclui: priorização revisada,
> descoberta de que uma feature já foi implementada, dois escopos reduzidos por já
> existir código equivalente, e alertas específicos onde a mudança esbarra na regra
> principal deste projeto (campo/enum novo → `firestore.rules` no mesmo commit).

## Como usar este documento

Cada feature abaixo tem passo a passo com arquivo + função reais, pensado pra ser
executado por um agente sem precisar re-explorar o projeto do zero. Ainda assim,
**confirme que os arquivos/funções citados ainda existem antes de começar** — o código
pode ter mudado desde esta revisão. Ordem sugerida de execução: de cima pra baixo.

Antes de considerar qualquer item pronto: `npm run typecheck` · `npm test` · `npm run
build`. Para os itens que tocam `firestore.rules`, rodar `npm run test:rules` é
obrigatório (não opcional) — é a única defesa automática contra o bug mais caro deste
projeto (campo/enum novo esquecido na regra, 3 incidentes reais já). Deploy de regra
só com autorização explícita do dono.

## Índice de prioridade

- [x] ~~Bills automaticamente `overdue`~~ — **já implementado**, ver nota abaixo. Removido do backlog.
- [x] 1. Filtro por status nos Compromissos
- [x] 2. Meta com data-limite visível no card
- [x] 3. Exportar transações (CSV)
- [x] 4. Widget "quanto posso gastar por dia"
- [x] 5. Atalho de pagamento mais completo a partir de um compromisso (escopo revisado)
- [x] 6. Tags personalizadas (escopo revisado)
- [ ] 7. Orçamento mensal por categoria
- [ ] 8. Importação OFX/CSV bancário
- [ ] 9. Reconciliação "conferido"
- [ ] 10. Split de conta entre amigos (fora do casal)
- [ ] 11. Modo escuro agendado — **confirmar necessidade antes de construir** (ver nota)

---

## ⚠️ Já implementado: bills `overdue` automático

O item #1 do documento original ("Bills automaticamente `overdue`") **já existe em
produção**, provavelmente já quando o documento de sugestões foi escrito:

- [`markOverdueBills`](../src/finance/financeService.ts) (`src/finance/financeService.ts:462-470`)
  varre as bills a cada snapshot e marca `pending` vencida como `overdue`,
  fire-and-forget via `updateBillStatus`.
- É chamada a cada snapshot de `subscribeBills` dentro de
  [`useFinanceData`](../src/finance/useFinanceData.ts) (`src/finance/useFinanceData.ts:171-174`).
- `validBillUpdate` (`firestore.rules:594-618`) já aceita `'overdue'` em
  `status in [...]` — sem risco de rejeição silenciosa.
- Introduzido no commit `477400b` ("fix: corrige 13 bugs de investigacao...").
- `BillsPage` já usa `billStatusLabels[bill.status]` (`src/pages/BillsPage.tsx:196`),
  que exibe o rótulo de atraso corretamente.

**Não implementar de novo.** O único gap real que sobra é visual/navegação — coberto
pelo item 1 abaixo (filtro por status), que agora fica ainda mais valioso porque o
"Em atraso" já é populado automaticamente.

---

## Tier 1 — Alta prioridade

### 1. Filtro por status nos Compromissos

**Prioridade:** mais alta da lista — mais barato, reusa padrão comprovado, e complementa
a automação de `overdue` que já existe.
**Esforço:** ~45min.
**Arquivo:** [`src/pages/BillsPage.tsx`](../src/pages/BillsPage.tsx)

**Problema:** a lista de compromissos (`finance.bills`, renderizada em
`BillsPage.tsx:188-215`) mostra tudo junto — pendente, atrasado, pago, cancelado —
sem filtro. `TransactionsPage.tsx` já resolve exatamente esse problema pra transações.

**Passo a passo:**
1. Copiar o padrão de `TransactionsPage.tsx:24` (`useState<'all'|'income'|'expense'|'transfer'>`)
   e `TransactionsPage.tsx:59-64` (array `typeChips`) — adaptar pra
   `useState<'all' | 'pending' | 'overdue' | 'paid'>('all')` em `BillsPage.tsx`.
   Não incluir `cancelled` como chip próprio (mantém a UI simples, cancelado continua
   visível só em "Todos").
2. Adicionar `useMemo` (importar de `'react'`, hoje `BillsPage.tsx:1` só importa
   `useState`) pra derivar `visibleBills` filtrando `finance.bills` por
   `statusFilter`, espelhando `TransactionsPage.tsx:42-57`.
3. Renderizar o `chip-row` (classe já existe em `global.css`, usada em
   `BillsPage.tsx:242-247` pro seletor de conta) entre o cabeçalho "Lista"
   (`BillsPage.tsx:187`) e o `item-list` (`BillsPage.tsx:189`).
4. Trocar `finance.bills.map(...)` por `visibleBills.map(...)` em `BillsPage.tsx:190`
   e no length-check de `BillsPage.tsx:188`.
5. `EmptyState` (`BillsPage.tsx:216-221`) precisa de uma variante pro caso "filtro sem
   resultado" (mensagem diferente de "nenhum compromisso ainda"), igual
   `TransactionsPage.tsx:148-154` já faz.

**Firestore:** nenhuma mudança — filtro é 100% client-side sobre dado já sincronizado.

**Critério de pronto:** trocar de chip filtra a lista instantaneamente, sem chamada de
rede; bill que vira `overdue` sozinha (via `markOverdueBills`) aparece no chip certo
sem reload.

---

### 2. Meta com data-limite visível no card

**Prioridade:** alta — dado já existe, só falta exibir.
**Esforço:** ~1h.
**Arquivo:** [`src/pages/GoalsPage.tsx`](../src/pages/GoalsPage.tsx)

**Problema:** `Goal.dueDate` (`src/types/contracts.ts:102`, `Timestamp` opcional) é
capturado no formulário de criação (`GoalsPage.tsx:195-198`, campo "Prazo") mas nunca
é lido de volta — o card da meta (`GoalsPage.tsx:126-153`) não referencia `goal.dueDate`
em nenhum lugar.

**Passo a passo:**
1. Não existe hoje um helper de "dias restantes" em `src/finance/financeDates.ts` —
   confirmado por leitura direta do arquivo (só tem `toDate`, `formatFriendlyDate`,
   `monthKeyFromDate`, `todayInputValue`, `fromDateInputValue`). Usar
   `differenceInCalendarDays` de `date-fns` (já é dependência do projeto, usada em
   `financeDates.ts:1` para `isToday`/`isYesterday`) diretamente em `GoalsPage.tsx`,
   sem criar um novo helper genérico pra um único uso.
2. Dentro do `.map` de `goals` (`GoalsPage.tsx:122-154`), calcular:
   ```ts
   const daysLeft = goal.dueDate ? differenceInCalendarDays(goal.dueDate.toDate(), new Date()) : null;
   ```
3. Adicionar uma linha abaixo da barra de progresso (`goal-card-foot`,
   `GoalsPage.tsx:144-147`) só quando `goal.dueDate` existir e `!done`:
   - `daysLeft > 7`: `até {formatFriendlyDate(goal.dueDate)}` em `text-secondary`.
   - `0 <= daysLeft <= 7`: mesmo texto, mas com uma classe de destaque (ex.:
     `text-warning` ou equivalente já usado no projeto — checar `global.css`/
     `themes.css` por uma classe de aviso existente antes de inventar uma nova cor;
     **lembrar da regra do projeto: nada de hex/rgba literal fora de
     `themes.css`/`palette.ts`**).
   - `daysLeft < 0`: "atrasada" ou reaproveitar o mesmo destaque do caso `<= 7 dias`.
4. Meta concluída (`done === true`, `GoalsPage.tsx:124`) não precisa mostrar prazo —
   já mostra "concluída 🎉" (`GoalsPage.tsx:133`).

**Firestore:** nenhuma mudança — campo já existe e já é aceito por `validGoalCreate`
(`firestore.rules:678-720`, `dueDate` já está em `keys().hasOnly([...])` e validado
como timestamp opcional em `firestore.rules:715`).

**Critério de pronto:** meta com prazo cadastrado mostra a distância; meta sem prazo
não muda visualmente; meta a menos de 7 dias do prazo tem destaque visual sem cor
hardcoded.

---

### 3. Exportar transações (CSV)

**Prioridade:** alta — promovida do "média" original. É o item mais barato do
documento inteiro (sem tocar `firestore.rules`, sem coleção nova) e tem valor real de
confiança/LGPD (portabilidade de dados).
**Esforço:** ~3h.
**Arquivos:** novo `src/finance/csvExport.ts` + `src/pages/SearchPage.tsx` (é essa a
página de Análise — apesar do nome do arquivo, a rota `/app/search` concentra Análise
+ Busca, ver `SearchPage.tsx:134-357`).

**Passo a passo:**
1. Criar `src/finance/csvExport.ts` com duas funções puras (sem dependência de
   Firebase/React, testáveis isoladamente, igual `spendingAnalysis.ts`):
   - `transactionsToCsv(transactions: Transaction[], categoryMap: Map<string, Category>, accountMap: Map<string, Account>): string`
   - `downloadCsv(filename: string, content: string): void` (usa
     `URL.createObjectURL` + `<a download>`, sem lib externa).
2. **Formato — três detalhes que quebram export CSV no Brasil se ignorados:**
   - Delimitador `;` (ponto e vírgula), não `,` — o Excel BR usa `,` como separador
     decimal, então `,` como delimitador de coluna quebra a abertura direta do arquivo.
   - Valor em formato brasileiro (`1234,56`, vírgula decimal), calculado a partir de
     `amountCents` — não reusar `formatMoney()` direto (ele inclui `R$` e separador de
     milhar, que atrapalha quem for somar a coluna no Excel).
   - Prefixar o conteúdo com BOM UTF-8 (`'﻿'`) antes do `Blob` — sem isso o Excel
     do Windows abre acentos (ç, ã, é) corrompidos.
3. Colunas: Data, Tipo, Descrição, Categoria, Conta, Valor, Tags — na ordem sugerida
   pelo documento original. `Tipo` usa `transactionTypeLabels[t.type]`
   (`src/finance/financeLabels.ts`, já usado em `TransactionsPage.tsx:12`). Categoria e
   Conta resolvidas via `categoryMap`/`accountMap` (mesmo padrão de
   `SearchPage.tsx:215-216`, `categoryMap`/`categoryNames`).
4. **Limitação a documentar explicitamente na UI ou no código (comentário curto):**
   o CSV exporta a transação como está gravada (`Transaction.amountCents`) — uma
   compra parcelada no cartão sai como o valor cheio da compra na data da compra, não
   diluída por parcela/fatura (isso é o `regime de caixa` que `spendingAnalysis.ts`
   implementa só para a Análise, não pros dados brutos). Replicar a visão por parcela
   no CSV é fora de escopo do v1 — não tentar.
5. UI: adicionar um `icon-button` (padrão de `SearchPage.tsx:354-356`, o botão de
   busca) ao lado do ícone de busca no cabeçalho da página, exportando as transações
   do `selectedMonth` atualmente selecionado (`SearchPage.tsx:144`). Filtrar
   `finance.transactions` por `!deletedAt && (t.cashMonth === selectedMonth ||
   t.competenceMonth === selectedMonth)`, mesmo critério usado em
   `DashboardPage.tsx:106-113` pro resumo de gastos.
6. Nome do arquivo sugerido: `granativa-{selectedMonth}.csv` (ex.:
   `granativa-2026-07.csv`).

**Firestore:** nenhuma mudança — 100% client-side, não consome cota do Firestore.

**Testes:** `transactionsToCsv` é função pura — cobrir com um teste unitário simples
(`src/finance/csvExport.test.ts`, seguindo o padrão de `spendingAnalysis.test.ts`):
caracteres especiais/acentos, valor negativo (estorno), lista vazia.

**Critério de pronto:** arquivo baixado abre direto no Excel BR sem diálogo de
importação, acentos corretos, valores na coluna certa somam sem erro.

---

### 4. Widget "quanto posso gastar por dia"

**Prioridade:** alta — promovida do "baixa" original. Reaproveita 100% de dado já
calculado, aumenta motivo de abrir o app todo dia (não só na hora de pagar conta).
**Esforço:** ~1h.
**Arquivo:** [`src/pages/DashboardPage.tsx`](../src/pages/DashboardPage.tsx)

**Problema:** o Dashboard já calcula tudo que esse widget precisa — não existe dado
novo pra buscar, só uma conta e um lugar pra mostrar.

**Descoberta importante:** `calculateDashboardSummary`
(`src/finance/financeCalculations.ts:251-289`) já devolve `freeToSpendCents`
("Disponível", `DashboardPage.tsx:92-96`) e `committedCutoff`
(`DashboardPage.tsx:51-56`, um `Date` — é a data do próximo recebimento resolvida por
`resolveCommittedCutoff`/`nextPaydayFrom`, `src/finance/payday.ts`). **Não é preciso
chamar `nextPaydayFrom` de novo nem duplicar lógica** — os dois valores já estão
disponíveis como `dashboard.freeToSpendCents` e `dashboard.committedCutoff` dentro do
componente.

**Passo a passo:**
1. Importar `differenceInCalendarDays` de `date-fns` (mesmo pacote já usado no
   projeto).
2. Calcular, só quando `!isCommittedLoading && dashboard.committedCutoff`:
   ```ts
   const daysUntilCutoff = Math.max(1, differenceInCalendarDays(dashboard.committedCutoff, new Date()));
   const perDayCents = dashboard.freeToSpendCents > 0 ? Math.floor(dashboard.freeToSpendCents / daysUntilCutoff) : 0;
   ```
   `Math.max(1, ...)` evita divisão por zero/negativo se o corte cair hoje.
3. **Caso `freeToSpendCents <= 0`:** não mostrar um valor por dia negativo/zero sem
   contexto — trocar a mensagem por algo como "Você já comprometeu tudo que tem
   disponível" (reaproveitar o tom do app, ver `EmptyState`/`notice` existentes pra
   consistência de voz).
4. Posicionar como uma linha extra dentro do card "Disponível" (`dash-metric
   dash-metric--available`, `DashboardPage.tsx:151-155`) — substituir ou complementar
   o `<span className="text-secondary">Livre agora.</span>` (linha 154) por algo como
   `≈ {formatMoney(perDayCents)}/dia até {formatFriendlyDate(dashboard.committedCutoff)}`.
   Evitar criar um card novo — quebraria o grid de 2 colunas de `dash-secondary`
   (`DashboardPage.tsx:150-168`).
5. Estado de loading: usar a mesma flag `isCommittedLoading` (`DashboardPage.tsx:33`)
   que já controla `committedDisplay` — não criar um loading state paralelo.

**Firestore:** nenhuma — puramente derivado de dado já em memória.

**Critério de pronto:** valor por dia aparece junto do "Disponível", atualiza quando
uma transação nova muda o saldo, não quebra no caso de saldo negativo nem sem
`payday` configurado (nesse caso `committedCutoff` cai no fallback de janela de N dias,
que já funciona hoje).

---

### 5. Atalho de pagamento mais completo a partir de um compromisso

**Prioridade:** alta, mas **escopo revisado** — o que o documento original pedia já
existe em grande parte.
**Esforço:** ~1h (revisado — original estimava 2h pra construir do zero).
**Arquivo:** [`src/pages/BillsPage.tsx`](../src/pages/BillsPage.tsx)

**Descoberta importante:** o botão "Pago" (`BillsPage.tsx:204`) já faz o que a feature
original propunha, só que como sheet de confirmação em vez de navegação pra tela de
transação:
- `handleOpenPay` (`BillsPage.tsx:46-50`) abre `BottomSheet` "Confirmar pagamento"
  (`BillsPage.tsx:226-253`).
- `handleConfirmPay` → `payBill` (`src/finance/financeService.ts:603-626`) já cria uma
  transação `expense` com `description`/`categoryId` herdados do compromisso e marca
  `status: 'paid'` no mesmo batch atômico.

**O que falta de verdade:** hoje só dá pra editar **valor** e **conta** no sheet de
confirmação (`BillsPage.tsx:228-247`) — descrição e categoria vêm travadas do
compromisso original. Se o usuário quer lançar com uma descrição/categoria diferente
(ex.: compromisso genérico "Contas do mês" pago como duas categorias), não tem como.

**Duas opções — escolher uma, não implementar as duas:**

**Opção recomendada (menor esforço, mesmo modelo mental):** estender o sheet
existente (`BillsPage.tsx:226-253`) com os campos de descrição (`input` simples) e
categoria (reusar `CategoryField`, já importado em `BillsPage.tsx:5` e usado no form
de criação em `BillsPage.tsx:154-172`) antes do botão "Confirmar pagamento". Passar
esses valores pra `payBill` (que precisa aceitar `description`/`categoryId` como
overrides opcionais em `opts`, hoje só aceita `accountId`/`amountCents`,
`financeService.ts:606-608`).

**Opção alternativa (a do documento original):** botão separado "Lançar agora" que
navega pra `NewTransactionPage` com `state` pré-preenchido
(`{ description, amountCents, categoryId, accountId }`), exigindo que
`NewTransactionPage.tsx` (hoje não lê nenhum `location.state`,
`NewTransactionPage.tsx:35-52`) aceite valores iniciais via `useLocation().state`. Mais
código, mas dá o formulário completo (incluindo parcelamento no cartão, que o sheet
atual de `payBill` não suporta).

**Decisão de produto pendente antes de implementar:** confirmar com o dono se pagar um
compromisso deveria permitir cartão/parcelamento (só a opção alternativa cobre isso)
ou se conta à vista é suficiente (a opção recomendada resolve).

**Firestore:** nenhuma mudança em ambas as opções — `payBill` já grava um payload que
`validTransactionCreate` já aceita (mesmo shape usado hoje).

---

## Tier 2 — Média prioridade

### 6. Tags personalizadas

**Prioridade:** média — **escopo revisado**, menor que o documento original estimava.
**Esforço:** ~4h (revisado pra baixo — parte já existe).
**Arquivos:** [`src/pages/NewTransactionPage.tsx`](../src/pages/NewTransactionPage.tsx),
[`src/pages/TransactionsPage.tsx`](../src/pages/TransactionsPage.tsx), possivelmente
`src/pages/EditTransactionPage.tsx` (não lido nesta revisão — conferir se espelha os
mesmos campos de `NewTransactionPage.tsx` antes de mexer só em um dos dois).

**Descoberta importante:** já existe um campo de tags no formulário de transação —
`NewTransactionPage.tsx:266-268`, dentro do painel "Mais detalhes"
(`<details className="advanced-panel">`, linha 258), um `<input>` de texto livre
separado por vírgula, convertido em array em `handleSubmit`
(`NewTransactionPage.tsx:139-142`, `tags.split(',').map(...).filter(Boolean)`).
`Transaction.tags` já é `string[]` (`contracts.ts:206`) e a regra já valida
`size() <= 8` via `validTags()` (`firestore.rules:283-285`), chamada tanto em
`validTransactionCreate` (`firestore.rules:502`) quanto em `validTransactionUpdate`
(`firestore.rules:555`). **O texto livre já funciona ponta a ponta hoje.**

**O que falta de verdade:**
1. UI de chips em vez de texto livre com vírgula (melhor UX, evita erro de digitação
   tipo "casa,casa " com espaço criando duas tags diferentes de fato iguais).
2. Filtro por tag na busca — `TransactionsPage.tsx` não filtra por tag hoje (só busca
   texto livre que *inclui* tags via `t.tags?.join(' ')`,
   `TransactionsPage.tsx:51-55` — funciona pra busca textual, não pra "ver só
   transações com a tag X").

**Passo a passo:**
1. Trocar o `<input>` de `NewTransactionPage.tsx:266-268` por um componente de chips:
   texto livre + Enter/vírgula cria um chip removível, reaproveitando a classe `.chip`
   já usada em vários lugares do app (ex.: `NewTransactionPage.tsx:209-215`, seletor
   de data). Normalizar (trim + lowercase) antes de adicionar, pra evitar
   duplicata por capitalização.
2. Aplicar a mesma mudança em `EditTransactionPage.tsx` — **conferir esse arquivo
   antes de começar**, esta revisão não o leu.
3. Em `TransactionsPage.tsx`, adicionar um filtro por tag: computar a lista de tags
   únicas presentes em `activeTransactions` (`TransactionsPage.tsx:35-38`) e renderizar
   como `chip-row` adicional (mesmo padrão de `typeChips`,
   `TransactionsPage.tsx:59-64,111-122`), com lógica de filtro `OR entre tags
   selecionadas` (multi-seleção) adicionada ao `useMemo` de `visibleTransactions`
   (`TransactionsPage.tsx:42-57`).
4. Não criar uma coleção `tags` separada — o documento original menciona isso como
   "(Opcional)". Não vale o custo de uma coleção + regra nova (mais um alvo pro bug de
   enum/campo-novo-sem-regra) pra um recurso que hoje é só string livre. Se o pedido
   for renomear/mesclar tags no futuro, revisitar aí.

**Firestore:** nenhuma mudança — `validTags()` já cobre o array como está. **Não
precisa tocar `firestore.rules` pra esta feature**, já que não muda formato do campo,
só a UI de entrada e um filtro client-side.

**Critério de pronto:** criar transação com chips de tag funciona igual ao texto livre
de hoje (mesmo payload); filtro por tag reduz a lista de `TransactionsPage`
corretamente; transações antigas com tags de texto livre (`bill`, `recorrente`,
`meta`, `cofrinho` — ver `financeService.ts:621,706,736,359`) continuam aparecendo
normalmente nos chips (são só strings, sem migração necessária).

---

### 7. Orçamento mensal por categoria

**Prioridade:** média — é a feature de **maior valor estratégico** do documento
inteiro (é o que mais gente espera de um app financeiro), mas também a de **maior
risco de repetir o bug histórico deste projeto** (campo/enum novo em payload do
Firestore sem atualizar a regra no mesmo commit — já aconteceu 2x, ver
`CLAUDE.md`). Seguir o passo a passo à risca, principalmente os passos de regra e
teste.
**Esforço:** ~1,5–2 dias (revisado pra cima — o documento original estimava 2-3 dias
já contando isso, mantido).
**Arquivos novos:** `src/finance/budgetService.ts` (ou funções dentro de
`financeService.ts`, ver decisão abaixo), mudança em `firestore.rules`, mudança em
`tests/firestore.rules.test.ts`.
**Arquivos existentes:** [`src/pages/SearchPage.tsx`](../src/pages/SearchPage.tsx)
(Análise), [`src/finance/useFinanceData.ts`](../src/finance/useFinanceData.ts).

**Modelo de dados — decisão de design:** orçamento é **por categoria, recorrente todo
mês** (não um documento por mês/categoria). Um limite de "R$500 em Restaurantes" vale
todo mês até ser mudado — evita ter que criar um doc novo toda virada de mês. Usar
`budgetId === categoryId` (ID determinístico, igual ao padrão de
`defaultCategories`/`buildDefaultCategory` em `src/finance/defaultCategories.ts`) —
isso dá unicidade de "um orçamento ativo por categoria" de graça, sem precisar de
query de checagem antes de criar.

```ts
// adicionar em src/types/contracts.ts, perto de Category
export interface Budget {
  id: string; // === categoryId
  workspaceId: string;
  categoryId: string;
  limitCents: MoneyCents;
  isActive: boolean;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
```

**Passo a passo:**
1. Adicionar `Budget` em `src/types/contracts.ts` (acima).
2. Em `src/finance/financeService.ts`:
   - Adicionar `'budgets'` a `FinancialCollectionName` (`financeService.ts:41`).
   - `createOrUpdateBudget(workspaceId, userId, categoryId, limitCents)`: `setDoc`
     (não `addDoc`) em `documentRef(workspaceId, 'budgets', categoryId)`,
     fire-and-forget (`fireWrite(...)`, seguir o padrão de `createCategory`,
     `financeService.ts:182-203`).
   - `subscribeBudgets(workspaceId, onNext, onError)`: mesmo padrão de
     `subscribeGoals` (`financeService.ts:535-548`, sem `orderBy` pelo mesmo motivo
     documentado ali — `serverTimestamp()` pendente offline esconderia item recém-criado).
3. Em `src/finance/useFinanceData.ts`: adicionar `budgets` ao `FinanceDataState`
   (linha 19-27), ao `initialState` (29-37), a `FinanceSliceKey`/`REQUIRED_SLICES`
   (50-52) e ao array de `unsubscribers` (167-176) — seguir exatamente o mesmo padrão
   de `bills`/`goals`. **Atenção:** `REQUIRED_SLICES` controla quando `loading` vira
   `false` — esquecer de adicionar `budgets` ali trava o boot do app pra sempre
   (todas as outras coleções esperam por ela).
4. **`firestore.rules` — este é o passo que os dois incidentes históricos pularam.**
   Adicionar, modelado em `validGoalCreate`/`validGoalUpdate`
   (`firestore.rules:678-736`, é o exemplo mais próximo — coleção simples, sem
   sub-relações):
   ```
   function validBudgetCreate(workspaceId, budgetId) {
     return isActiveMember(workspaceId)
       && request.resource.data.keys().hasOnly([
         'id', 'workspaceId', 'categoryId', 'limitCents',
         'isActive', 'createdBy', 'createdAt', 'updatedAt'
       ])
       && request.resource.data.id == budgetId
       && request.resource.data.id == request.resource.data.categoryId
       && request.resource.data.workspaceId == workspaceId
       && validExistingAccountReference(...) // NÃO usar esta — ela é de accountId.
                                              // Em vez disso validar que a categoria existe:
       && exists(/databases/$(database)/documents/workspaces/$(workspaceId)/categories/$(request.resource.data.categoryId))
       && validMoneyCents(request.resource.data.limitCents)
       && request.resource.data.isActive is bool
       && request.resource.data.createdBy == request.auth.uid
       && request.resource.data.createdAt == request.time
       && request.resource.data.updatedAt == request.time;
   }

   function validBudgetUpdate(workspaceId) {
     return isActiveMember(workspaceId)
       && request.resource.data.id == resource.data.id
       && request.resource.data.workspaceId == resource.data.workspaceId
       && request.resource.data.workspaceId == workspaceId
       && request.resource.data.categoryId == resource.data.categoryId
       && request.resource.data.createdBy == resource.data.createdBy
       && request.resource.data.createdAt == resource.data.createdAt
       && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['limitCents', 'isActive', 'updatedAt'])
       && validMoneyCents(request.resource.data.limitCents)
       && request.resource.data.isActive is bool
       && request.resource.data.updatedAt == request.time;
   }
   ```
   (pseudo-código acima simplificado — ajustar sintaxe exata olhando uma função
   vizinha real antes de colar, ex. `validAccountCreate` pra ver como `exists(...)`
   com path literal é escrito no estilo deste arquivo, `firestore.rules:320-323`).
5. Adicionar o `match` block em `firestore.rules`, dentro de `match
   /workspaces/{workspaceId} { ... }` (`firestore.rules:1449-1559`), ao lado de
   `match /goals/{goalId}` (`firestore.rules:1499-1504`):
   ```
   match /budgets/{budgetId} {
     allow read: if isActiveMember(workspaceId);
     allow create: if validBudgetCreate(workspaceId, budgetId);
     allow update: if validBudgetUpdate(workspaceId);
     allow delete: if isActiveMember(workspaceId);
   }
   ```
6. **`tests/firestore.rules.test.ts`** — adicionar um `budgetPayload()` helper
   modelado em `goalPayload()` (`tests/firestore.rules.test.ts:139-157`), e um teste
   `it('validates budget documents', ...)` modelado no teste de goals
   (`tests/firestore.rules.test.ts:1160-1180`): cria um orçamento válido, tenta
   atualizar campo travado (deve falhar), tenta forjar `createdBy` de outro usuário
   (deve falhar), tenta criar orçamento pra categoria inexistente (deve falhar).
   **Importante:** o payload de teste precisa reproduzir o payload real que
   `createOrUpdateBudget` grava — não uma versão simplificada. Foi exatamente uma
   divergência payload-de-teste vs payload-real que escondeu o bug de
   `installment_anticipation_credit` por meses (ver `CLAUDE.md`).
7. Rodar `npm run test:rules` — **não prosseguir pra UI antes disso passar.**
8. UI — Análise (`SearchPage.tsx`): dentro da legenda de categorias
   (`SearchPage.tsx:481-536`, o `.map` de `spendingByCategory.slice(0, 6)`), quando
   existir um `Budget` pra aquela categoria (`budgetByCategoryId.get(cat.id)`), trocar
   a barra de progresso de gasto (hoje só mostra % do total gasto,
   `SearchPage.tsx:509-517`) por uma barra que também marca o limite — verde abaixo de
   80% do limite, amarela entre 80-100%, vermelha acima de 100%. Precisa mapear
   `spendingByCategory` (que hoje só tem `name`/`amountCents`/`color`, sem
   `categoryId` explícito — conferir `SearchPage.tsx:232-243`, ele usa `catId` dentro
   do `.map` mas não inclui no objeto retornado — **vai precisar adicionar
   `categoryId` ao shape retornado** pra conseguir cruzar com o orçamento).
9. UI — tela de configuração dos orçamentos: um `icon-button` novo no cabeçalho de
   `SearchPage.tsx` (ao lado do de busca, `SearchPage.tsx:354-356`) abrindo um
   `BottomSheet` com a lista de `finance.categories` (tipo `expense`/`both`) e um
   input de valor por categoria, reusando `SelectField`/inputs de dinheiro já
   padronizados no projeto (ver `formatMoney`/`parseMoneyToCents`,
   `src/finance/money.ts`).
10. Dashboard: **fora do escopo do v1** — só a Análise mostra orçamento. Se o dono
    quiser um resumo no Dashboard depois (ex.: "2 categorias estouraram o orçamento"),
    tratar como iteração separada.

**Critério de pronto:** `npm run test:rules` passa com os casos novos; criar/editar
orçamento reflete na Análise sem reload; orçamento por categoria sobrevive offline
(fire-and-forget) e não é rejeitado silenciosamente pelo servidor (checar manualmente
em produção, não só no emulador — foi assim que o bug de `installment_anticipation_credit`
escapou dos testes por meses, segundo o histórico do projeto).

---

## Tier 3 — Baixa prioridade / decisões de produto maiores

### 8. Importação OFX/CSV bancário

**Prioridade:** reordenada **antes** da reconciliação (item 9) — importar em lote é o
que cria a necessidade real de conciliar, então faz mais sentido nessa ordem mesmo
sendo a feature mais cara da lista.
**Esforço:** ~1-2 semanas (mantido do documento original — é o item mais caro daqui).
**Por que vale a pena mesmo caro:** dado de contexto, não do código — digitar todo o
histórico financeiro na mão é provavelmente a maior barreira de ativação de um app
financeiro pessoal. Vale considerar antecipar esta feature mesmo sendo cara, se
ativação/retenção de novos usuários virar prioridade do produto.

**O que a leitura do código confirma:**
- Não existe nenhum parser de arquivo no projeto hoje (nem financeiro, nem de outro
  tipo) — seria a primeira feature desse tipo.
- `createTransaction(workspaceId, userId, input: CreateTransactionInput)`
  (`src/finance/financeService.ts:147-180`) já é reutilizável em lote — mas cada
  chamada faz um `setDoc` individual (`await setDoc(...)`, linha 154), não um
  `writeBatch`. Importar 200 transações de um extrato faria 200 escritas
  individuais — trocar por `writeBatch` (limite de 500 operações por batch do
  Firestore; extratos maiores precisam de múltiplos batches sequenciais).
- `Entitlements.canImportStatements` já existe no tipo (`src/types/contracts.ts:376`)
  mas não é lido em lugar nenhum do app hoje (só existe em `billingService.ts`,
  billing inativo) — **não amarrar esta feature ao sistema de billing**, ele está
  desligado por decisão de produto (ver `CLAUDE.md`, "não ativar billing... sem
  pedido explícito").

**Escopo recomendado pro v1 (reduzir o "1-2 semanas" se possível):** começar só com
CSV genérico (usuário exporta do banco em CSV e mapeia colunas manualmente num
preview), não OFX. OFX tem dialeto por banco e exige parser mais robusto — CSV com
preview + mapeamento manual de colunas cobre a maior parte do valor com uma fração do
esforço. Se o dono confirmar que quer OFX de bancos específicos, tratar como
segunda fase.

**Não detalhado a fundo nesta revisão** (esforço grande demais pra caber num item de
"baixa prioridade" sem antes confirmar apetite do dono pra essa frente) — antes de
começar a implementação, validar com o dono: (a) CSV genérico é suficiente pro v1? (b)
quais bancos priorizar se for OFX? (c) como tratar duplicata (mesma transação
importada duas vezes)?

---

### 9. Reconciliação "conferido"

**Prioridade:** baixa, e **depende conceitualmente do item 8** — conciliar contra um
extrato só faz sentido pleno quando existe um jeito de trazer o extrato pro app.
Sem import, "conferido" vira só um checkbox manual de "já revisei isso", que tem
valor bem menor.
**Esforço:** ~4h (revisado pra baixo do "~1 dia" original — o campo é simples).
**Arquivo:** `src/pages/EditTransactionPage.tsx` (não lido nesta revisão — conferir
estrutura antes de editar), [`src/pages/TransactionsPage.tsx`](../src/pages/TransactionsPage.tsx).

**Passo a passo:**
1. Adicionar `reconciledAt?: Timestamp` a `Transaction`
   (`src/types/contracts.ts:189-217`, junto dos outros campos opcionais como
   `deletedAt`).
2. `firestore.rules` — **dois pontos de mudança, os dois no mesmo commit** (regra
   principal do projeto):
   - `validTransactionCreate` (`firestore.rules:457-510`): **não** incluir
     `reconciledAt` em `keys().hasOnly([...])` — reconciliação só faz sentido depois
     de a transação existir, nunca na criação. Se quiser ser explícito, adicionar
     `&& !request.resource.data.keys().hasAny(['reconciledAt'])`.
   - `validTransactionUpdate` (`firestore.rules:512-562`): adicionar `'reconciledAt'`
     em `diff(resource.data).affectedKeys().hasOnly([...])`
     (`firestore.rules:519-542`) e validar
     `(!request.resource.data.keys().hasAny(['reconciledAt']) ||
     request.resource.data.reconciledAt is timestamp)`.
3. `financeService.ts`: `toggleTransactionReconciled(workspaceId, transactionId,
   reconciled: boolean)` — `updateDoc` com `reconciledAt: reconciled ?
   serverTimestamp() : deleteField()` (padrão de `deleteField()` já usado em
   `updateTransaction`, `financeService.ts:416-419`), fire-and-forget.
4. UI: um ícone de check clicável na linha da transação em `TransactionsPage.tsx`
   (`list-row-end`, `TransactionsPage.tsx:176-194`), ao lado do `SyncStatusBadge`.
5. Filtro "Não conferidos": mais um chip ou toggle em `TransactionsPage.tsx`, mesmo
   padrão do item 1 (filtro de bills) e do item 6 (filtro de tags) — considerar
   implementar os três filtros (tipo, tag, conferido) juntos numa única passada pra
   não editar o mesmo arquivo três vezes em três PRs diferentes.

**Testes de regra:** adicionar caso em `tests/firestore.rules.test.ts` — marcar
`reconciledAt` num update deve suceder; incluir `reconciledAt` no create deve falhar
(se a opção explícita do passo 2 for adotada).

---

### 10. Split de conta entre amigos (fora do casal)

**Prioridade:** baixa, mas com uma ressalva importante — **o esforço real não é
"~1 semana"**. É a única feature deste documento que muda o **modelo de confiança**
do produto inteiro, não só adiciona uma tela.

**Por que isso é diferente de tudo mais na lista:** hoje, **toda** leitura/escrita do
app exige autenticação — confirmado lendo `firestore.rules` inteiro: a única exceção
existente é `match /coupleInvites/{inviteId}`, cujo `allow read` aceita
`resource.data.status == 'active' && resource.data.expiresAt > request.time` **sem**
exigir `signedIn()` (`firestore.rules:1561-1564`). Mas mesmo essa brecha nunca é
exercida de fato: `JoinInvitePage.tsx` (`src/pages/JoinInvitePage.tsx:25-33`) só chama
`previewCoupleInvite(code)` quando `user` já está autenticado
(`if (!code || !user || !hasFoundation...) return;`, linha 26) — ou seja, **o produto
nunca teve, na prática, uma jornada de usuário 100% anônima.** Login sempre vem antes
de qualquer leitura de dado real, mesmo quando a regra tecnicamente permitiria ler
sem.

Um "link compartilhável" pra split com amigos, do jeito que o documento original
descreve (pessoa sem conta abre o link, vê o valor, confirma a parte dela), seria a
**primeira jornada verdadeiramente anônima do produto**. Isso implica, no mínimo:
- Rate limiting contra alguém varrendo tokens/IDs pra achar claims de outras pessoas
  (hoje não existe nenhum mecanismo de rate limit no projeto — é tudo Security Rules
  + client-side).
- Nenhum rastro de quem confirmou o quê (sem `request.auth.uid`, a única identidade
  possível é o token da URL — mais fácil de compartilhar/vazar sem querer que uma
  sessão logada).
- Um caminho de escrita pública (confirmar "minha parte") — mais delicado que o
  precedente de `coupleInvites`, que só permite **leitura** anônima; toda escrita no
  projeto hoje, sem exceção, exige `isActiveMember`/`isSelf`/`signedIn()`.

**Recomendação:** não tratar como item de cauda longa de roadmap junto com "modo
escuro agendado". Antes de estimar esforço de verdade, decidir com o dono, como
decisão de produto e segurança separada:
1. Vale abrir mão de "sem conta" e em vez disso reusar o modelo de convite do casal
   (pessoa recebe o link, mas precisa criar conta/logar antes de confirmar — igual
   `JoinInvitePage` hoje)? Isso elimina o problema de confiança inteiro e reaproveita
   `sharedService.ts`/`inviteCode.ts` quase como estão.
2. Se for mesmo pra ser anônimo (sem conta), esse "quase é a primeira Cloud Function
   do fluxo principal" do produto — Security Rules sozinhas ficam frágeis pra esse
   tipo de acesso (não dá pra fazer rate limit em regra do Firestore). Vale revisitar
   a decisão "sem Cloud Functions no fluxo principal" (`CLAUDE.md`) só pra este caso.

**Não escrever passo a passo de implementação até essa decisão ser tomada** — o
"como" muda completamente dependendo da resposta.

---

### 11. Modo escuro agendado — confirmar necessidade antes de construir

**Prioridade:** baixa, e **possivelmente redundante** — vale confirmar com o dono
antes de gastar esforço aqui.

**Descoberta importante:** o modo `system` já existe e já é dinâmico. Em
`src/theme/ThemeRuntime.tsx:17-27`, o app escuta
`window.matchMedia('(prefers-color-scheme: dark)')` com `addEventListener('change',
...)` — ou seja, quando o **sistema operacional** troca de claro pra escuro (iOS e
Android modernos já tem agendamento nativo "claro de dia, escuro de noite" nas
configurações de tela), o app já reage em tempo real, sem precisar reabrir. Ver
também `AppearanceSettingsPage.tsx:20-38`, onde o modo `system` já mapeia claro→Paper,
escuro→Obsidian.

**O que a feature proposta adicionaria de fato:** só cobriria o caso de alguém que (a)
não quer usar o agendamento do próprio celular, ou (b) está num dispositivo/navegador
sem suporte a `prefers-color-scheme` agendado (raro em 2026). Antes de implementar,
vale perguntar ao dono se esse caso de uso é real o suficiente pra justificar o
esforço.

**Se decidir seguir mesmo assim — esforço real é maior que o "~2h" do documento
original**, porque `themeMode` é validado em `firestore.rules` também (não é só
`localStorage` como o documento original assumia):
- `ThemeMode` (`src/theme/theme.types.ts:2`) precisaria de um terceiro valor, ex.
  `'scheduled'`.
- `validThemeFields()` (`firestore.rules:57-63`) trava
  `themeMode in ['manual', 'system']` — **precisa adicionar `'scheduled'` na mesma
  hora que o tipo TypeScript muda**, ou cai exatamente no padrão de bug documentado
  na regra principal deste projeto (campo/enum novo sem atualizar a regra no mesmo
  commit). Este é um exemplo direto onde a "regra principal" do `CLAUDE.md` se
  aplica a uma mudança de **preferência de usuário**, não só dado financeiro.
- `appearance.store.ts` (não lido a fundo nesta revisão) precisaria de um novo efeito
  baseado em horário (`new Date().getHours()`), coexistindo com o efeito existente de
  `matchMedia` em `ThemeRuntime.tsx`.
- UI nova em `AppearanceSettingsPage.tsx` pra configurar os horários (ou horário fixo
  6h-18h, mais simples).

Esforço revisado: **~3-4h**, não 2h, por causa do ponto da regra do Firestore.

---

*Revisão de 2026-07-13, baseada em leitura direta do código (não em suposição) —
tipos em `src/types/contracts.ts`, `src/finance/financeService.ts`,
`src/finance/useFinanceData.ts`, `src/finance/spendingAnalysis.ts`, `firestore.rules`,
`tests/firestore.rules.test.ts`, páginas em `src/pages/`. Documento original de
2026-07-12 preservado em espírito — prioridades, escopos e estimativas foram revisados
onde a leitura do código real divergiu da suposição inicial.*
