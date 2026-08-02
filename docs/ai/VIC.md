# Vic — Assistente de IA financeira

> **Regra permanente**: toda mudança na Vic (prompt, modelo, rate limit, UI, fluxo, secrets, correção de bug, nova capacidade) **precisa ser registrada neste documento**. Não existe outro lugar para documentação da Vic — o histórico mensal (`docs/history/`) e o `CHANGELOG.md` recebem só o resumo + link pra cá.

## Visão geral

Vic é a assistente de IA do Granativa. Ela responde perguntas sobre os gastos do usuário com base nos dados reais do workspace dele, mais dicas de educação financeira. Roda como Cloud Function do Firebase (`southamerica-east1`) e usa o modelo `deepseek-v4-flash` da DeepSeek (migrado de `deepseek-chat` em 2026-07-25 — a DeepSeek descontinuou esse nome, ver "Bugs conhecidos").

**Nome**: Vic. Feminino, tom de amiga organizada — não de gerente de banco. (Renomeada de "Grazi" para "Vitória" e, no mesmo dia, de "Vitória" para "Vic" em 2026-07-22, a pedido do dono — troca só do nome exibido/prompt de identidade; persona, regras e comportamento não mudaram.)

**Persona**: amiga que sabe de finanças mas não dá lição de moral. Tom leve, direto, zero economês. Nunca inventa números que não estão nos dados. Entende expressões brasileiras ("gastei uns 10 conto", "tá caro", "valeu").

## Arquivos

| Arquivo | Função |
|---|---|
| `functions/src/ai/deepseekClient.ts` | Cliente HTTP para API DeepSeek (`deepseek-v4-flash`, modo não-thinking — thinking desligado por padrão, não precisa de parâmetro extra). Timeout 45s, retry único para 429/503, validação de API key. |
| `functions/src/ai/buildFinancialContext.ts` | Agrega dados do workspace (transações 90 dias, bills, contas, budgets, goals, perfil) em string de texto ≤ 5000 chars para o prompt. Lê também o objetivo/desafio do onboarding e o espaço do casal. Usa BRT (`nowInBRT()`), conta `expense` + `card_purchase`, trata null/undefined/vazio defensivamente. Comprometido sem corte por data desde 2026-07-27 (ver seção COMPROMETIDO). |
| `functions/src/ai/onboardingLabels.ts` | Espelha `src/onboarding/onboardingOptions.tsx` (id → label legível, sem ícone) — Cloud Functions não importa `src/` do app cliente. Usado por `buildFinancialContext.ts` pra traduzir `onboardingGoal`/`onboardingChallenge` num texto natural. Manter em sincronia manualmente. |
| `functions/src/whatsapp/categorySelection.ts` | `selectableCategoryOptions` — tira as **categorias-pai** (que têm subcategoria ativa) da lista que vai pro modelo. Cópia da regra do app (`selectableCategories`, `src/finance/categoryHierarchy.ts`), porque Cloud Functions não importa `src/`; **manter em sincronia manualmente**, com 5 testes próprios travando o comportamento. Aplicado na montagem da lista em `webhookHandler.ts`, o que cobre os dois caminhos: o prompt e o `resolveOrCreateCategory`. Ver `docs/planning/SUBCATEGORIAS.md` `[D12]`. |
| `functions/src/whatsapp/categoryPalette.ts` | Espelho dos **122 ícones e 24 cores** do app (`src/components/categoryIcons.tsx`, `src/theme/palette.ts`) — usado no prompt, na validação e na gravação de categoria criada por mensagem. Trava anti-drift: `src/theme/categoryPaletteSync.test.ts`. |
| `functions/src/ai/verifyWorkspaceMembership.ts` | Verifica `workspaces/{id}/members/{uid}` com `status == 'active'`. |
| `functions/src/ai/financialAssistant.ts` | Cloud Function `onCall` principal. Fluxo: auth → membership → rate limit pre-check → contexto → DeepSeek → rate limit increment. |
| `functions/src/ai/buildFinancialContext.test.ts` | 26 testes: gastos com categoria, card_purchase, fallback string vazia, deletados, bills, null dueDate, workspace vazio, payday, missing profile, budgets, goals, trend, couple goals, couple sem workspace, objetivo/desafio declarado (label legível + id desconhecido ignorado), + 5 sobre o cutoff dinâmico (2026-07-22): receita futura estende o Comprometido além de 30 dias, conta depois da receita não entra, modo conservador respeita `committedWindowDays` do perfil, fatura aberta além do cutoff não entra, fatura fechada sempre entra. |
| `functions/src/ai/verifyWorkspaceMembership.test.ts` | 4 testes: ativo, inexistente, removido, dados nulos. |
| `src/pages/AssistantPage.tsx` | UI do chat. Bolhas (usuário laranja direita, Vic cinza esquerda), sugestões iniciais, loading "Pensando...", erros amigáveis. |
| `src/styles/global.css` | Estilos `.assistant-*` (~140 linhas no final do arquivo). Cores só com `var(--*)`. |
| `src/App.tsx` | Rota `/app/assistant` dentro de `<RequireAuth>` → `<RequireOnboardingComplete>` → `<FinanceDataProvider>`. |
| `src/layout/AppShell.tsx` | Link "Assistente" (ícone `Bot`) na sidebar e menu mobile. |
| `functions/src/index.ts` | Export `financialAssistantChat` do módulo `./ai/financialAssistant.js`. |

## Fluxo de uma mensagem

```
1. Client: httpsCallable('financialAssistantChat', { workspaceId, message, history })
2. Server: valida auth (Firebase Auth uid)
3. Server: verifyWorkspaceMembership (workspaces/{id}/members/{uid} status == 'active')
4. Server: rate limit pre-check (workspaces/{id}/aiUsage/{yyyy-mm-dd} count < 60)
5. Server: buildFinancialContext (4 queries Firestore → string agregada)
6. Server: callDeepSeek (system prompt + histórico + mensagem)
7. Server: rate limit increment (FieldValue.increment(1))
8. Client: exibe reply na UI
```

### Rate limit

- **Limite**: 60 mensagens/dia por workspace.
- **Chave**: `workspaces/{workspaceId}/aiUsage/{data-BRT}` (ex.: `2026-07-13`).
- **Ordem**: pre-check antes do DeepSeek (nega cedo se estourou), incremento depois do sucesso (não queima cota com falha de API).
- **Falha no incremento**: log warning, não bloqueia resposta (a mensagem já foi entregue).
- **Escopo**: por workspace, não por usuário. Dois membros do mesmo workspace compartilham a cota.
- **Sem limite por minuto/rajada** (esclarecido em 2026-07-18): só existe o teto diário acima — nada impede as 60 mensagens em 1 minuto só. A única coisa que amortece rajada hoje é `maxInstances: 10` (`financialAssistant.ts`), e isso é um limite de escala/custo do Cloud Functions, não um rate limit de propósito — nem rejeita ninguém: acima da 10ª instância simultânea, o pedido extra só fica na fila esperando uma liberar (sem erro pro usuário, só uma resposta um pouco mais lenta). Pra ter rate limit por minuto de verdade, precisaria de um bucket novo (mesmo padrão de `aiRateLimit.ts`, só que com chave por minuto em vez de por dia).

### Contexto financeiro (`buildFinancialContext`)

O contexto é dividido em até 10 seções (algumas só aparecem quando há dados). Assinatura: `buildFinancialContext(db, workspaceId, uid)` — precisa do `uid` desde 2026-07-14 para ler perfil e espaço do casal. Limite de contexto: 5000 caracteres.

**=== SEU CICLO ===** (2026-07-17; simplificado em 2026-07-27)
- **Objetivo e desafio declarados no onboarding** (`onboardingGoal`/`onboardingChallenge`), traduzidos pra um label legível via `onboardingLabels.ts` (id desconhecido/stale é ignorado silenciosamente, nunca vaza o id cru pro prompt). Editável a qualquer momento em `/app/settings/onboarding` — a Vic é instruída a usar só como tempero de tom, nunca como fato garantido, já que pode estar desatualizado. *(A parte de "como o usuário recebe" — `payday`/`availableMode`/`committedWindowDays` — foi removida em 2026-07-27 junto com o corte por data do Comprometido; a seção só aparece agora se houver objetivo/desafio.)*

**=== RESUMO ===**
- Mês atual e anterior (`yyyy-MM`)
- Gasto total no mês atual vs. anterior (com variação %)
- Receitas no mês atual
- Saldo total em contas (lido de `account.currentBalanceCents`, mantido incrementalmente — nunca mais recalculado só com os últimos 90 dias, ver "Bugs corrigidos"). **Não soma conta marcada como "fora do saldo"** (`excludeFromTotals`, ver abaixo).
- Total comprometido (contas + faturas)
- *("Livre para gastar" foi REMOVIDO em 2026-07-28 junto com o Disponível do app — a Vic não fala mais nisso; quem cobre "quanto sobra" é a Projeção do próximo mês, abaixo.)*

**=== GASTOS POR CATEGORIA ===**
- Top 5 categorias de gasto no mês atual com comparação vs. mês anterior
- Conta `expense` + `card_purchase`, excluindo `deletedAt`

**=== COMPROMETIDO (contas fixas + faturas em aberto) ===** (modelo novo desde 2026-07-27 — antes tinha cabeçalho com data de cutoff; o corte por data foi removido)
- **Sem corte por data.** Mesma lógica do Dashboard (`buildUpcomingCommitments`, `financeCalculations.ts`): tudo que a pessoa já deve conta.
- **Contas a pagar**: `bills` (status `pending`/`overdue`, TODAS) + `recurring` ativas com `amountCents > 0` (TODAS, cartão e conta). Recorrentes anotadas com "(se repete)". Ordenadas: VENCIDAS primeiro, depois avulsas por data, depois recorrentes.
- **Faturas de cartão**: só o **ciclo atual** de cada cartão (decisão do dono 2026-07-28: "em aberto e a que está pra ser paga, não todas que existem") — por cartão, as `closed`/`overdue`/`partial` (já "pra pagar") contam todas + das `open` só a de vencimento mais próximo (a que acumula agora). As faturas `open` de meses futuros (parcelas de compra parcelada) ficam de fora até chegarem, senão uma compra em 10x somaria as 10 de uma vez. Lê `outstandingBalanceCents` direto (mantido por `invoiceLedgerEntryTrigger.ts`) **menos** as cobranças de recorrência já lançadas nessa fatura (`card_purchase` com `recurringId`) — a recorrência já conta como linha, o desconto evita duplicar.
- Total comprometido quebrado por tipo (contas + faturas)

**=== PROJEÇÃO DO PROXIMO MES ===** (adicionada 2026-07-28 — "deixa a Vic ver a projeção")
- Só aparece se a pessoa configurou um **salário previsto** (`users/{uid}.projectedSalaryCents`, declarado por ela, nunca 0/estimado). Lida no mesmo `userDoc` que o onboarding.
- Mostra: salário previsto declarado, se conta o saldo atual na sobra (`projectionIncludesBalance`), e a **sobra/rombo prevista** = `salário previsto + (saldo atual se ligado) − comprometido`. O prompt instrui a tratar como **simulação declarada**, não saldo garantido nem o saldo real de hoje — isolada, igual no app.

**Contas "fora do saldo"** (2026-08-02, `Account.excludeFromTotals`): vale-refeição, vale-alimentação, cartão presente — contas que o dono marcou como "não é dinheiro de verdade". Uma consulta a mais no começo (`accounts.where('excludeFromTotals','==',true)`, quase sempre vazia) monta o `Set`, e ele descarta:

- a transação daquela conta do gasto por categoria, da tendência e das receitas do mês;
- a conta a pagar e a recorrência debitadas dela do Comprometido;
- o saldo dela do "Saldo total em contas".

A conta **continua listada** em "Saldos:", rotulada `(fora do saldo total, nao conta como dinheiro)` — a Vic precisa saber que o dinheiro existe, só não pode somá-lo. Sem essa exclusão a Vic responderia um saldo e um gasto que **não aparecem em tela nenhuma do app**, que aplica o mesmo recorte desde `useFinanceData.ts` (`countedAccounts`/`excludedAccountIds`). `card_purchase` não grava `accountId`, então gasto de cartão nunca é descartado por acidente.

**Coleções consultadas**: `categories`, `transactions`, `bills`, `recurring`, `cards` + `cards/*/invoices`, `accounts` (duas vezes: saldos + o recorte de `excludeFromTotals`). `users/{uid}` pra onboarding + salário previsto.

**Cuidados de timezone**: todas as datas usam `nowInBRT()` (mesmo padrão de `automation.ts`). Sem isso, entre 21h e 00h BRT no último dia do mês o mês "atual" ficava errado (UTC já virou).

**Cuidados de tipo**: `card_purchase` é tratado como gasto (junto com `expense`). `card_payment` NÃO entra (é transferência entre contas, não gasto novo).

**Cuidados de campo vazio**: `||` em vez de `??` para `competenceMonth`/`cashMonth`/`categoryId` — string vazia `""` não é nullish mas é inválida, e sem `||` a transação sumia do agregado.

**Cuidados de null**: `dueDate` null/undefined em bills não derruba o contexto — pula o bill inválido.

## Configuração

### Secrets (Firebase)

| Secret | Descrição | Como configurar |
|---|---|---|
| `DEEPSEEK_API_KEY` | Chave da API DeepSeek (platform.deepseek.com) | `npx firebase functions:secrets:set DEEPSEEK_API_KEY` |

### Parâmetros ajustáveis (código)

| Parâmetro | Local | Valor | Nota |
|---|---|---|---|
| Modelo | `deepseekClient.ts:36` | `deepseek-v4-flash` | `deepseek-chat` foi descontinuado pela DeepSeek em 2026-07-24 15:59 UTC — verificar se não foi depreciado de novo ao trocar de provedor |
| Timeout DeepSeek | `deepseekClient.ts:7` | 45s | Cold start + prompt grande podem chegar perto |
| Rate limit diário | `financialAssistant.ts:9` | 60 | Por workspace |
| Max tokens resposta | `deepseekClient.ts:42` | 1024 | ~700-800 palavras em português |
| Temperatura | `deepseekClient.ts:41` | 0.3 | Baixa = mais determinística, menos criativa |
| maxInstances | `financialAssistant.ts:30` | 10 | Cloud Run, escala automática |
| Histórico máximo | `financialAssistant.ts:10` | 4000 chars/entry, 10 entries | Limitado no servidor |

### Prompt de sistema

Está em `financialAssistant.ts:16-24` (constante `SYSTEM_PROMPT`). Regras:

1. Objetiva e direta, mas calorosa e amigável
2. NUNCA inventa números
3. Dá dicas práticas baseadas nos dados reais
4. Valores em R$
5. Fora de finanças → recusa educadamente
6. **NUNCA recomenda ou nomeia banco, cartão ou produto de investimento específico — mesmo se a pessoa pedir diretamente** (endurecido 2026-07-18, era "a menos que o usuário pergunte"; pedido do dono: o app não é patrocinado por nenhuma marca, tem que ficar neutro). Pode referenciar contas/cartões que a pessoa **já tem** nos próprios dados (isso não é recomendação de produto).
7. Tom encorajador, não informal demais
8. Se houver objetivo/desafio declarado (SEU CICLO), deixa influenciar sutilmente o tom/sugestões, sem forçar a menção nem tratar como verdade absoluta (adicionado 2026-07-17)
9. Pode usar `**negrito**` para ênfase e listas com `-` (adicionado 2026-07-14)
10. **Decisão financeira grande ou de risco (empréstimo, financiamento, renegociar dívida, tirar cartão novo ou vale a pena a anuidade) não recebe veredito pronto nem só "procure um profissional"** (adicionado 2026-07-18, pedido do dono; refinado no mesmo dia pra incluir decisão de cartão e excluir investimento — ver regra 11): a Vic faz 1-2 perguntas objetivas usando os dados reais da pessoa (ex., empréstimo: "quanto seria a parcela? cabe no seu Livre pra Gastar?"; cartão: "a anuidade compensa com o quanto você usa os benefícios? já tem outro cartão que cobre isso?") pra ajudar a pessoa a pensar sozinha antes de opinar — só depois desse raciocínio, se ainda fizer sentido, sugere profissional qualificado como complemento, nunca nomeando produto (regra 6). Perguntas do dia a dia (gasto do mês, compra pequena) continuam respondidas direto, sem esse cuidado extra. Motivação: usuários reais vão usar a Vic pra tomar decisão de verdade — só recusar/deflectir não ajuda tanto quanto guiar o raciocínio. Depende de histórico de conversa pra funcionar bem (ida e volta) — por isso ficou só no app, que já manda `history` a cada chamada; o WhatsApp (sem histórico) redireciona pro app nesse caso em vez de tentar essa conversa (ver `docs/whatsapp/WHATSAPP.md`, intent `out_of_scope` com `suggestedScreen: 'assistente'`). Existe também um disclaimer formal nos Termos de Uso (seção 9), mas ele não aparece na conversa — essa regra é o reforço comportamental.
11. **Pergunta de investimento (onde investir, ações, tesouro direto, fundos, cripto, previdência) NÃO recebe as perguntas de reflexão da regra 10 — tratamento mais rígido** (adicionado 2026-07-18, pedido explícito do dono: "o ideal sobre investimento é nem falar sobre e falar direito pra buscar um profissional"): zero análise de produto/estratégia, mesmo se pedirem direto. Investimento é atividade regulamentada (exige profissional licenciado — CVM no Brasil), diferente de empréstimo/cartão que são só matemática de orçamento. Explica com carinho (não é recusa fria) e direciona pra profissional/consultor de investimentos qualificado — mas pode continuar ajudando com o que está no escopo dela (ex.: quanto seria um valor razoável pra reserva, com base nos gastos reais).
12. **Nunca finge executar ação nenhuma** (adicionado 2026-07-22, achado pelo dono: pedido de "cadastra minha academia como conta fixa" não tinha regra nenhuma dizendo como reagir — ficava a critério livre do modelo). A Vic do app é 100% consultiva — sem tools/function-calling, nunca escreve no Firestore. Se pedirem pra criar/editar/excluir transação, conta a pagar, recorrência, cartão, categoria, meta ou orçamento, ela deixa claro que não executa isso no chat e aponta a tela certa do app ("Contas e assinaturas" — renomeada em 2026-08-02, o prompt cita o nome novo e foi redeployado junto; Cartões, Transações, Metas/Orçamentos) — nunca deixa a pessoa achar que algo foi salvo. Espelha o mesmo cuidado que o WhatsApp já tinha (intent `out_of_scope` com `suggestedScreen` apontando pra tela certa, ver `docs/whatsapp/WHATSAPP.md` — unificado em 2026-07-25 a partir de intents nomeados por caso).

Para alterar o tom/persona: editar `SYSTEM_PROMPT`. Para alterar o nome: editar o prompt + `src/pages/AssistantPage.tsx` (título `<h1>`).

### Renderização Markdown (2026-07-14)

O cliente (`AssistantPage.tsx`) converte `**negrito**` → `<strong>` e `*itálico*` → `<em>` via `renderAssistantMessage()`. Quebras de linha viram `<br/>`. Apenas mensagens da assistant passam por renderização; mensagens do usuário são texto puro. Se adicionar mais formatação (listas, links), expandir `renderAssistantMessage`.

## Bugs conhecidos (histórico)

### Bugs corrigidos

| Data | Bug | Causa | Correção |
|---|---|---|---|
| 2026-07-13 | Índice composto faltando em bills | Query com `where('status')` + range em `dueDate` precisava de índice | Range movido pra código (filtrar ~20 bills pendentes em memória) |
| 2026-07-13 | `card_purchase` invisível | `buildFinancialContext.ts:53` só contava `type === 'expense'` | Adicionado `SPENDING_TYPES = new Set(['expense', 'card_purchase'])` |
| 2026-07-13 | Dados errados 3h/mês | `buildFinancialContext` usava `new Date()` (UTC), não `nowInBRT()` | Adicionado `nowInBRT()` idêntico ao `automation.ts` |
| 2026-07-13 | Rate limit queimava cota em falha | Incremento era ANTES do DeepSeek | Movido para depois; pre-check mantido antes |
| 2026-07-13 | Injeção de prompt no histórico | `history` sem validação permitia `role: 'system'` e strings gigantes | `validateHistory()` filtra roles, tamanho e tipo |
| 2026-07-13 | Transação com `competenceMonth: ""` sumia | `??` não pega string vazia | Trocado por `\|\|` + fallback para `cashMonth` |
| 2026-07-13 | Null `dueDate` derrubava contexto | `(bill.dueDate as Timestamp).toDate()` sem checagem | Guard `!dueDateTs \|\| !dueDateTs.toDate \|\| isNaN` |
| 2026-07-13 | API key undefined = erro confuso | Sem validação antes do fetch | `getApiKey()` com `HttpsError('failed-precondition')` |
| 2026-07-13 | Contador sub-contado em corrida | `if/else` baseado em `usageDoc.exists` obsoleto (lido antes do DeepSeek); dois requests simultâneos no primeiro uso faziam `.set({count:1})` e o 2º sobrescrevia o 1º | `set({ count: increment(1) }, { merge: true })` incondicional |
| 2026-07-16 | Fatura em aberto sempre reportada como R$ 0,00 | `outstandingBalanceCents` nunca era persistido de verdade no documento da fatura (nascia 0, só o client recalculava do ledger); `buildFinancialContext` lia o campo cru | `outstandingBalanceCents` passou a ser mantido incrementalmente por `invoiceLedgerEntryTrigger.ts`; `buildFinancialContext` lê o campo direto, sem heurística |
| 2026-07-16 | Saldo de conta às vezes errado (mesma classe do bug acima) | Saldo recalculado somando só as transações dos **últimos 90 dias** — conta com movimentação antes disso ficava sub/sobre-contada | Lê `account.currentBalanceCents` (mantido incrementalmente a cada transação, sem limite de janela) |
| 2026-07-16 | Correção acima ficou fora do ar por horas depois de commitada | `git push` não reimplanta Cloud Functions — precisa de `firebase deploy` manual, e o deploy anterior tinha rodado ANTES da correção existir | Deploy manual rodado; ver aviso permanente em `docs/RUNBOOK.md` sobre isso não ser automático |
| 2026-07-22 | Vic podia relatar "Comprometido" diferente do Dashboard | `buildFinancialContext.ts` calculava a janela do COMPROMETIDO com `now + 30 dias` fixo, hardcoded, ignorando o `AvailableMode` (conservador/até o recebimento) e a receita futura já lançada que o Dashboard já considera via `resolveCommittedCutoff` | Portado `resolveCommittedCutoff`/`findNextIncomeDate`/`nextPaydayFrom` pra `functions/src/shared/committedCutoff.ts` (mesmo padrão de `accountEffects.ts`) e usado no lugar da janela fixa — verificado ao vivo (Vic e Dashboard reportando o mesmo valor pro mesmo workspace). Planejado com `/plan-eng-review`. Deployado (`functions:billing:financialAssistantChat`) |
| 2026-07-25 | Vic (app e WhatsApp) parou de responder a QUALQUER mensagem — silenciosamente, sem erro visível pro usuário | A DeepSeek descontinuou o modelo `deepseek-chat` em 2026-07-24 15:59 UTC (`"The supported API model names are deepseek-v4-pro or deepseek-v4-flash"`) — toda chamada em `callDeepSeek()` passou a retornar erro 400. Achado só porque o dono reportou a Vic do WhatsApp não respondendo (investigação revelou que a causa real não tinha nada a ver com o motivo suspeitado — ver `docs/whatsapp/WHATSAPP.md` 2026-07-25) | `deepseekClient.ts`: `model: 'deepseek-chat'` → `'deepseek-v4-flash'` (thinking mode desligado por padrão, comportamento equivalente ao antigo). Deployado (`whatsappWebhook` + `financialAssistantChat`) |
| 2026-07-25 | Log de erro escondia a mensagem real do erro (achado durante a investigação acima) | `logger.error('label', { message: err.message })` do `firebase-functions`: ao montar o log estruturado, `entryFromArgs()` SEMPRE sobrescreve `message` com um stack trace sintético quando a severidade é ERROR e nenhum argumento é uma instância de `Error` — o `message` do objeto passado é silenciosamente descartado. Sem isso, o erro real do DeepSeek acima ficou invisível nos logs até a correção | `webhookHandler.ts`/`metaClient.ts`: mensagem real movida pra dentro da própria string (`` `whatsapp_webhook_error: ${err.message}` ``) em vez de um campo `message` do objeto — sobrevive ao comportamento da lib |

### Categorias: o que a Vic pode e não pode escolher (2026-07-30)

Com subcategorias, a Vic do WhatsApp passou a respeitar a mesma regra do app: **categoria que tem
subcategoria ativa é só agrupamento e não recebe lançamento** (`[D10]`). Sem o filtro ela gravaria
num destino que o app não deixa escolher, e o gasto ficaria na linha "· geral" do pai sem ninguém
ter pedido.

- **Onde**: `selectableCategoryOptions` na montagem da lista (`webhookHandler.ts`), antes do
  prompt. Se o modelo devolver o id de um pai mesmo assim, ele não casa e o lançamento fica **sem
  categoria** — nunca no pai.
- **Risco de drift**: é uma cópia manual da regra do app. Este é o **quinto** ponto de sincronia da
  Vic (junto de ícones, cores, `onboardingLabels` e `committedCutoff`) — mudar
  `selectableCategories` em `src/` sem mexer aqui volta a soltar a Vic no pai, em silêncio.
- **Deploy**: feito em 2026-07-30 (`--only functions:billing:whatsappWebhook`), com o
  `--no-cpu-throttling` reaplicado depois.

### Criar subcategoria por mensagem: entender, e só então oferecer (2026-07-30)

Pergunta do dono: *"como que ela vai saber quando for pra criar uma subcategoria?"*. Ele levantou
duas opções — perguntar antes (como faz com o cartão) ou guardar ~3 mensagens de memória. **Memória
foi descartada**: ela faria a Vic *adivinhar* o pai a partir de uma mensagem anterior, e um palpite
errado cria dado no lugar errado em silêncio. O padrão do cartão é melhor justamente porque
pergunta em vez de inferir.

O desenho escolhido tem **dois caminhos**, e nenhum deles adivinha:

1. **Explícito na mensagem** → `newCategoryParentName` (campo novo em `interpretMessage`). "cria
   Energia dentro de Casa" cria a subcategoria direto, sem passo extra. O prompt proíbe
   explicitamente inferir pai por assunto ("Energia parece coisa de Casa" **não** basta) e usar
   categoria citada em mensagem anterior.
2. **Não citou** → cria como **principal** e *oferece* mover, com a lista numerada das principais
   (`PendingCategoryParent`, TTL de 3 min como as outras pendências).

**Por que oferecer depois em vez de perguntar antes**: a maioria das categorias é principal.
Perguntar antes cobraria de toda criação o custo do caso raro. Aqui a categoria já existe e já
funciona — **ignorar a oferta é uma resposta válida**, e é por isso que a mensagem termina em "se
não, é só seguir".

Essa é a única pendência que **não bloqueia nada**: as outras seguram um lançamento até a escolha;
esta é uma oferta sobre um registro que já foi criado. Se a resposta não casar com nenhum
candidato, ela cai e o fluxo normal segue com a mesma mensagem.

Detalhes que valem lembrar:

- Quem pode ser pai são as **raízes** (`parentCandidateRows`) — subcategoria virando pai criaria
  neta (`[D2]`). É a segunda cópia da hierarquia do app neste arquivo; ambas com teste.
- A filha **herda cor e tipo** do pai, igual ao app. Tipo divergente entre pai e filha já causou um
  bug real (pai voltava a ser selecionável).
- Nome de pai citado que **não existe** não vira silêncio: cria como principal e diz o motivo.
- **Fora de escopo**: criar a hierarquia inteira por mensagem (ex.: "cria Casa com Energia e Água
  dentro") e mover categoria já existente — isso é trabalho de tela.

### Lançar EM subcategoria (2026-07-30)

Pergunta do dono: *"ela sabe criar subcategoria agora, mas ela sabe registrar?"*. Sabe — e melhor
do que só "sabe":

- Subcategoria é **folha**, então já entra na lista que vai pro modelo (quem sai é o pai).
- O prompt manda escolher a categoria **mais específica** que combina, então "paguei 200 de
  energia" cai em `Casa › Energia`, não em algo genérico.
- A lista agora mostra a **hierarquia** (`cat_x: Casa > Água (expense)`). Sem isso, duas "Água" em
  ramos diferentes — que a hierarquia torna *legítimo* — ficariam indistinguíveis, e "paguei a água
  de casa" viraria sorteio.

**Deployado em 2026-07-30** (revisão `whatsappwebhook-00060-6j4`), com o `--no-cpu-throttling`
reaplicado e conferido depois.

**Furo achado ao responder essa pergunta, e fechado no mesmo commit:** o filtro tira o pai da
*lista*, mas havia uma **porta dos fundos**. Quem escreve "gastei 200, coloca na categoria Casa"
com Casa já sendo agrupamento faz o modelo não achar Casa na lista e devolver
`newCategoryName: "Casa"`; `createCategoryFromMessage` encontrava a Casa existente pelo nome e
devolvia o id dela — **o lançamento ia parar no pai**, exatamente o que `[D10]` proíbe. Agora essa
função devolve `isGroup`, e o handler lança **sem categoria** com um aviso explicando o motivo
(calar seria pior: a pessoa acharia que foi categorizado como pediu).

### Comportamentos esperados (não são bugs)

- **Histórico some ao recarregar a página**: o chat é puramente em memória (React state). Não persiste em localStorage/Firestore. Decisão intencional — simplicidade.
- **Cota compartilhada no workspace**: dois membros do mesmo workspace dividem os 60/dia. Um pode esgotar para o outro. Decisão intencional — simplicidade.
- **DeepSeek fora do ar**: sem circuit breaker. Cada chamada tenta 1× (com retry único em 429/503) e falha com mensagem amigável. Custo de Firestore é pago em cada tentativa.
- **`deepseek-v4-flash` hardcoded**: trocar de modelo exige editar `deepseekClient.ts` + deploy (mesma limitação de antes, só o nome do modelo mudou).

## Testes

### Unitários (functions)

```
npm --prefix functions run test
```

26 testes em `buildFinancialContext.test.ts`:
- Gastos com categorias (expense normal)
- `card_purchase` conta como gasto
- Fallback `||` para `competenceMonth`/`categoryId` vazios
- Transações deletadas são ignoradas
- Bills nos próximos 7 dias aparecem
- Bills com `dueDate: null` não derrubam o contexto
- Workspace vazio não crasha
- Bills vencidas aparecem como VENCIDA
- Contas a pagar recorrentes
- Total comprometido
- Saldo das contas (lê `currentBalanceCents` quando presente, cai pro saldo de abertura antes do backfill)
- Payday do perfil do usuário
- Perfil ausente não quebra
- Orçamentos com porcentagem
- Metas com progresso
- Tendência de 6 meses
- Cofrinho do casal
- Casal sem workspace não mostra seção
- Objetivo/desafio declarado no onboarding aparece traduzido em SEU CICLO
- Id de objetivo desconhecido/removido é ignorado, nunca vaza cru pro prompt
- Conta que vence daqui a meses entra no Comprometido, sem corte por data (2026-07-27)
- Conta só o ciclo atual do cartão (fechada + aberta mais próxima); exclui parcelas futuras (2026-07-28)
- Desconta a cobrança de recorrência da fatura — não duplica a assinatura no cartão (2026-07-27)

⚠️ **O mock de Firestore desse arquivo (`fakeQuery`) filtra `==` de verdade desde 2026-08-02** — antes `where()` era no-op **para tudo**. Quando o contexto ganhou `accounts.where('excludeFromTotals','==',true)`, o mock devolveu TODAS as contas como excluídas e 3 testes caíram de uma vez. Corrigir o mock expôs na hora um segundo problema: um cartão de teste sem `isActive`, que só passava porque `.where('isActive','==',true)` não filtrava. **Ao escrever fixture nova aqui, preencha os campos que a consulta real filtra** (`isActive`, `status`, etc.) — senão o doc some e o teste falha por um motivo que não é o que se quer testar. Operadores fora do `==` (`in`, `>=`) seguem no-op.

4 testes em `verifyWorkspaceMembership.test.ts`:
- Membro ativo → resolve
- Membro inexistente → `permission-denied`
- Membro removido → `permission-denied`
- Dados nulos → `permission-denied`

### Manual (pré-requisitos para considerar pronto)

- [ ] Testar com workspace que **só tem compras no cartão** (zero `expense`) — Vic deve ver os gastos.
- [ ] Testar às 22h BRT no último dia do mês — mês atual deve estar correto.
- [ ] Testar com workspace vazio (recém-criado) — não pode crashar.
- [ ] Enviar 61 mensagens no mesmo dia — a 61ª deve ser rejeitada com "Limite diário".
- [ ] Enviar `history` com `role: 'system'` — deve ser ignorado.

## Deploy

```bash
# Build e deploy das Cloud Functions (codebase billing)
npm --prefix functions run build
npx firebase deploy --only functions --project zerou-26757

# Ver logs
npx firebase functions:log --project zerou-26757

# Ver secret
npx firebase functions:secrets:list --project zerou-26757
```

**Nunca deployar `firestore.rules` sem autorização explícita** (regra do `CLAUDE.md`).

## As duas Vics cobram por caminhos diferentes (2026-07-30)

Dúvida do dono: *"eu pensei que a Vic do app usava só a DeepSeek"*. Ela usa a DeepSeek **pra
pensar**, mas quem executa é Cloud Function — então toda mensagem consome **CPU do Google +
leituras do Firestore + tokens da DeepSeek**.

O detalhe que importa: `financialAssistantChat` é `onCall` (processa e só então responde), então
roda no modelo de cobrança **padrão** — CPU só durante a requisição, **ocioso não custa nada**. Já o
`whatsappWebhook` responde 200 à Meta e processa depois, o que obriga o `--no-cpu-throttling` e faz
ele pagar o tempo ocioso.

Consequência prática: **CPU não é o gargalo da Vic do app; leitura é.** `buildFinancialContext` lê,
a cada mensagem, perfil + categorias + transações de 90 dias (limite 2.000) + bills + recorrências +
cartões e faturas + contas + orçamentos + metas + casal — da ordem de **~250 leituras por mensagem**
pra quem tem ~200 transações no período. Quando apertar, encolher o contexto é o caminho; CPU não
resolve nada aqui. Números e patamares em `docs/COSTS.md` seção 8.

## Custos

| Recurso | Estimativa |
|---|---|
| DeepSeek API | ~US$ 0,27/1M tokens input + ~US$ 1,10/1M tokens output. ~2.000 tokens/msg → ~US$ 0,002/msg. 60 msgs/dia/workspace → ~US$ 0,12/dia/workspace pesado. |
| Firestore reads | ~4 queries/msg (categories, transactions, bills, accounts). Transactions sem `.limit()` — ~200-800 reads/msg dependendo do volume. 60 msgs/dia → ~12K-48K reads/dia/workspace. |
| Cloud Functions | `southamerica-east1`, 256MB, 60s timeout. Incluso no free tier do Firebase (2M invocações/mês). |

**Custo real estimado**: com 10 usuários ativos usando ~10 msgs/dia cada, menos de US$ 5/mês. O risco de custo é o rate limit ser bypassado (ver bugs corrigidos acima) — por isso a ordem do rate limit foi corrigida e o history passou a ter limite de tamanho.

## Pendências futuras

- [ ] **Rate limit de 60 msgs/dia é generoso de propósito porque o produto é 100% gratuito hoje** (anotado em 2026-07-18): quando (e se) o Granativa tiver um plano pago, revisar essa cota — pode virar benefício exclusivo do plano pago, o gratuito pode ganhar um teto mais restrito, ou pode continuar como está. Não mexer sem decisão explícita de produto — só documentado aqui pra não ser esquecido quando aquele dia chegar. Ver também `docs/planning/TODOS.md`.
- [ ] **Sugestões proativas** (Fase 1.5 do plano original): job semanal que gera resumo/dica e salva como notificação in-app. Reaproveitar `onSchedule` já existente.
- [ ] **Cache de contexto**: `buildFinancialContext` é chamado a cada mensagem. Um cache em memória (Map com TTL 30s) por workspace evitaria refazer as mesmas 4 queries para mensagens consecutivas na mesma conversa.
- [ ] **Circuit breaker**: se DeepSeek ficar fora do ar por horas, um doc no Firestore (`aiStatus/deepseek`) com flag `degraded` evitaria bater na API repetidamente.
- [ ] **Persistência de conversa**: salvar histórico no Firestore para sobreviver a reload.
- [ ] **Parâmetro `DEEPSEEK_MODEL`**: mover o nome do modelo para secret ou env var, permitindo trocar sem deploy de código.
- [ ] **Métricas**: dashboard com uso diário, custo estimado, taxa de erro.
