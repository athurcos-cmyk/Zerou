# Análise do Projeto Granativa — 2026-07-12

Documento gerado a partir de uma leitura completa do código, regras, documentação,
histórico de bugs e decisões de produto. Organizado em: pontos fortes, riscos
identificados e observações pontuais de código/regra.

---

## 1. Pontos fortes

### 1.1 As regras do Firestore são excepcionais

O arquivo `firestore.rules` tem 1603 linhas. Cada tipo de documento (usuário, workspace,
conta, categoria, transação, bill, recorrência, meta, contribuição, cartão, fatura,
ledger, membro, claim, settlement, invite, audit log) possui funções de validação
dedicadas — `valid*Create` e `valid*Update` — com checagem campo a campo via
`keys().hasOnly([...])`, `diff().affectedKeys().hasOnly([...])`, ranges de valor,
transições de estado explícitas e referências cruzadas entre documentos.

Isso é raro. A maioria dos projetos para em "está autenticado". Aqui, até campos
opcionais como `anchorDay`, `installmentNumber` e `onboardingGoal` têm validação
condicional bem definida. O arquivo de regras é essencialmente uma documentação viva
do schema de dados — mais preciso que qualquer type do TypeScript, porque é validado
em runtime pelo servidor.

### 1.2 A documentação é de alto nível

O sistema de documentação funciona como memória externa do projeto:

- **`CLAUDE.md`**: instruções para agentes de IA, regras permanentes (offline-first,
  regra de sincronia campo-regra), mapa de contexto, convenções, deploy.
- **`SESSAO.md`**: brief do estado atual — stack, URLs, decisões arquiteturais,
  comportamentos-chave de cada subsistema (cartões, recorrências, análise, casal,
  admin, Firestore, PWA). É denso e sempre atualizado.
- **`CHANGELOG.md`**: 723 linhas de histórico resumido, cada entrada com o que mudou,
  por que, como foi verificado e quais validações passaram.
- **`docs/BUSCA_RAPIDA.md`**: índice navegável — onde está cada assunto, comandos de
  busca, mapa de arquivos.
- **`docs/planning/TODOS.md`**: pendências acionáveis com critério de conclusão claro.

O fato de que **cada bug grave gerou uma regra permanente documentada** mostra
maturidade de processo — não é só "corrigir e seguir", é "impedir que aconteça de novo
documentando a causa raiz".

### 1.3 Offline-first não é slogan, é implementado

A arquitetura offline-first permeia o projeto inteiro:

- **Transporte**: `persistentLocalCache` + `experimentalAutoDetectLongPolling`
  (`src/firebase/config.ts`) — o Firestore mantém cache local em IndexedDB e sincroniza
  em background.
- **Escrita**: todas as mutações usam fire-and-forget (`.catch()`), nunca `await`. A UI
  responde imediatamente do cache local; o `onSnapshot` reflete a mudança.
- **Leitura de snapshot**: `readSnapshotDoc` (`src/firebase/snapshotData.ts`) passa
  `serverTimestamps: 'estimate'` — sem isso, `snapshot.data()` devolve `null` pra
  qualquer `serverTimestamp()` pendente, e uma transação excluída offline simplesmente
  não sumia da UI (bug real, corrigido em 2026-07-11).
- **Boot**: `AuthContext` inicializa estado sincronamente do `localStorage`. Se há
  perfil em cache, o app abre instantaneamente — sem tela "Carregando...". Firebase
  confirma a sessão em background com timeout de 500ms.
- **Fonts**: Google Fonts carregadas de forma não-bloqueante (`preload + onload`) e
  cacheadas pelo Workbox com `CacheFirst`.

Os 3 incidentes de bugs "invisíveis" (categoria `createdBy`, `installment_anticipation_credit`,
`displayName` nas regras de membro do casal) vieram justamente de o offline-first
**funcionar bem demais** — a UI mostrava sucesso, o dado entrava no cache local, mas
o servidor rejeitava silenciosamente. Isso já foi mitigado com `fireWrite` logando
`permission-denied` no console em desenvolvimento.

### 1.4 Suíte de testes sólida

- **247 testes em 25 arquivos** (Vitest), todos passando.
- **43 testes de regras do Firestore** rodando no emulador via `npm run test:rules`
  (desbloqueado em 2026-07-10 com `scripts/with-java.mjs` depois de meses parado).
- **Testes de domínio puro**: `spendingAnalysis.test.ts` (11 casos), `financeCalculations.test.ts`,
  `cardDates.test.ts`, `payday.test.ts`, `subscriptionServices.test.ts`, `coupleGoalStats.test.ts` (12 casos).
- **Teste de qualidade de código**: `noHardcodedColors.test.ts` falha se houver hex/rgba
  literal fora de `themes.css` e `palette.ts`.

A lição dos 3 incidentes de regra é que **um teste que não roda não é rede de segurança,
é ilusão** — o emulador ficou meses parado e nesse período 3 bugs de produção passaram
despercebidos. Quando voltou a rodar, revelou 5 testes que estavam escritos errado
(incluindo um `expiresAt` hardcoded que seria bomba-relógio e um seed que impedia o
teste de exercitar a regra de create).

---

## 2. Riscos identificados

### 2.1 Serviços monolíticos crescendo

`financeService.ts` (684 linhas), `cardService.ts` (653 linhas), `sharedService.ts`
(700 linhas). Esses três arquivos concentram **todos os writes** do app — e foram
exatamente neles que os 3 bugs de "campo novo sem atualizar regra" nasceram.

Quando um arquivo tem 700 linhas, adicionar um campo no schema Zod no topo e outro
no payload 400 linhas depois é uma operação de 2 segundos. A regra do Firestore está
em outro arquivo completamente diferente (`firestore.rules`), e o payload de teste de
regras está num terceiro arquivo (`tests/firestore.rules.test.ts`). Nenhum linter,
type-checker ou teste automatizado grita "ei, você também precisa atualizar a regra".

**Encaminhamento sugerido**: separar pelo menos as funções de create de cada entidade
em módulos próprios (`finance/accounts.create.ts`, `finance/transactions.create.ts`,
etc.) com cada módulo exportando uma referência documentada à função de validação
correspondente na regra. Não resolve o problema, mas reduz o atrito de "onde está a
regra disso mesmo?" e facilita grep reverso.

### 2.2 O `spread` frágil em `accountDeletionService.ts`

Já está documentado como "Pendência remanescente" no `CLAUDE.md`. O método
`leavePartnerWorkspace` espalha `...workspaceRefData` inteiro num `batch.update` e
depois sobrescreve `status`/`updatedAt`. Se o tipo `WorkspaceRef` ganhar um campo
novo amanhã e a regra `validCoupleWorkspaceRefUpdate` não prever esse campo no
`diff().affectedKeys().hasOnly([...])`, a saída do parceiro do espaço compartilhado
**quebra do mesmo jeito que a criação de categoria já quebrou** em 2026-06.

**Encaminhamento sugerido**: trocar o spread por um objeto explícito com só os campos
necessários: `{ status: 'removed', updatedAt: serverTimestamp() }`. É uma edição de 2
linhas que elimina uma classe inteira de bug potencial.

### 2.3 Tailwind v4 instalado, sintaxe v3 no CSS — preflight nunca roda

`global.css` usa as diretivas legadas `@tailwind base; @tailwind components; @tailwind utilities`
(estilo Tailwind v3), mas o pacote instalado é `@tailwindcss/postcss` (v4). O plugin
v4 **não processa** essas diretivas — elas são silenciosamente ignoradas. Isso significa
que **todo o preflight do Tailwind nunca chega a existir no CSS final**.

O preflight é o reset CSS que o Tailwind aplica por padrão: `box-sizing: border-box`,
`margin: 0`, `list-style: none`, `img/button { display: block }`, etc. Nada disso roda.

Já houve um sintoma real (2026-07-08): `<button>`/`<input>`/`<select>`/`<textarea>`
nativos sem classe caíam na cor preta padrão do navegador (`buttontext`), ilegível nos
4 temas escuros. Corrigido com um reset manual em `global.css`.

Mas o problema é mais profundo: **qualquer pessoa que assumir "estou usando Tailwind,
logo X já existe" vai introduzir bugs sutis**. Classes como `list-none`, `box-border`,
`block` podem não funcionar como esperado em elementos sem classe explícita.

**Encaminhamento sugerido**: ou migrar para `@import "tailwindcss"` (mudança maior
de pipeline — precisa testar o build), ou documentar no próprio `global.css` que o
preflight não roda e listar quais resets foram aplicados manualmente.

### 2.4 Transações com limite fixo de 300 — sem plano de migração

`subscribeTransactions` tem `.limit(300)` (adicionado em 2026-06-17 pra evitar
crescimento ilimitado de memória). Um usuário ativo cadastrando 3 transações por dia
bate esse limite em ~3 meses. A documentação reconhece o trade-off com um critério de
"~500-1000 docs por workspace", mas não há plano do que fazer quando chegar lá.

A lista de transações (`TransactionsPage`) mostra as 300 mais recentes e pronto —
transações antigas somem da lista sem aviso. O saldo e os cálculos não são afetados
(vêm de aggregates), mas o usuário perde visibilidade do histórico.

**Encaminhamento sugerido**: duas abordagens complementares:
- Paginação por mês: `where('cashMonth', '==', selectedMonth)` — a navegação por mês
  já existe na Análise (`MonthSwitcher`), poderia ser estendida pras Transações.
- Botão "Carregar mais" com cursor (padrão que o admin já usa com `AdminCursor`).

### 2.5 Bills nunca ficam `overdue` automaticamente

Está no `TODOS.md`: "Contas a pagar (`Bill.status`) nunca viram `'overdue'`
automaticamente — ficam 'Pendente' pra sempre mesmo com vencimento no passado."

O cálculo do "Comprometido" no Dashboard está correto (usa a data de vencimento real,
não o status). Mas a lista de contas a pagar (`BillsPage`) não tem indicação visual
de atraso — uma conta vencida há 15 dias aparece igual a uma que vence amanhã.

**Encaminhamento sugerido**: um efeito client-side simples que, ao carregar as contas,
atualiza `status: 'overdue'` via fire-and-forget para documentos com `dueDate < now`
e `status === 'pending'`. A regra `validBillUpdate` já aceita `status in ['pending',
'paid', 'overdue', 'cancelled']` — não precisa mudar regra. É seguro e barato.

---

## 3. Observações pontuais de código/regra

### 3.1 `validRecurringCreate` permite `amountCents` opcional

```js
(!request.resource.data.keys().hasAny(['amountCents']) || validMoneyCents(...))
```

Isso significa que a regra aceita a criação de uma recorrência sem valor. Pode ser
intencional (recorrência de valor variável como conta de luz), mas o formulário do app
sempre envia o campo. É uma brecha que permite um documento sem valor no Firestore.
Se for intencional, vale documentar. Se não for, a condição deveria exigir o campo.

### 3.2 `validAccountDelete` permite qualquer membro ativo deletar

```js
allow delete: if isActiveMember(workspaceId);
```

A UI bloqueia se a conta tem transações vinculadas, mas a regra não. Um cliente com
bug ou malicioso poderia deletar uma conta com histórico. As transações não somem
(ficam órfãs de conta), então não é perda de dado — mas é inconsistente com
`categories`, `transactions` e `bills` que exigem `canDeleteWorkspaceTree` (só o
dono ou durante exclusão total da conta). Vale alinhar: ou todas as coleções permitem
member comum deletar, ou todas exigem `canDeleteWorkspaceTree`.

### 3.3 `validGoalUpdate` não permite mudar nome nem valor-alvo

A regra confere explicitamente:
```js
request.resource.data.name == resource.data.name
&& request.resource.data.kind == resource.data.kind
&& request.resource.data.targetCents == resource.data.targetCents
```

Só `savedCents`, `isActive` e `updatedAt` podem mudar. Se a UI algum dia oferecer
"editar meta" (mudar nome, ajustar valor-alvo), a regra vai rejeitar silenciosamente.
Não é bug hoje (a UI não oferece isso), mas é uma restrição não óbvia pra quem for
implementar edição de meta no futuro.

### 3.4 Ledger de fatura é append-only

```js
allow update: if false;
```

Isso é ótimo pra auditoria financeira. Mas combinado com o fato de que
`softDeleteTransaction` não apaga o ledger, os lançamentos de um cartão excluído
continuam existindo. Se o usuário recriar um cartão com o mesmo nome, as compras
antigas **não** reaparecem — `useCardsData` filtra `isActive` nos cartões. Mas o
dado fica lá pra sempre, ocupando cota de leitura nas queries de ledger. Pra um
usuário que cria e exclui cartões com frequência, isso acumula. É intencional
(auditoria), mas é bom saber que existe esse custo.

### 3.5 `anchorDay` não está na lista de campos alteráveis do `validRecurringUpdate`

O `diff().affectedKeys().hasOnly([...])` do update de recorrência não inclui `anchorDay`.
Isso significa que, depois de criada, a recorrência **nunca** pode ter seu dia âncora
alterado. Isso está correto (anchorDay é o dia original, o que permite voltar ao dia 31
depois de fevereiro), mas se alguém tentar implementar "corrigir dia da recorrência"
via update, vai tomar `permission-denied` sem uma mensagem clara do porquê. Vale uma
nota na documentação ou um comentário na regra.

### 3.6 O campo `syncStatus` nas transações

`validTransactionCreate` exige `syncStatus == 'synced'`. A atualização permite
`syncStatus in ['synced', 'pending', 'failed']`. Na prática, o app sempre cria com
`'synced'` e nunca atualiza esse campo — o status de sincronização real vem do
`hasPendingWrites` do Firestore SDK (`localSyncStatus` no objeto mapeado). O campo
`syncStatus` no documento parece ser um placeholder pra um mecanismo de sync queue
que nunca foi implementado (e talvez nunca precise ser, já que o Firestore lida com
offline nativamente). Se for isso mesmo, os 3 estados ('synced', 'pending', 'failed')
na regra de update são código morto.

### 3.7 Categorias não podem ser deletadas por membro comum

```js
allow delete: if canDeleteWorkspaceTree(workspaceId);
```

Criou uma categoria por engano? Não dá pra deletar. Só na exclusão total da conta.
Isso é intencional — categorias são referenciadas por transações — mas gera uma
experiência ruim: o usuário cria "Alimetação" com erro de digitação e fica preso
com ela. Dá pra mitigar com "ocultar" (`isActive: false`) que a UI já filtra, mas
a categoria invisível continua ocupando a lista de `categories`.

---

## 4. Resumo executivo

**O que está excepcional**: regras do Firestore, documentação, arquitetura offline-first,
suíte de testes, aprendizado institucional com bugs passados.

**O que precisa de atenção agora**:
1. Corrigir o `spread` frágil em `accountDeletionService.ts` — é o próximo candidato
   a repetir o padrão de bug que já aconteceu 3 vezes.
2. Resolver o Tailwind v3/v4 — ou migra de vez ou documenta o que não funciona.
3. Bills `overdue` automático — a regra já permite, é só client-side.

**O que vai doer no médio prazo**:
4. Limite de 300 transações — vai ser atingido por usuários reais em 3-4 meses.
5. Serviços de 700 linhas — é onde bugs de esquecimento nascem.
6. Sem exportação de dados — portabilidade é requisito legal (LGPD).

**Features de maior relação valor/esforço**: orçamento por categoria, exportação CSV,
bills overdue automático, meta com data-limite visível.

---

*Análise gerada em 2026-07-12 por leitura completa de ~3500 linhas de código core, 1603
linhas de regras Firestore, toda a documentação do projeto e o changelog completo desde
2026-06-15.*
