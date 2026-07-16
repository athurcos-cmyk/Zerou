# Grazi — Assistente de IA financeira

> **Regra permanente**: toda mudança na Grazi (prompt, modelo, rate limit, UI, fluxo, secrets, correção de bug, nova capacidade) **precisa ser registrada neste documento**. Não existe outro lugar para documentação da Grazi — o histórico mensal (`docs/history/`) e o `CHANGELOG.md` recebem só o resumo + link pra cá.

## Visão geral

Grazi é a assistente de IA do Granativa. Ela responde perguntas sobre os gastos do usuário com base nos dados reais do workspace dele, mais dicas de educação financeira. Roda como Cloud Function do Firebase (`southamerica-east1`) e usa o modelo `deepseek-chat` da DeepSeek.

**Nome**: Grazi (derivado de Granativa). Feminino, duas sílabas, tom de amiga organizada — não de gerente de banco.

**Persona**: amiga que sabe de finanças mas não dá lição de moral. Tom leve, direto, zero economês. Nunca inventa números que não estão nos dados. Entende expressões brasileiras ("gastei uns 10 conto", "tá caro", "valeu").

## Arquivos

| Arquivo | Função |
|---|---|
| `functions/src/ai/deepseekClient.ts` | Cliente HTTP para API DeepSeek (`deepseek-chat`). Timeout 45s, retry único para 429/503, validação de API key. |
| `functions/src/ai/buildFinancialContext.ts` | Agrega dados do workspace (transações 90 dias, bills, contas, budgets, goals, perfil) em string de texto ≤ 5000 chars para o prompt. Lê também perfil do usuário e espaço do casal. Usa BRT (`nowInBRT()`), conta `expense` + `card_purchase`, trata null/undefined/vazio defensivamente. |
| `functions/src/ai/verifyWorkspaceMembership.ts` | Verifica `workspaces/{id}/members/{uid}` com `status == 'active'`. |
| `functions/src/ai/financialAssistant.ts` | Cloud Function `onCall` principal. Fluxo: auth → membership → rate limit pre-check → contexto → DeepSeek → rate limit increment. |
| `functions/src/ai/buildFinancialContext.test.ts` | 17 testes: gastos com categoria, card_purchase, fallback string vazia, deletados, bills, null dueDate, workspace vazio, payday, missing profile, budgets, goals, trend, couple goals, couple sem workspace. |
| `functions/src/ai/verifyWorkspaceMembership.test.ts` | 4 testes: ativo, inexistente, removido, dados nulos. |
| `src/pages/AssistantPage.tsx` | UI do chat. Bolhas (usuário laranja direita, Grazi cinza esquerda), sugestões iniciais, loading "Pensando...", erros amigáveis. |
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

### Contexto financeiro (`buildFinancialContext`)

O contexto é dividido em até 10 seções (algumas só aparecem quando há dados). Assinatura: `buildFinancialContext(db, workspaceId, uid)` — precisa do `uid` desde 2026-07-14 para ler perfil e espaço do casal. Limite de contexto: 5000 caracteres.

**=== RESUMO ===**
- Mês atual e anterior (`yyyy-MM`)
- Gasto total no mês atual vs. anterior (com variação %)
- Receitas no mês atual
- Saldo total em contas (lido de `account.currentBalanceCents`, mantido incrementalmente — nunca mais recalculado só com os últimos 90 dias, ver "Bugs corrigidos")
- Total comprometido (contas + faturas)
- Livre para gastar (saldo - comprometido)

**=== GASTOS POR CATEGORIA ===**
- Top 5 categorias de gasto no mês atual com comparação vs. mês anterior
- Conta `expense` + `card_purchase`, excluindo `deletedAt`

**=== COMPROMETIDO (próximos 30 dias) ===**
- **Contas a pagar**: unifica `bills` (status `pending`/`overdue`, vencimento em até 30 dias ou já vencidas) + `recurring` ativas com `amountCents > 0` e `nextOccurrenceAt` nos próximos 30 dias ou já passada. Recorrentes são anotadas com "(se repete)". Ordenadas: VENCIDAS primeiro, depois avulsas por data, depois recorrentes.
- **Faturas de cartão**: `invoices` com status `open`/`closed`/`overdue`/`partial` e saldo devedor > 0. Lê `outstandingBalanceCents` direto — esse campo é mantido incrementalmente por `invoiceLedgerEntryTrigger.ts` a cada lançamento novo no ledger (ver "Bugs corrigidos")
- Total comprometido quebrado por tipo (contas + faturas)

**Coleções consultadas**: `categories`, `transactions`, `bills`, `recurring`, `cards` + `cards/*/invoices`, `accounts`

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
| Modelo | `deepseekClient.ts:25` | `deepseek-chat` | Verificar se não foi depreciado ao trocar de provedor |
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
6. Não sugere produtos financeiros específicos
7. Tom encorajador, não informal demais
8. Pode usar `**negrito**` para ênfase e listas com `-` (adicionado 2026-07-14)

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

### Comportamentos esperados (não são bugs)

- **Histórico some ao recarregar a página**: o chat é puramente em memória (React state). Não persiste em localStorage/Firestore. Decisão intencional — simplicidade.
- **Cota compartilhada no workspace**: dois membros do mesmo workspace dividem os 60/dia. Um pode esgotar para o outro. Decisão intencional — simplicidade.
- **DeepSeek fora do ar**: sem circuit breaker. Cada chamada tenta 1× (com retry único em 429/503) e falha com mensagem amigável. Custo de Firestore é pago em cada tentativa.
- **`deepseek-chat` hardcoded**: trocar de modelo exige editar `deepseekClient.ts` + deploy.

## Testes

### Unitários (functions)

```
npm --prefix functions run test
```

19 testes em `buildFinancialContext.test.ts`:
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

4 testes em `verifyWorkspaceMembership.test.ts`:
- Membro ativo → resolve
- Membro inexistente → `permission-denied`
- Membro removido → `permission-denied`
- Dados nulos → `permission-denied`

### Manual (pré-requisitos para considerar pronto)

- [ ] Testar com workspace que **só tem compras no cartão** (zero `expense`) — Grazi deve ver os gastos.
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

## Custos

| Recurso | Estimativa |
|---|---|
| DeepSeek API | ~US$ 0,27/1M tokens input + ~US$ 1,10/1M tokens output. ~2.000 tokens/msg → ~US$ 0,002/msg. 60 msgs/dia/workspace → ~US$ 0,12/dia/workspace pesado. |
| Firestore reads | ~4 queries/msg (categories, transactions, bills, accounts). Transactions sem `.limit()` — ~200-800 reads/msg dependendo do volume. 60 msgs/dia → ~12K-48K reads/dia/workspace. |
| Cloud Functions | `southamerica-east1`, 256MB, 60s timeout. Incluso no free tier do Firebase (2M invocações/mês). |

**Custo real estimado**: com 10 usuários ativos usando ~10 msgs/dia cada, menos de US$ 5/mês. O risco de custo é o rate limit ser bypassado (ver bugs corrigidos acima) — por isso a ordem do rate limit foi corrigida e o history passou a ter limite de tamanho.

## Pendências futuras

- [ ] **Sugestões proativas** (Fase 1.5 do plano original): job semanal que gera resumo/dica e salva como notificação in-app. Reaproveitar `onSchedule` já existente.
- [ ] **Cache de contexto**: `buildFinancialContext` é chamado a cada mensagem. Um cache em memória (Map com TTL 30s) por workspace evitaria refazer as mesmas 4 queries para mensagens consecutivas na mesma conversa.
- [ ] **Circuit breaker**: se DeepSeek ficar fora do ar por horas, um doc no Firestore (`aiStatus/deepseek`) com flag `degraded` evitaria bater na API repetidamente.
- [ ] **Persistência de conversa**: salvar histórico no Firestore para sobreviver a reload.
- [ ] **Parâmetro `DEEPSEEK_MODEL`**: mover o nome do modelo para secret ou env var, permitindo trocar sem deploy de código.
- [ ] **Métricas**: dashboard com uso diário, custo estimado, taxa de erro.
