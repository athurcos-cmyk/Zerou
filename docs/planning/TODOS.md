# Pendências e roadmap — Granativa

Itens acionáveis. Fechou? Move para "Concluído" ou remove. Detalhe histórico vai para `../history/`.

**Última revisão**: 2026-08-01 — auditoria completa de cada item contra o código real (3 agentes + graphify + grep).

## Abertas

### Confirmar com a usuária do iPhone 16 se a nav parou de congelar (2026-08-08)

Print dela: bottom nav congelada no meio da tela, tapando as compras, no **PWA instalado via
Safari**. Ela confirmou que **a página rolava normalmente** — o que descartou a primeira suspeita
(trava de rolagem vazada do `BottomSheet`, que era bug de verdade e foi corrigido no mesmo dia, mas
não era este) e apontou pra causa real: `html`/`body` com `overflow-x: hidden`, que força
`overflow-y: auto` e transforma o `<body>` em scroll container — configuração clássica de
`position: fixed` descolar no Safari do iOS. Trocado por `clip`. Detalhe no `CHANGELOG.md`.

No mesmo print, o card roxo passava por baixo do relógio/bateria: `viewport-fit=cover` sem
`env(safe-area-inset-top)` em lugar nenhum do projeto. Corrigido junto.

**Falta**: ela reabrir o app depois do deploy e dizer se a barra ainda congela. Não dá pra fechar
daqui — o navegador de preview é Chromium e não reproduz o `position: fixed` do Safari iOS. O que
deu pra provar em Chromium está no `src/test/iosViewportSafety.test.ts` e no console: com `hidden`
o `overflow-y` computa `auto`, com `clip` fica `visible`.

### ~~Deploy das functions pra sumir com o billing da nuvem~~ — FEITO e verificado (2026-08-08)

- [x] ~~Conferir o estado real~~ — **as 5 estavam mesmo implantadas**, incluindo o
  `retryFailedBillingEvents` disparando a cada 15 min e o `stripeWebhook` como endpoint HTTP público.
- [x] ~~Removê-las~~ — feito com **`functions:delete`, não com deploy do codebase**. Ver a lição nova
  no `../RUNBOOK.md`: apagar as 5 pelo nome não encosta nas outras e não passa nem perto da quota de
  CPU do Cloud Run. Verificado depois: 26 → 21 functions, nenhuma das outras tocada.
- [x] ~~`firestore.rules`~~ — não mudou, não precisou de deploy.

### ~~Teste vermelho pré-existente nas functions~~ — CORRIGIDO (2026-08-08)

`messageFormat.test.ts` esperava `*Contas a Pagar*`/`*Contas a Receber*`; as abas reais são
`*Contas e assinaturas*`/`*Dinheiro a receber*` desde 02/08 (fonte da verdade: `src/layout/AppShell.tsx`).
**O teste estava errado, não o produto** — a mensagem do WhatsApp já apontava a aba certa. Asserções
alinhadas e comentário no teste apontando pro `AppShell.tsx`, que este pacote não consegue importar.

### Sobras da auditoria de over-engineering (2026-08-08) — não aplicadas

Achados do `/ponytail-audit` que o dono não mandou mexer. Nenhum é urgente; todos são corte puro, sem
mudança de comportamento.

- [ ] **6 tour stores byte-a-byte iguais** (`src/onboarding/*Tour.store.ts`, 219 linhas). Só muda a
  `SEEN_KEY`. Um `createTourStore('zerou.analysisTourSeen')` + 6 chamadas de 1 linha corta ~160.
  É o corte mais seguro da lista: zero risco, nenhuma regra do Firestore envolvida.
- [ ] **20 arquivos com try/catch próprio em volta do `localStorage`** (`theme.storage`,
  `pushTokenCache`, `pendingInvite`, `profileCache`, `cookieConsent`, `dashboardViewCache`, os 6 tours,
  +8). Um `safeStorage.get/set` de ~15 linhas. ⚠️ Ao fazer, não engolir o caso que o `CLAUDE.md`
  documenta: cache local que evita reescrever no servidor precisa saber quando o servidor mudou por fora.
- [ ] **5 componentes de tour com corpo idêntico** (mesmo `useEffect`, mesmo gate de `welcomeTourSeen`).
  Os slides ficam; só o corpo vira `createScreenTour(store, slides, label)`. ~35 linhas.
- [ ] **4 deps de React dentro das functions só pra montar HTML de email** (`react`, `react-dom`,
  `@react-email/components`, `@react-email/render`). Tradeoff real — react-email resolve compatibilidade
  de cliente de email, e template string à mão volta a ser tabela HTML manual. O item mais discutível
  da auditoria; só mexer se o cold start das functions de email virar problema medido.

### ~~PWA do dono abrindo em tela branca~~ — RESOLVIDO e verificado ao vivo (2026-08-07)

Causa raiz: chaves `firestore_*` acumuladas no `localStorage` desde antes de 24/07 estouravam a quota
e derrubavam o SDK do Firestore (ver `../history/2026-08.md`). Corrigido em
`src/firebase/legacyStorageCleanup.ts`.

- [x] ~~Medir antes de limpar (aba normal × anônima)~~ — foi o que fechou o diagnóstico.
- [x] ~~Validar no aparelho depois do deploy~~ — **o dono confirmou: o app voltou a abrir normal, sem
  limpar dados e sem reinstalar.** Isso prova a cadeia inteira: a limpeza no boot foi o suficiente, e a
  hipótese do service worker servindo HTML velho fica descartada pra este incidente.
- [x] ~~Deploy do `vercel.json` (hash do CSP, fontes, rewrite)~~ — no ar e **medido em produção**:
  `/assets/index-DEADBEEF.js` agora dá **404 `text/plain`** (era `200 text/html`), deep link
  `/app/dashboard` segue **200**, header CSP serve o hash `sha256-fcfPa8XTbRDfoNCe/…` e uma aba limpa
  não registra **nenhuma** violação de CSP. O `rel` do `#font-preload` chega em `stylesheet`, o que só
  acontece dentro do `onload` do script inline — prova de que ele voltou a executar.

Se voltar a acontecer, o `globalErrorHandler` novo mostra a mensagem na tela em vez de branco — o
diagnóstico não depende mais de cabo USB.

### Auditar as outras listas que usam `.list-row` pelo bug de quebra do valor

Achado em 2026-08-07 nas duas telas de cartão e corrigido só nelas (`.invoice-row`, `.entry-row`).
**`.list-row` é flex e a coluna de texto nasce com `min-width: auto`**, então a 375px um rótulo
comprido empurra o valor pra uma linha própria embaixo, alinhado à esquerda — o dinheiro deixa de
ancorar a leitura. Não é hipótese: aconteceu em 3 listas das 2 telas auditadas.

- [ ] Rodar `rg 'className="list-row' src/` e abrir cada tela a **375px** com um rótulo longo real
  (nome de estabelecimento, "Uber para estação pós Karen"). Onde quebrar, trocar por `.entry-row` —
  a classe já existe e é genérica.
- [ ] Na mesma passada, aplicar a régua de cor: **valor neutro quando toda linha da lista tem a mesma
  direção de dinheiro** (ver a regra no `../design/DESIGN.md`). Cor só onde ela distingue algo.

### Coerência do gasto de cartão — sobras da ancoragem de 2026-08-05

A parcela já conta no mês da compra na Análise (ver `../history/2026-08.md`). Estes quatro pontos
foram **auditados e deixados de fora de propósito**, cada um com commit próprio:

- [x] ~~**Dashboard "Resumo de gastos" conta parcelada pelo valor CHEIO**~~ — **RESOLVIDO em
  2026-08-06.** A reimplementação inline de `isCountableExpense` saiu; o Dashboard chama a MESMA
  `spendingByCategoryForMonth` da Análise, com o cronograma das parcelas reconstruído das próprias
  transações (`src/cards/installmentSchedule.ts`) — **sem assinar o ledger, zero leitura nova**, o
  que preserva a decisão de custo do `docs/COSTS.md` e o fix de 25/07 (o Resumo de gastos não espera
  cartão sincronizar). **Verificado ao vivo na conta do dono, agosto/2026**: `Presente R$ 147,00`
  (era R$ 588,00), `Lazer R$ 197,33` no lugar de `Jogos`/`Cinema` soltos, e a variação virou -63%
  (era -48%), batendo com a Análise categoria por categoria. Vieram de brinde 3 divergências que
  ninguém tinha catalogado: estorno não era subtraído, o mês usava `||` em vez do fallback
  `cashMonth ?? competenceMonth`, e a chave de sem-categoria era `'uncategorized'` em vez de
  `NO_CATEGORY`. Detalhe: `../history/2026-08.md` (06/08).
- [x] ~~**Extrato não tem recorte por mês**~~ — **FEITO no mesmo dia (2026-08-06)**, depois de o dono
  usar a primeira versão do atalho: *"eu cliquei em lazer, mostrou todos de lazer, nesse mês, do mês
  passado"*. O atalho manda `&mes=yyyy-MM` e o Extrato ganhou filtro de mês (opção no sheet + chip
  removível no trilho, porque mês é o único filtro que esconde um período inteiro), filtrando por
  `cashMonth ?? competenceMonth` pra bater com o número tocado. Mês sem resultado oferece "Ver todos
  os meses" — saída pro caso de a parcela do mês vir de uma compra de meses atrás.
- [x] ~~**Duas divergências residuais do Resumo de gastos, por não ler o ledger**~~ — **FECHADAS em
  2026-08-06 com dois campos espelho na transação, regras DEPLOYADAS**: `installmentStart` (o "7" de
  "7 de 10") e `anticipatedInstallments` (mapa `mês da fatura` → `mês da antecipação`). Antecipar
  parcela agora aparece no Dashboard, e compra "já em andamento" não desloca mais a série. A
  antecipação reproduz o **par crédito+débito** do ledger em vez de mover a parcela — mover apagaria
  a âncora do deslocamento (a parcela 1 pode ser antecipada) e escorregaria a série inteira; tem
  teste travando. Detalhe: `../history/2026-08.md` (06/08, parte 4).
- [ ] **Dado gravado ANTES de 2026-08-06 não tem os espelhos** — antecipação feita antes dessa data
  continua no cronograma original no Dashboard, e série "já em andamento" cadastrada antes segue 1 mês
  adiantada quando a próxima parcela cai exatamente 1 mês depois da compra. Antecipar de novo grava o
  espelho e conserta dali pra frente. **Não afeta a conta do dono** (as duas "Limite convertido"
  começam na parcela 1 — nada pago). Critério: só migrar se aparecer em conta real; um script de
  migração precisaria ler o ledger pra reconstruir, o que é caro e arriscado por um caso de borda.
  Há teste documentando o comportamento do dado antigo, pra não ser esquecido.
- [x] ~~**`subscribeInvoices`: a janela de 24 faturas corta pelo fim**~~ — **RESOLVIDO em 2026-08-07**
  com DUAS assinaturas por cartão em direções opostas (`>= mês atual` asc + `< mês atual` desc, ver
  `subscribeInvoicesWindow`). ⚠️ Aumentar o limite não resolvia: com `asc` o corte é sempre no futuro,
  em qualquer número — foi o dono quem derrubou a primeira versão do plano perguntando o que acontece
  com 48x hoje + outra 48x em 4 meses (~52 meses de horizonte). A ordem `asc` da lista não depende
  mais da direção da query: `useCardsData` ordena a união. Detalhe: `../history/2026-08.md` (07/08).
- [x] ~~**Origem dos dois `permission-denied` de escrita no console**~~ — **RESOLVIDO em 2026-08-07**:
  era o pagamento de fatura. `validInvoiceLedgerCreate` exige `idempotencyKey == entryId`, e o cliente
  truncava o id em 140 enquanto a chave tinha 150 — regra recusando, batch atômico caindo, `fireWrite`
  engolindo. Pagar fatura de cartão era impossível desde sempre. Ver `../history/2026-08.md` (07/08,
  parte 2) e a seção nova do `CLAUDE.md` sobre payload de teste que satisfaz a invariante que o
  cliente viola.
- [ ] **Conta a pagar paga no cartão ainda trava em 24x** — o teto está na REGRA
  (`validBillInstallments`, `firestore.rules`), não no schema do cliente, então subir exige deploy.
  A compra no cartão foi pra 48x em 07/08 sem deploy porque lá as regras já aceitavam 72.
  `installmentOptions(max)` já exige o teto explícito, e `MAX_BILL_INSTALLMENTS` é o ponto único a
  mudar do lado do cliente. Critério: subir junto com o próximo deploy de regras que já for acontecer.
- [x] **Aba "Pagas" verificada ao vivo (07/08)** — o dono pagou a fatura de ago/2026 no mesmo dia e ela
  **não** saiu do grupo: o critério usava `referenceMonth >= mês corrente`, e fatura fecha e é paga
  DENTRO do próprio mês de referência. Passou a ser `paymentsTotalCents > 0` com saldo zerado, e o grupo
  recolhido virou **aba** (o pedido dele). Verificado ao vivo: `A pagar (13)` / `Pagas (1)`, limite usado
  batendo com a soma das 13.
- [ ] **"Ver mais faturas" ainda sem verificação ao vivo** — a conta do dono não tem fatura anterior à
  janela de 24 meses, então o botão nunca traz nada. Coberto só por teste unitário. Critério: conferir
  quando existir fatura fora da janela, ou montar o caso no emulador.
- [ ] **A Vic só vê 90 dias de transações** — consequência da consulta dela
  (`where('date','>=',ninetyDaysAgo).limit(2000)`): a parcela de uma compra mais antiga que isso não
  entra no gasto do mês que ela relata, enquanto nas telas entra (o ledger tem a parcela). Critério:
  só mexer se alguém notar; ampliar a janela custa leitura por mensagem.
- [x] ~~**Alerta de orçamento conta a compra parcelada pelo VALOR CHEIO**~~ — **RESOLVIDO em
  2026-08-06 removendo as duas superfícies** (decisão do dono: *"eu acho melhor só tirar do
  dashboard"*). O banner (`BudgetAlertBanner.tsx` + `budgetAlertCache.ts`) e o push diário
  (`sendBudgetAlerts`, também **removida do ar**) foram apagados; orçamento passa a viver só na
  Análise, que já carrega o ledger e já conta por parcela. Corrigir o número no Dashboard custaria
  ~700 leituras por boot frio (assinar o ledger no boot) ou uma 3ª reimplementação da conta de
  cartão — as 3 alternativas avaliadas e o motivo de cada descarte estão em
  `../history/2026-08.md` (06/08). No caminho: descoberto que o app mostrava **dois percentuais do
  mesmo limite** (Dashboard 196% vs Análise 49%), e que a function rodava todo dia sem nunca ter
  disparado um alerta.
- [ ] **Categoria estourada não é mais empurrada pra tela de entrada** — consequência aceita da
  remoção acima. A barra de limite existe na Análise, mas a lista mostra **6 categorias** por
  padrão: um estouro na 8ª maior do mês fica atrás do "Ver todas as N". Também não há barra em
  categoria que virou agrupamento (o valor da linha é o roll-up, o limite é gasto direto) nem em
  categoria sem gasto no mês. Critério: quem tem orçamento estourado vê isso sem precisar expandir
  lista — ex.: categoria estourada sobe pro topo, ou marca/contador no cabeçalho da Análise.
  Cuidado: não resolver isso somando filha no pai, que é decisão separada (`[D9]`).

### Segurança — auditoria 2026-07-19 ✅ FECHADA (12/12)

Relatório completo: `~/Desktop/relatorio-auditoria-2026-08-01.md`.

- [x] FIN-01/02/03 — Idempotência de pagamento
- [x] CLIENT-7 — Limpeza localStorage no logout
- [x] CLIENT-3/4/SECRETS-4/5 — Headers segurança
- [x] SECRETS-2 — defineString (decisão do dono)
- [x] WHATSAPP-02 — Zod webhook
- [x] PERF-2/3 — Lazy framer-motion (624→472 KB)
- [x] CLIENT-2 — CSP sem unsafe-inline (SHA-256)
- [x] AUTH-01 — Verificação email client-side
- [x] AUTH-02/ADMIN-5 — Admin custom claims
- [x] LACUNA-04 — Resolvido pela migração claims
- [x] LGPD-01 — DPO contato@granativa.com.br
- [x] LGPD-03/09/14 — DeepSeek nos Termos

Não implementado (decisão consciente):
- [ ] LGPD-02/04 — Export/portabilidade. Script manual se alguém pedir. Self-service com checkout.
- [ ] LGPD-16 — Direito de oposição. Precisa regras + deploy.

### Técnico

- [ ] **⚠️ Push em dobro — NÃO RESOLVIDO** (2026-07-31). `shouldDisplayPush` (Cache Storage) nos dois lados (notifications.ts:103, vite.config.ts:36-49), mas check-then-write não é atômico. Hipóteses: corrida Cache Storage ou redelivery Web Push. 3 tentativas falharam. Ver CLAUDE.md e docs/history/2026-07.md.
- [x] ~~**`sendBudgetAlerts` — verificar no log** se funciona~~ — **verificado em 2026-08-06**: rodava
  todo dia às 10h BRT desde 01/08 sem erro (`FAILED_PRECONDITION` de julho estava resolvido de fato),
  com 1 orçamento ativo em todo o banco e **nenhum alerta jamais disparado**. A function foi
  **removida do ar** na mesma sessão, junto com o banner — ver acima. O índice
  `budgets.isActive` (COLLECTION_GROUP, `firestore.indexes.json:121-132`) ficou sem uso; não vale um
  deploy pra remover, índice não usado não custa.
- [ ] **Pacote compartilhado lógica financeira** — `functions/src/shared/accountEffects.ts` é porta manual de `transactionAccountEffects`. Hoje estão em sincronia. Só fazer se crescer ou divergir.
- [x] ~~**`subscribeInvoices` limita a 24 faturas**~~ — resolvido em 2026-08-07 (duas queries em direções opostas). Ver a seção "Coerência do gasto de cartão".
- [ ] **Code splitting** — bundle principal 472 KB + AuthContext 453 KB. Warning dos 500 KB não dispara mais (framer-motion saiu). Firebase Auth SDK é o próximo vilão mas difícil de separar.
- [ ] **App Check, backups Firestore, alertas custo** — infra, nada implementado.
- [ ] **Procedência logos banco** — 26/29 SVGs com fonte divergente. `public/bank-logos/SOURCES.md`. Decisão do dono pendente.
- [ ] **Emails oficiais** — suporte@/privacidade@ configurados no Cloudflare (Email Routing → zerou.contato.net@gmail.com). Conferir se entregam sem bounce.

### Casal — revisão de 2026-08-03

Entregue: excluir despesa, conta/categoria/data virando transação real, saída do parceiro, acerto
com tela, trava de conexão. Detalhe em `docs/history/2026-08.md`. O que ficou:

- [ ] **⚠️ DEPLOY DAS REGRAS PENDENTE** — 5 mudanças em `firestore.rules` (ramo de saída em `validAuditLogCreate`, delete de claim por quem registrou, `occurredOn` no claim, create de settlement já pago, `receiptConfirmedAt`). **Sem o deploy, "sair do espaço" continua quebrado em produção** e despesa dividida com data é rejeitada em silêncio (offline-first engole o erro). Comando: `npx firebase deploy --only firestore:rules --project zerou-26757`. 103 testes de regras verdes.
- [ ] **Editar despesa dividida** — só dá pra excluir e registrar de novo. Mexer em valor/divisão exigiria refazer a transação pessoal do outro lado (que pode estar em fatura já paga) — mesmo raciocínio que barrou editar valor de compra no cartão em 2026-07-23.
- [ ] **Acerto parcial não tem histórico visível** — a tela mostra o saldo atual e o pagamento aguardando confirmação, não a lista de acertos passados. Os dados existem em `settlements`.
- [ ] **`subscribeActiveInvites` continua assinando depois do casal formado** — a seção de convite não renderiza mais nesse estado. Custo perto de zero (query sem resultado), mas é listener sem uso.
- [ ] **Despesa dividida não aparece no Extrato como "do casal"** — a transação pessoal leva a tag `casal`, mas nada na linha do Extrato indica que ela tem uma contraparte compartilhada.
- [ ] **Contestar não avisa o outro** — muda o status e sai do acerto, sem push nem email. A pessoa só descobre abrindo a tela.
- [ ] **⚠️ Decisão do dono pendente: resgate do cofrinho deixa gasto fantasma na Análise.** Depositar é `expense` (conta como gasto do mês em "Cofrinho"); resgatar é `income`, que `spendingAnalysis.ts:150` **descarta**. Depositar R$ 100 e resgatar R$ 100 no mesmo mês deixa R$ 100 de gasto em Cofrinho pra sempre, com o dinheiro já de volta na conta. Trocar o resgate pra `reimbursement` (em `coupleGoalWithdraw`, `financeService.ts`) fez a linha 185 subtrair e o par se anular — mas cria gasto **negativo** em Cofrinho quando depósito e resgate caem em meses diferentes. Vale pras Metas pessoais também (`deleteGoalWithRefund` usa `income`). Não mexer sem decidir qual dos dois efeitos é preferível.
- [ ] **Despesa dividida: chip default é "Só anotar"** — ou seja, o comportamento padrão continua não lançando na conta, que era a queixa original. Mantido por consistência com o cofrinho (que também default "Só registrar") e por não debitar conta sem a pessoa pedir. Se o uso mostrar que as pessoas erram isso, o default vira a conta principal.
- [x] ~~**Cofrinho: exclusão bloqueada e `byUser` no card**~~ — **verificados ao vivo em produção** (2026-08-03, espaço real do dono com a Vitória): guardar R$ 1,00 com "só registrar" fez aparecer `VOCÊ R$ 1,00 · VITÓRIA RODRIGUES R$ 0,00`; a lixeira abriu "Resgatem antes de excluir" com a divisão e o atalho "Resgatar minha parte" (que abre a folha já em modo resgate); cofrinho vazio segue excluível com o texto novo. Restaurado pra R$ 0,00, saldo do dono inalterado (R$ 332,21) e nada no Extrato — "só registrar" nos dois lados não cria transação.
- [ ] **Aviso "está resgatando mais do que colocou" não foi testado ao vivo** — a condição exige que a OUTRA pessoa tenha depositado (no teste, a parte do dono era o total). Só display, sem escrita.
- [ ] **Reentrada da mesma pessoa não foi testada ao vivo** — regras deployadas e 3 testes de emulador cobrindo (volta permitida, pessoa nova permitida, reativação sem convite negada). O caminho "pessoa NOVA entra no mesmo espaço com os dados intactos" **foi** confirmado em produção (o espaço do dono trocou de parceiro mantendo o cofrinho). Pra fechar o da mesma pessoa: alguém sai e aceita um convite novo.
- [ ] **⚠️ O espaço do casal do dono agora tem uma segunda pessoa real** (não a conta de teste). Teste com escrita ali aparece pra ela também — combinar antes.

### Produto / UX

- [ ] **Vic + contexto de investimento** — `buildFinancialContext.ts` não tem seção de investimentos. Account balances inclui tudo sem filtro. Parâmetro `includeInvestments` não existe.
- [ ] **Contas `investment` legacy** — tipo existe em contracts.ts. `useFinanceData.ts:294` já filtra `type !== 'investment'` do saldo. Nenhuma migração pra contas antigas do tipo.
- [ ] **`--chart-4` tema escuro** — valor real é `#FFD54F` (não `#F9A825` como anotado antes). `#F9A825` é dos temas claros. Fora de escopo (token global).
- [ ] **Categoria nome duplicado** — `createCategory` não valida (financeService.ts:272). Subcategorias tornam duplicata legítima em ramos diferentes. Validação futura = única dentro do mesmo pai.
- [x] ~~**Redesenho da Análise (SearchPage.tsx)**~~ — hero full-width pro "Gasto/Previsto no mês" (`.analysis-hero`, mesmo padrão de `.dash-hero`/`.invoice-hero`), legenda do donut migrada de inline style pra classes (`.category-legend-*`), toggles "Ver todas" reaproveitando `.list-toggle`. "Compras parceladas em andamento" também compactada (3 por padrão, `showAllOngoing`). 523 testes verdes, verificado ao vivo (mobile, tema escuro, mês futuro).
- [ ] **Revisar demais telas** — sem lista fechada, avaliar conforme abrir.
- [ ] **Contas a Receber recorrente (Fase 2)** — `RecurringRule` não tem campo `direction`. Nenhum código de receita recorrente. Plano: `direction: 'payable' | 'receivable'` + botão Registrar espelhado + Cloud Function + deploy manual.
- [ ] **QA manual real no celular** — 10 fluxos.
- [ ] **Tendência pela fatia do donut** — `onClick` na fatia (SearchPage.tsx:627) só seleciona/dimming. Não abre CategoryTrendSheet. Só abre pelo menu "Tendência por categoria".
- [ ] **Copy páginas legais/ajuda** — LegalPages.tsx (246 linhas), sem rewrite de voz.

### Subcategorias — itens adiados

Feature entregue 2026-07-30 (plano: `docs/planning/SUBCATEGORIAS.md`).

- [x] ~~**Vic criar subcategoria por WhatsApp**~~ — **JÁ FEITO** (commit `04c299b`, 2026-07-30). Fluxo completo: `createCategoryFromMessage.ts` aceita `parentCategoryId`, `webhookHandler.ts:433-498` resolve pai e cria com `subcategoryCreatedMessage`, `interpretMessage.ts` entende "cria X dentro de Y". O TODOS.md anterior marcava isso como pendente por engano.
- [ ] **Orçamento no pai somando as filhas** — `spendingAnalysis.ts:192-204`: decisão de produto em aberto. Travado por `[D9]`.
- [ ] **Roll-up no Resumo Anual e alerta de orçamento** — `annualSummaryCalculations.ts:57` não rola. `budgetAlerts.ts:102` consulta Firestore direto por `categoryId`, sem filhos. Travado por `[D9]`.
- [ ] **`CategoryTrendSheet` não rola pro pai** — `CategoryTrendSheet.tsx:63` chama `spendingByCategoryAcrossMonths` sem `rollUpByParent`. Pai agrupado mostra só gasto direto. `rollUpByParent` só roda no donut (SearchPage.tsx:289).

### WhatsApp — Fase 2

- [ ] Parcela em andamento, antecipar, renegociar — redireciona pro app (`out_of_scope`).
- [ ] Editar/excluir por mensagem — redireciona pro app.

### Negócio / legal

- [ ] Revisão jurídica antes de escala pública.
- [ ] Stripe / billing real — só com decisão de produto.
- [ ] Rate limit Vic no plano pago — 60 msg/dia. Rever quando existir plano.

### Design — decisão de NÃO mexer

- [x] Paleta daltonismo — decisão explícita do dono.

## Concluído (recente)

### 2026-08-01 — Ícone de "Compromissos" sumindo em iPhone 16/12 e alguns Android — CONFIRMADO CORRIGIDO

- [x] `.dash-shortcut-row .button` (grid 2x2 de atalhos do Dashboard mobile) ganhou
      `min-width: 0` (item de grid herda `min-width: auto`, e "Compromissos" — a palavra mais
      longa da fileira, sem ponto de quebra — pode forçar o WebKit a espremer o ícone SVG até
      sumir em vez de deixar o texto quebrar) + `flex-shrink: 0` no SVG do ícone, reforçando que
      ele nunca deve ser comprimido. Mesma classe de bug já documentada no DESIGN.md
      ("input gigante em flex/grid precisa de min-width: 0"). Não reproduzível no Chromium
      (testado 393×852/390×844/320×700 — engine Blink não tem o bug de sizing do WebKit,
      independente do viewport). **Confirmado corrigido pelo dono em iPhone real.**

### 2026-08-01 — Bug real: "Projeção do próximo mês" recalculava do zero no boot (achado pelo dono)

- [x] Ao contrário de Saldo total/Comprometido (que já usam `dashboardViewCache` pra mostrar o
      último valor conhecido enquanto Firestore ainda não respondeu), a "Sobra prevista" era
      100% recalculada a cada abertura do app com `bills`/`recurringRules`/`invoices` ainda
      vazios no boot — mostrava por um instante "sobra = salário inteiro" (sem descontar nada)
      antes de cair pro valor real quando os compromissos chegavam. `CachedDashboardView` ganhou
      `nextMonthProjection` (`dashboardViewCache.ts`, com fallback `null` pra cache de formato
      antigo sem essa chave — não invalida o resto); `DashboardPage.tsx` usa o mesmo gate `cache`/
      `isCommittedLoading` que o Comprometido já usa (mesma dependência de invoices/cards). A
      sheet de edição (`NextMonthProjectionSheet`) continua com o valor AO VIVO, não o cacheado —
      é onde a pessoa ajusta o número, precisa refletir o estado atual. 2 testes de regressão
      novos em `dashboardViewCache.test.ts`. Verificado ao vivo (localStorage confirma
      `nextMonthProjection` persistido, valor idêntico ao exibido após reload).

### 2026-08-01 — Busca em recorrências + filtro de categoria descobrível em Transações

- [x] **Recorrências**: campo de busca por nome acima da lista (`BillsPage.tsx`) — buscar
      mostra todos os resultados (ignora o cap de 3), toggle "Ver todas" some durante a busca.
- [x] **Transações**: filtro por categoria já existia (via texto digitado na busca), mas
      invisível — ninguém descobria sozinho. Novo `SelectField` "Categoria" (searchable) na
      sheet de Filtros, junto de Tag/Cartão, contabilizado no badge "Filtros · N".

### 2026-08-01 — Contas a Pagar compactada (3 por padrão)

- [x] "Recorrentes" e "Compromissos" (contas avulsas) mostravam a lista inteira sem limite —
      agora só as 3 primeiras, com `.list-toggle` ("Ver todas as N" / "Ver menos"), mesmo padrão
      já usado na Análise (compras parceladas) e na Fatura. Trocar de filtro em Compromissos
      (Em aberto/Vencidas/Pagas/Todas) reseta o "Ver todas". Verificado ao vivo com 12
      recorrentes reais.

### 2026-08-01 — Bug real: sync de tema em loop infinito de permission-denied — CORRIGIDO E DEPLOYADO

- [x] `firestore.rules` (`validThemeFields`) só aceitava os 6 nomes antigos de tema
      (`paper, sakura, obsidian, midnight, aurora, rose-gold`) — o client já usa 12 nomes novos
      desde o rebrand (`src/theme/theme.types.ts`: `paper, perola, floresta, lavanda, rosa, areia,
      noturno, carbono, cobalto, ametista, grafite, vinho`). Escolher qualquer tema que não seja
      "Paper" nunca persistia no servidor — o `AppearanceSyncBridge` ficava retentando pra sempre
      (write rejeitado → SDK reverte cache local → snapshot dispara de novo → retenta), inundando
      o console com `permission-denied` em TODA página (Dashboard, Análise, etc.), achado
      investigando um relato não relacionado ("orçamento de subcategoria não mostrou"/tela preta).
      Regra corrigida pra aceitar os 12 nomes atuais + teste de regressão novo em
      `tests/firestore.rules.test.ts` (rejeita nome antigo tipo `sakura`). 93/93 testes de regras
      verdes no emulador. **Deployado em produção** (`npx firebase deploy --only firestore:rules
      --project zerou-26757`, autorizado pelo dono) e verificado ao vivo: mutações antigas
      presas na fila do IndexedDB do cliente ainda geravam ruído por alguns reloads, mas
      confirmado com instrumentação que o loop parou de vez após o deploy.

### 2026-08-01 — Bug real: orçamento de subcategoria nunca aparecia na Análise

- [x] O orçamento de uma subcategoria (ex.: "Guloseimas" dentro de "Alimentação") sempre foi
      gravado certo no Firestore — o bug era só de EXIBIÇÃO: a lista/donut da Análise soma
      subcategoria no pai (`rollUpByParent`), então só o PAI vira uma linha; a expansão de
      subcategorias (`SearchPage.tsx`, dentro de `cat.children.map`) nunca olhava
      `budgetByCategoryId` pra elas — só a linha do pai tinha barra/%/limite. Corrigido: cada
      subcategoria na expansão agora mostra o mesmo `X% lim.` que a linha principal, verificado
      ao vivo com "Guloseimas" (orçamento pré-existente de R$100, 6% usado).

### 2026-08-01 — Redesenho da Análise

- [x] Hero visual (`.analysis-hero`), legenda do donut em classes CSS, "Compras parceladas em andamento" compactada (3 padrão)

### 2026-08-01 — Limpeza pós-auditoria

- [x] pushDebug removido (função + regra + 2 testes, -116 linhas)
- [x] 18 investmentValueUpdates órfãos limpos via Admin SDK
- [x] `recordRecurringPayment || → ??` — já resolvido via `resolvePaymentMethod.ts`

### 2026-08-01 — Auditoria segurança (12/12)

- [x] Idempotência, logout cleanup, verificação email, admin claims, Zod webhook, CSP hash, lazy landing, DPO

### 2026-08-01 — Investimentos

- [x] Feature entregue + QA ao vivo (6 bugs). Detalhe: `docs/history/2026-08.md`.

### 2026-07-31 — Push + exclusão conta + admin

- [x] Push causa raiz (escopo SW), PWA-only, cache corrigido
- [x] Exclusão conta: 4 resíduos
- [x] Admin mensagens push/email

### 2026-07-30 — Subcategorias

- [x] Feature entregue. Vic cria subcategoria por WhatsApp (commit `04c299b`).

### 2026-07-28/29 — Análise + Comprometido

- [x] Ordenação 2 níveis, competência, donut SVG, acerto saldo, Comprometido simplificado

### 2026-07-24/25 — Offline + dashboard

- [x] Auditoria offline, crash localStorage, Projeção, calculateInvoice client-side

### 2026-07-23 — Cartão crédito

- [x] 4 pendências + 3 bugs. Editar compra, Resumo Anual, ordenação ledger.

### Anteriores

- [x] Hero visual Dashboard, cartão em Contas a Pagar, recorrência virou lembrete, emails, tendência, contas a receber F1, Análise >300 transações, cache boot, metas, saldo incremental, WhatsApp integração, Vic, landing, rebrand, Cloudflare, legal
