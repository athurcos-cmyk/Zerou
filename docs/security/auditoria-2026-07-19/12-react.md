# Auditoria de Arquitetura React — 2026-07-19

## Resumo executivo

O código React do Zerou está acima da média para um SaaS em produção. A arquitetura offline-first com `fireWrite` + `subscribeWithTransientRetry` é sólida. Os três achados mais relevantes são: (1) ausência total de error boundary, (2) risco de XSS na Assistente, (3) promoção não-criteriosa de re-renders. Abaixo, 14 achados ordenados por severidade.

---

## ID: REACT-01
**Título:** Ausência de Error Boundary em toda a aplicação
**Severidade:** Crítica
**Local:** `src/App.tsx` (e todas as páginas/componentes)
**Descrição:** Não existe nenhum error boundary (`ComponentDidCatch`/`getDerivedStateFromError`/React 19 error boundary) em nenhum nível da árvore React. Uma exceção não tratada durante a renderização de qualquer componente — mesmo de um página não usada — derruba a aplicação inteira (tela branca). Num PWA que funciona offline, onde listeners do Firestore podem disparar atualizações de estado a qualquer momento (inclusive com dados corrompidos do cache local), o risco é concreto.
**Impacto:** Qualquer erro de renderização (ex.: `TypeError: Cannot read properties of undefined` ao acessar `invoice.dueDate.toDate()` com dado malformado do cache) quebra a experiência inteira do usuário, sem fallback, sem "Tente recarregar", sem log enviado ao desenvolvedor.
**Solução sugerida:** Envolver `<Routes>` com um error boundary no `App.tsx`. Pelo menos um boundary por rota protegida (`<RequireAuth>`) já evitaria o crash geral. React 19 oferece `react-error-boundary` ou implementação manual com `componentDidCatch`.
**Confiança:** 10

---

## ID: REACT-02
**Título:** `dangerouslySetInnerHTML` na Assistente Grazi sem sanitização
**Severidade:** Alta
**Local:** `src/pages/AssistantPage.tsx:112` — `dangerouslySetInnerHTML={{ __html: renderAssistantMessage(msg.content) }}`
**Descrição:** O método `renderAssistantMessage` transforma markdown em HTML com regex ingênua (`replace` sequenciais para `**bold**` e `*italic*`) e injeta o resultado via `dangerouslySetInnerHTML`. Se a Cloud Function `financialAssistantChat` retornar HTML malicioso (ex.: `<img onerror=...>` ou `<script>`), ele será executado no contexto do domínio. Embora a Cloud Function seja controlada pelo mesmo projeto, um bug nela ou um ataque a partir de dados financeiros que ela consome poderia injetar conteúdo não-confiável.
**Impacto:** XSS persistente contra o próprio usuário. A superfície de ataque é pequena (apenas a CF que o projeto controla), mas a consequência é completa: roubo de sessão, acesso a dados financeiros.
**Solução sugerida:** Usar `DOMPurify.sanitize()` no resultado antes de passar para `dangerouslySetInnerHTML`, ou substituir a implementação por um parser de markdown seguro (ex.: `marked` com sanitização). Alternativa mais simples: trocar o `replace` de `**texto**` por renderização baseada em fragmentação manual (split por `**`, alternando `<strong>`), sem usar `innerHTML`.
**Confiança:** 8

---

## ID: REACT-03
**Título:** `AssetionPage` usa índice do array como `key` em lista de mensagens
**Severidade:** Média
**Local:** `src/pages/AssistantPage.tsx:106-118` — `key={`\`${msg.role}-${i}\``}`
**Descrição:** A lista de mensagens do chat usa `${msg.role}-${i}` como key. Se uma mensagem for editada, removida, ou reordenada (ex.: recebimento de stream de resposta), o React confundirá os elementos. No caso atual o array só recebe append, então o bug não aparece, mas é frágil.
**Impacto:** Potencial perda de estado de foco, cursor, e animações se o chat evoluir para suporte a edição/reescrita de mensagens.
**Solução sugerida:** Gerar um `id` único para cada mensagem — mesmo `Date.now()` + `Math.random()` serve para o caso de chat.
**Confiança:** 6

---

## ID: REACT-04
**Título:** `useEffect` sem cleanup em `AdminPage.loadAll()`
**Severidade:** Média
**Local:** `src/pages/AdminPage.tsx:1155-1157`
```ts
useEffect(() => {
  void loadAll();
}, []);
```
**Descrição:** O effect dispara `loadAll` (que faz 4 chamadas ao servidor via `Promise.all`) sem mecanismo de cancelamento. Se o componente desmontar antes de `loadAll` completar (ex.: navegação para outra página), os `setState` no `finally` vão gravar em componente desmontado — o React 19 não quebra mas loga warning. O estado dos 4 conjuntos de dados também pode ficar inconsistente se a promise resolver parcialmente.
**Impacto:** Warnings de desenvolvimento; em produção, risco de vazamento de memória e atualização de estado após desmontagem.
**Solução sugerida:** Usar variável `cancelled` (padrão que o resto do projeto já usa em `useFinanceData.ts`, `useInvoiceLedger.ts`, etc.) para abortar os `setState` se o componente desmontou.
**Confiança:** 9

---

## ID: REACT-05
**Título:** Condição de corrida em `TransactionsPage.handleLoadMore` com cliques rápidos
**Severidade:** Média
**Local:** `src/pages/TransactionsPage.tsx:66-88`
```ts
async function handleLoadMore() {
  if (loadingMore || reachedEnd || !workspaceId) return;
```
**Descrição:** A guarda `loadingMore` previne cliques duplicados. Porém `setLoadingMore(true)` só acontece dentro da função, e o `loadingMore` capturado pela closure é o valor do render anterior. Se o usuário clicar "Carregar mais" muito rápido (dois cliques no mesmo frame de render), ambas as execuções passam pela guarda e disparam duas consultas simultâneas, com race na mutação de `olderTransactions`. O risco é baixo (janela de ~16ms) mas já causou bugs reais em produção em outros apps.
**Impacto:** Dados duplicados em `olderTransactions` ou perda de uma página inteira se a segunda resposta sobrescrever a primeira no `dedupeById`.
**Solução sugerida:** Usar `useRef` para a flag de bloqueio (`loadingRef.current = true`) e checar o ref em vez do estado, ou usar `useReducer` com ação que inclui o próprio loading.
**Confiança:** 5

---

## ID: REACT-06
**Título:** Nenhum componente usa `React.memo` — re-renders em cascata
**Severidade:** Média
**Local:** Todos os componentes em `src/components/` e `src/pages/`
**Descrição:** Nenhum componente funcional é envolvido por `React.memo`. Itens de lista como `list-row` em `TransactionsPage`, `CardDetailPage`, `BillsPage`, e componentes reutilizáveis como `SelectField`, `EmptyState`, `SyncStatusBadge` são re-renderizados sempre que o pai renderiza, mesmo sem props novas. Em telas com listas longas (ex.: `TransactionsPage` com 300+ transações), o custo é significativo.
**Impacto:** Performance de renderização abaixo do ideal em dispositivos móveis de entrada, especialmente com Firestore disparando `onSnapshot` frequentes (a cada sync em background o estado global muda de referência e toda a árvore re-renderiza).
**Solução sugerida:** Adicionar `React.memo` em componentes de lista: `list-row`, `EmptyState`, `SelectField`, `CategoryField`, `FormMessage`, `SyncStatusBadge`. Itens de lista em `map` devem ser extraídos para componentes próprios memoizados.
**Confiança:** 9

---

## ID: REACT-07
**Título:** Funções callback recriadas a cada render em múltiplos componentes
**Severidade:** Média
**Local:** Disperso — `AppShell.tsx` (`handleLogout`, linha 56-73), `DashboardPage.tsx` (`handleChooseAvailableMode`, `handleCloseTutorial`, linhas 115-126), `BillsPage.tsx` (`handleOpenPay`, `handleConfirmPay`, `handleCancelBill`, etc., linhas 108-164), `ReceivablesPage.tsx`, `CardsPage.tsx`, `InvoicePage.tsx`, etc.
**Descrição:** Handlers de evento e callbacks assíncronos são definidos como arrow functions dentro do corpo do componente, sem `useCallback`. Quando passados como props para filhos (ex.: `onChange`, `onClick`), quebram a referência estável, anulando qualquer `React.memo` que venha a ser adicionado (ver REACT-06) e forçando re-render dos filhos a cada render do pai.
**Impacto:** Multiplicador do problema REACT-06: mesmo que `React.memo` seja adicionado, sem `useCallback` nos handlers a memoisação não funciona.
**Solução sugerida:** Envolver todos os handlers passados como props em `useCallback` com deps explícitas. Especialmente crítico: `handleOpenPay`, `handleConfirmPay`, `handleDelete`, `handleSubmit` em páginas de formulário.
**Confiança:** 8

---

## ID: REACT-08
**Título:** `useCallback` em `AuthContext.applyProfile` mas chamado em efeito sem ela na lista de deps
**Severidade:** Baixa
**Local:** `src/auth/AuthContext.tsx:88` — `applyProfile` usa `useCallback` com dep `[hydrateFromProfile]`, e é chamado em dois `useEffect` (linhas 166 e 210) que listam `applyProfile` nas deps. Correto, mas frágil.
**Descrição:** O `useEffect` de perfil (linha 168-210) depende de `resetLocalOverride` (que vem do Zustand, estável) e `applyProfile` (memoizado via `useCallback`). Porém `hydrateFromProfile` (dependência de `applyProfile`) vem do `useAppearanceStore` — se o Zustand recriar essa referência, o `useCallback` de `applyProfile` muda, o `useEffect` re-dispara, e o `onSnapshot` é re-assinado desnecessariamente.
**Impacto:** Re-subscrição do listener de perfil em toda troca de tema (quando `hydrateFromProfile` é substituída pelo Zustand), causando pequena duplicação de leituras.
**Solução sugerida:** Extrair `hydrateFromProfile` para uma referência estável (`useRef`) ou confirmar que o Zustand `create` retorna funções estáveis (o que é verdade — `create` mantém as mesmas referências entre renders). O código atual já funciona, mas é frágil para mudanças futuras.
**Confiança:** 4

---

## ID: REACT-09
**Título:** Lazy loading de rotas ausente — todo o app carregado na entrada
**Severidade:** Baixa
**Local:** `src/App.tsx` (linhas 11-43)
**Descrição:** Todas as 30+ páginas são importadas estaticamente no módulo de `App.tsx`. A página inicial (`/`) só carrega o componente `LandingCss` (leve), mas isso significa que o bundle final inclui `AdminPage`, `InvoicePage`, `GoalDetailPage`, etc. mesmo para usuários que nunca visitarão essas rotas. `Vite` já faz tree-shaking e code-splitting automático com `import()`, que não está sendo usado.
**Impacto:** Tamanho do bundle JS maior do que o necessário no primeiro acesso. Impacto mensurável em dispositivos móveis com rede lenta.
**Solução sugerida:** Substituir `import { DashboardPage } from './pages/DashboardPage'` por `const DashboardPage = lazy(() => import('./pages/DashboardPage'))` e envolver a árvore de rotas em `<Suspense>`. Prioridade: páginas pesadas como `AdminPage` (1427 linhas, múltiplos sub-componentes).
**Confiança:** 10

---

## ID: REACT-10
**Título:** `CategoryField.handleSubmit` usa `event.stopPropagation()` quebrando aninhamento de formulários
**Severidade:** Baixa
**Local:** `src/components/CategoryField.tsx:80` — `event.stopPropagation()`
**Descrição:** O `CategoryField` contém um `<form>` interno que faz `stopPropagation()` no evento submit para evitar que o formulário pai seja submetido acidentalmente. A intenção é correta (o sheet de categoria não deve submeter o formulário de transação), mas `stopPropagation` é uma muleta frágil — se algum dia o `CategoryField` for usado fora de um formulário, ou o formulário pai esperar ouvir um evento customizado, o comportamento quebra.
**Impacto:** Nenhum no cenário atual. Risco de refatoração futura.
**Solução sugerida:** Usar `type="button"` nos botões internos de acionamento e controlar o submit só pelo `<form>` interno, sem depender de `stopPropagation`. Ou garantir que o formulário interno use `form`属性 com `id` próprio.
**Confiança:** 7

---

## ID: REACT-11
**Título:** `AnnualSummarySheet` condicionalmente altera `workspaceId` do hook, reiniciando estado interno
**Severidade:** Baixa
**Local:** `src/components/AnnualSummarySheet.tsx:71`
```ts
const yearData = useMonthlyTransactions(open ? workspaceId : undefined, yearMonths);
```
**Descrição:** O segundo argumento de `useMonthlyTransactions` é `open ? workspaceId : undefined`. Quando `open` é `false`, o hook recebe `undefined` para `workspaceId` e reseta para estado vazio. Quando abre, `workspaceId` volta a ter valor e os listeners são re-criados. Isso significa que fechar e reabrir o sheet refaz todas as assinaturas — sempre. O mesmo padrão existe em `SearchPage.tsx` (passa `open ? workspaceId : undefined`).
**Impacto:** Leitura extra do Firestore (re-subscrição) a cada abertura do sheet. Aceitável para uso esporádico como o Resumo Anual.
**Solução sugerida:** Manter uma referência `hasEverOpened` com `useRef` que, uma vez true, nunca mais passa `undefined` para o hook, evitando re-subscrições em aberturas subsequentes.
**Confiança:** 5

---

## ID: REACT-12
**Título:** `CreateCard` em `CardsPage.tsx` usa `.then()` com fire-and-forget, misturando padrões
**Severidade:** Informativa
**Local:** `src/pages/CardsPage.tsx:45-55`
```ts
createCreditCard(workspaceId, user.uid, { ... })
  .then((id) => navigate(`/app/cards/${id}?novo=1`))
  .catch((error) => setMessage(...));
```
**Descrição:** O hook `createCreditCard` gera um ID client-side (não espera o servidor) e retorna o ID imediatamente, antes de chamar `fireWrite`. O `.then()` navega para o cartão recém-criado. Isso é intencional e correto (o ID já existe localmente), mas o `.catch` captura erros síncronos da validação Zod (antes do `fireWrite`), não erros de rede — estes são engolidos pelo `fireWrite`. Isso pode dar a ilusão de tratamento de erro que não funciona para falhas de servidor.
**Impacto:** Se a escrita do Firestore falhar (permission-denied, por exemplo), o `.catch` não dispara — o usuário navega para a página do cartão com um documento que nunca existiu no servidor. O `onSnapshot` vai mostrar um badge pendente, mas o erro real é invisível.
**Solução sugerida:** Validar que o usuário entenda que erros de servidor são silenciosos (o padrão do projeto), ou trocar o `.then` para `void createCreditCard(...)` + navegação síncrona com o ID já gerado antes da chamada, sem `.catch`.
**Confiança:** 7

---

## ID: REACT-13
**Título:** Inconsistência no tratamento de `error` entre as páginas — algumas usam getUserFacingErrorMessage, outras não
**Severidade:** Informativa
**Local:** Múltiplos arquivos
**Descrição:** A maioria das páginas (`BillsPage`, `ReceivablesPage`, `InvoicePage`, `AccountsPage`, `CardsPage`, `SearchPage`) chama `createAccount(...).catch(error => setMessage(getUserFacingErrorMessage(error, ...)))`. Mas algumas (`TransactionsPage.tsx` linha 190, `BillsPage.tsx` linha 224) usam `.catch(() => {})` que engole o erro completamente, sem mensagem nem log. Outras (`NewTransactionPage.tsx` linha 118) usam `.catch` só para certos caminhos.
**Impacto:** Erros silenciosos podem passar despercebidos durante o desenvolvimento e em produção — exatamente o padrão que causou os incidentes descritos na REGRA PRINCIPAL do projeto.
**Solução sugerida:** Auditoria cruzada: toda chamada de `fireWrite` ou função que o usa deve ter, no mínimo, um `catch` com `getUserFacingErrorMessage` se há feedback visível para o usuário. Remover `.catch(() => {})` e substituir por `getUserFacingErrorMessage` onde o usuário espera ver o erro (ex.: criação de conta/bill/recorrência).
**Confiança:** 8

---

## ID: REACT-14
**Título:** Nenhum uso de React 19 — `use()`, `useOptimistic`, `useActionState`, `useFormStatus`
**Severidade:** Informativa
**Local:** N/A
**Descrição:** O projeto está empacotado com React 19 mas todas as APIs são usadas no estilo React 18. Nenhum hook concorrente (`useTransition` não é usado, `useDeferredValue` não é usado, `useOptimistic` não é usado). O `use()` hook, que permitiria leitura direta de promises em render, não aparece. `useFormStatus` e `useActionState` (que reduzem boilerplate de formulário) também não são usados.
**Impacto:** Nenhum — o app funciona. Mas o React 19 oferece otimizações de performance (automatic batching melhorado, transições, hidratação seletiva) que não estão sendo exploradas.
**Solução sugerida:** Avaliar `useOptimistic` para mutações de estado compartilhado (ex.: marcar conta como recebida). Avaliar `use()` + `<Suspense>` para lazy loading de rotas (ver REACT-09). Avaliar `useFormStatus` no botão de submit de formulários para estado de loading automático.
**Confiança:** 10

---

## Notas adicionais

### Pontos fortes identificados

1. **`fireWrite` + `subscribeWithTransientRetry`**: A espinha dorsal offline-first é bem projetada. O `fireWrite` silencia erros em produção mas loga em dev, e o `subscribeWithTransientRetry` recupera de falhas transitórias com backoff sustentado — exatamente o que um PWA financeiro precisa.

2. **Cleanup sistemático**: Todos os hooks de dados (`useFinanceData`, `useCardsData`, `useInvoiceLedger`, `useMonthlyTransactions`, `useGoalContributions`, `useSharedWorkspaceData`) têm cleanup rigoroso: variável `cancelled`, timers limpos no return, listeners desassinados. Isso evita vazamento de memória e race conditions em re-subscrições.

3. **Gerenciamento de estados de carregamento**: O padrão `bootTimeout` de 2.5s para destravar loading offline está em todos os hooks de dados. O uso de cache de visualização no `DashboardPage` é particularmente elegante — mostra o último estado conhecido enquanto carrega, evitando o "piscar" de placeholders.

4. **Separação de responsabilidades**: Firestore como fonte da verdade, Zustand só para estado de UI (tema, tour, exclusão de conta). Nenhum dado financeiro sensível em Zustand. Isso é correto e evita divergência de estado.

5. **Context hierarchy**: `FinanceDataProvider` e `SharedDataProvider` aninhados corretamente no `App.tsx`, limitados à rota `/app/*`. Providers só montam quando o usuário está autenticado.

### Observações sobre padrões de estado vazios

Todas as páginas tratam o estado vazio (zero accounts, zero transactions, zero goals) com `EmptyState` e mensagem amigável. Isso está consistente em toda a base. As páginas que fazem loading sob demanda (`SearchPage`, `AnnualSummarySheet`) também tratam o estado "ainda carregando" via união com o cache local.
