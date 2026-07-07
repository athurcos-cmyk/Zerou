# Changelog

Resumo das mudanças recentes. O histórico detalhado por mês fica em `docs/history/`.

## 2026-07-07 — fix: auditoria de uso do Firestore (leituras/escritas desnecessárias)

- **`coupleInvites`**: política de TTL nativa configurada no Firestore (campo `expiresAt`) — convites expirados são apagados sozinhos, sem Cloud Function. Configuração manual, feita direto no Console.
- **Faturas de cartão**: `subscribeInvoices` limitado às 24 mais recentes por cartão (~2 anos). Sem isso, cada fatura carregada abria seu próprio listener de ledger em `useCardsData` e o total de listeners simultâneos crescia sem parar conforme a conta envelhecia.
- **Feature morta removida**: sistema de comentários do espaço do casal (`SharedComment`, `addSharedComment`, `subscribeSharedComments`, coleção `comments`) — existia o listener e a escrita, mas nenhuma tela nunca chamou nem exibiu isso. Puro custo, zero uso. Removido de ponta a ponta: tipo, schema, serviço, hook, regra do Firestore.
- **Token FCM**: parava de gravar o mesmo token no Firestore toda vez que o app abria. Agora compara com um cache local (`src/pwa/pushTokenCache.ts`) antes de escrever.
- **Guia de quando escalonar**: documentado em `SESSAO.md` o critério prático pra decidir quando vale adicionar `.limit()` numa coleção (regra de bolso: ~500-1000 docs por workspace) e o que monitorar no painel do Firestore.

Detalhes e raciocínio completo em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-07 — feat: resgatar do cofrinho do casal

- Nova ação "Resgatar" no cofrinho compartilhado: retira do total do casal e, opcionalmente, credita como entrada numa conta pessoal — espelha "Guardar" em sentido inverso.
- `GoalContribution` ganhou campo `type: 'deposit' | 'withdrawal'`; estatísticas por pessoa/mês extraídas para a função pura `calculateCoupleGoalStats` (12 testes novos).
- Nova categoria padrão "Cofrinho" (`both_cofrinho`) para as transações de guardar/resgatar não caírem em "Sem categoria".
- Regras do Firestore atualizadas (`goalContributions` aceita `type`) e deployadas em produção.
- Revisão de design da `SharedSpacePage`: já seguia os padrões do app; toggle Guardar/Resgatar e botões em linha reaproveitam os mesmos componentes usados no resto do app (sem CSS novo).

Detalhes e decisões de design em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-07-07 — fix: auditoria pré-lançamento, testes de lógica financeira e recorrência com anchorDay

- Design/consistência: cores literais da `SearchPage` viraram tokens (`noHardcodedColors` volta a passar), `window.confirm` trocado por `useConfirm`, empty states ilustrados em Bills/Recurring/Accounts.
- Fire-and-forget consertado em Bills/Cards/Recurring (formulário não trava mais esperando o servidor) e bug de boot offline corrigido (saldo podia piscar R$ 0,00 antes do cache carregar por completo).
- Suíte de testes de domínio ampliada de 46 para 113 testes (saldo, faturas de cartão, casal, dinheiro, recorrência).
- 2 bugs corrigidos: `parseMoneyToCents` inflava 100x um valor com ponto decimal; `nextOccurrenceDate` pulava fevereiro inteiro numa recorrência no dia 31.
- Novo campo `anchorDay`: recorrência mensal/anual guarda o dia original e volta a ele quando o mês permite (client + Cloud Function + regras do Firestore, já deployadas em produção).

Detalhes técnicos completos em [`docs/history/2026-07.md`](docs/history/2026-07.md).

## 2026-06-22 — feat: redesign página de Análise (SearchPage)

- **KPI strip**: 3 cards no topo — gasto total do mês (destaque laranja), maior categoria com valor, variação % vs. mês anterior com ícone `TrendingUp`/`TrendingDown`/`Minus`.
- **Donut**: aumentado para 200px; centro exibe nome + valor + percentual da categoria selecionada; legenda substituída por barras de progresso coloridas por categoria.
- **Histórico mensal**: altura do gráfico de barras aumentada para 220px; legenda própria com quadradinhos no lugar do `<Legend>` padrão do Recharts; tooltip com uppercase label.
- **Busca**: card de resultados oculto quando campo está vazio.

## 2026-06-22 — feat: logos oficiais com transparência real + fix Firestore coupleMode

- **Logos oficiais**: todos os PNGs de brand substituídos por versões com alpha real (sem fundo branco). `granativa-logo-horizontal.png` (nav/og:image), `granativa-logo-primary.png`, `granativa-logo-stacked.png` e `granativa-logo-stacked-hq.png` adicionados.
- **Favicons**: `favicon-16x16.png` e `favicon-32x32.png` transparentes substituem o `favicon.png` legado (784KB). `index.html` atualizado.
- **Nav/footer landing**: `LandingShell` agora usa a logo horizontal como `<img>` única (sem texto duplicado em HTML). `BrandLogo.tsx`: paths corrigidos para lowercase.
- **fix Firestore**: `validCoupleWorkspaceCreate` não listava `coupleMode` no `hasOnly()` — qualquer usuário recebia `permission-denied` ao criar espaço compartilhado. Corrigido + validação `in ['savings_only', 'transparent', 'balanced']`. `validCoupleWorkspaceUpdate` também corrigido para permitir troca de modo. Regras deployadas.
- **`Seo.tsx`**: og:image corrigido para `granativa-logo-horizontal.png` (casing lowercase).

## 2026-06-22 — rebrand: Granix → Granativa + landing UX mobile

- **Nome final**: app renomeado de "Granix" para **Granativa** (portmanteau: grana + ativa). 35 arquivos atualizados, concordância de gênero corrigida (a/na/da Granativa).
- **Assets**: `public/brand/granativa-*.png` (10 arquivos, casing lowercase). Paths em `index.html` e `LandingShell.tsx` corrigidos.
- **Landing mobile — hover removido**: `whileHover` eliminado de `TiltCard` e couple-card; eventos de mouse no hero ligados só em `(hover: hover)` via `canHover` ref; estilos `:hover` movidos para `@media (hover: hover)`.
- **Stats band**: mantido em linha horizontal no mobile (sem `flex-direction: column`), padding e fonte compactados em `≤520px` — números não quebram mais linha.
- **Botões hero**: `flex-direction: column; width: 100%` em `≤640px` — CTAs empilhados e legíveis no celular.
- **Nav mobile**: botão ghost "Entrar" oculto em `≤480px` para dar espaço ao "Começar grátis".
- **`CountUp`**: simplificado para `motion.span` único com texto completo — elimina quebra de linha entre número e sufixo `%`.

## 2026-06-20 — feat: landing page redesenhada com Framer Motion 3D

- **Hero light**: fundo claro (branco → areia), texto estático, stage (phone + badges) inclina em 3D com o mouse via `rotateX/Y` + `preserve-3d` e `useSpring`.
- **Parallax em camadas**: stage sobe mais devagar no scroll (`useScroll`); badges em Z-depths diferentes (`z: 60 / 30 / -15`) criam profundidade real; phone tem gloss de luz (`useMotionTemplate`) que desloca com o cursor.
- **Grade perspectiva**: `linear-gradient` com `perspective(700px) rotateX(-62deg)` e mask cria piso de grade laranja recuando para o fundo.
- **Seções**: stats band, bento com `TiltCard` 3D hover (`rotateX/Y` no `whileHover`), seção do casal com card hover + `rotateZ`, steps com `whileInView`, FAQ accordion, CTA dark. Tudo com `RevealSection` (useInView + stagger).
- Detalhes técnicos em `docs/history/2026-06.md`.

## 2026-06-20 — rebrand: Zerou → Granativa

- **Novo nome**: app renomeado de "Zerou" para **Granativa**. Tagline mantida: "Controle individual. Organização a dois."
- **Novo logo**: ícone de duas bolas sobrepostas (sólida laranja + outline escuro), gerado com IA. Assets em `public/brand/Granativa-*.png` (`Granativa-app-icon-180/192/512`, `Granativa-maskable-512`, `Granativa-logo-horizontal`, `Granativa-symbol`).
- **PWA manifest**: `name`, `short_name`, `theme_color` (`#EE5524`), `background_color` (`#FAF8F5`) e todos os ícones atualizados em `vite.config.ts`.
- **`index.html`**: `<title>`, meta description, OG tags e `apple-touch-icon` atualizados. Favicon agora é PNG (`/favicon.png`).
- **Componentes e textos**: todas as ocorrências visíveis de "Zerou" → "Granativa" com artigo correto (o/do/na Granativa). Version strings internas do Firestore (`zerou-v12.2-*`, `zerou-cache`) mantidas para não invalidar registros existentes.

## 2026-06-18 — feat: gráficos interativos de análise de gastos (Recharts)

- **`SearchPage` → `Análise`**: donut interativo (clique destaca fatia/legenda, centro mostra categoria + valor) e gráfico de barras entradas vs saídas dos últimos 6 meses. Recharts instalado (`v3.8.1`). Nav renomeada de "Busca" para "Análise" com ícone `BarChart2`.

## 2026-06-18 — fix: ícone de categoria, delete de cartão, InvoicePage simplificada

- **CSS mobile**: `.list-row--with-icon` agora mantém `flex-direction: row` dentro do `@media (max-width: 900px)` — ícone de categoria deixou de quebrar para cima do texto.
- **`deleteCard`** (`cardService.ts`): soft-delete com `isActive: false`. Botão de lixeira adicionado no `CardDetailPage` com `ConfirmDialog` antes de confirmar.
- **`InvoicePage` simplificada**: "Fechar fatura" e "Conciliar manualmente" removidos da UI principal (automação cuida do fechamento). Pagamento via `BottomSheet`. Compras e pagamentos em seções separadas. Antecipação, créditos e tarifas em `<details>` colapsados.

## 2026-06-18 — feat: notificação diária às 20h para registrar gastos

- **`sendDailyLogReminder`** (`functions/src/automation.ts`): Cloud Function scheduled todo dia às 20h (BRT). Busca todos os tokens FCM cadastrados (`collectionGroup('fcmTokens')`), envia push em lotes de 500 com título "Como foi o dia?" e corpo "Registre seus gastos antes de dormir." linkando para `/app/transactions/new`.
- Exportada em `functions/src/index.ts` e deployada em `billing:sendDailyLogReminder(southamerica-east1)`.

## 2026-06-18 — perf: boot instantâneo em internet fraca, saldo não pisca mais

- **`AuthContext`**: estado agora inicializa **sincronamente** do `localStorage` — se o usuário já logou antes, `loading` começa como `false` e o app abre direto sem tela "Carregando Zerou...". Firebase confirma a sessão em background. Timeout de fallback: 1800ms → **500ms**. Bug corrigido: sem cache + Firebase não responde → agora libera `loading=false` em vez de travar.
- **Google Fonts não-bloqueantes** (`index.html`): `<link rel="stylesheet">` externo era render-blocking em redes lentas. Trocado por `rel="preload" onload` — browser baixa em paralelo sem travar o render.
- **Workbox runtime cache** (`vite.config.ts`): fontes do googleapis.com e gstatic.com agora são cacheadas com `CacheFirst` 1 ano — ficam disponíveis offline após primeira visita.
- **Dashboard** (`DashboardPage`): saldo total, disponível e comprometido mostram `—` enquanto `finance.loading` é true, eliminando o flash `R$ 0,00` antes dos dados do Firestore chegarem.

## 2026-06-18 — fix: fatura aberta permanece aberta com pagamento antecipado

- **`resolveInvoiceStatus`**: fatura com lifecycle `'open'` agora sempre retorna `'open'` (exceto `'overpaid'`). Antes, um pagamento total numa fatura ainda aberta a marcava prematuramente como `'paid'` — comportamento errado, pois novas compras ainda podem entrar antes do fechamento.
- Consequência cascata correta: `advance` no pagamento é sempre `true` enquanto a fatura está aberta (qualquer pagamento antes do fechamento é um adiantamento); `Comprometido` já excluía por `outstandingBalanceCents > 0`, então continua correto.
- Teste atualizado para usar `lifecycle: 'closed'` nos cenários de `'partial'`/`'paid'`; novo teste cobre fatura aberta com pagamento antecipado permanecendo `'open'`.

## 2026-06-18 — antecipação de parcelas estilo Nubank

- **Novo tipo de ledger** `installment_anticipation_credit`: credita o invoice futuro quando uma parcela é antecipada, reduzindo seu `outstandingBalanceCents` client-side via `calculateInvoice`.
- **`anticipateInstallments`** reescrito em `cardService.ts`: usa `writeBatch` — adiciona `installment_anticipation_credit` em cada invoice futuro selecionado e `installment_anticipation` (débito total) no invoice atual. Fire-and-forget.
- **Schema atualizado** (`anticipateInstallmentsSchema`): aceita `currentInvoiceId` + array de `credits` `{invoiceId, amountCents, sourceTransactionId}` em vez de valor manual único.
- **`InvoicePage`**: painel de antecipação substituído por seleção inteligente — lista parcelas futuras do mesmo cartão agrupadas por invoice, com checkbox por item, total ao vivo e "Confirmar antecipação". Parcelas já antecipadas são ocultadas automaticamente.
- Comprometido no Dashboard atualiza em cascata: invoices futuros com crédito de antecipação têm `outstandingBalanceCents` reduzido, saindo do cálculo se zerados.

## 2026-06-18 — UI premium: cabeçalhos, ícones de categoria, cards de conta, nav inferior

- **Cabeçalhos**: todas as páginas do app passaram a ter eyebrow + título compacto sem parágrafo de descrição (menos espaço desperdiçado, conteúdo aparece logo de cara).
- **Ícones de categoria**: `CategoryMark` (tile colorido 36×36 com ícone lucide) adicionado em todos os itens de lista de transações — em `TransactionsPage` e `DashboardPage` (recentes). Fallback por tipo: verde para renda, slate para transferências.
- **Contas como cards**: `AccountsPage` reescrita — contas exibidas como cards com gradiente escuro (`--gradient-slate`), saldo em destaque, bank-mark no canto. Form de cadastro agora colapsável (igual ao CardsPage).
- **Nav inferior**: slot 2 trocado de Cartões → Extrato (Transações); slot 4 mantém Cartões. Casal movido para o menu "Mais". Indicador de ponto laranja acima do ícone ativo.
- **Formulários colapsáveis**: `BillsPage` e `AccountsPage` ganharam mesmo padrão do `CardsPage` — form colapsado por padrão, toggle com chevron animado.
- **`CategoryMark`** exportado de `src/components/categoryIcons.tsx` — reutilizável em qualquer lista.

## 2026-06-18 — cartão: offline-first na fatura, fatura aberta em destaque, chip-row de conta

- **`InvoicePage`**: removido `guardAction` — pagamento, crédito, tarifa e antecipação são agora fire-and-forget com reset imediato do form. Botão de pagamento desabilitado até valor e conta estarem preenchidos.
- **`InvoicePage`**: campo "Pagar com qual conta?" trocado de dropdown (`SelectField`) para chip-row (consistência com BillsPage, RecurringPage, GoalsPage).
- **`CardDetailPage`**: fatura aberta aparece em destaque entre o bloco de limite e o formulário de compra, com link direto para pagar e valor em vermelho.
- **`CardsPage`**: cada cartão na lista agora exibe fatura aberta (mês de referência, vencimento, valor em vermelho) quando houver saldo pendente.

## 2026-06-17 — lógica financeira: pagamentos debitam contas, metas não viram gasto

- **`payBill`**: batch atômico marca conta como paga e cria transação de despesa (tag `bill`) debitando a conta selecionada. BillsPage abre sheet de confirmação com valor editável e chip de conta.
- **`recordRecurringPayment`**: batch avança `nextOccurrenceAt` para o próximo período e cria transação de despesa (tag `recorrente`). RecurringPage ganha botão "Registrar" que abre sheet com valor, conta e aviso da próxima data.
- **`contributeToGoalWithTransaction`**: batch incrementa `savedCents` da meta e, quando conta escolhida, cria despesa (tag `meta`). GoalsPage tem chip "De qual conta sai? / Só registrar" no sheet de contribuição.
- **`nextOccurrenceDate`**: função pura que avança uma data por `weekly` / `monthly` / `yearly`.
- **DashboardPage**: `spendingByCategory` exclui transações com tags `meta` e `cofrinho` — contribuições de meta/cofrinho não aparecem mais como gasto no resumo mensal.

## 2026-06-17 — redesign do modo casal e offline-first

- **Sistema de modos** (`coupleMode` no workspace): `savings_only` (só cofrinho), `transparent` (despesas visíveis) e `balanced` (barra proporcional de quem cobre mais). Pode ser escolhido na criação e mudado em qualquer momento via "Gerenciar espaço".
- **Nomes reais**: `WorkspaceMembership.displayName` salvo na criação do workspace e no aceite do convite; "Dono/Parceiro(a)" substituído pelo nome real da pessoa.
- **Validação de saldo no cofrinho**: "Guardar" valida o saldo da conta pessoal selecionada e bloqueia com mensagem amigável se insuficiente.
- **Removido breakdown individual** do cofrinho ("Você juntou / Parceiro juntou"); agora só aparece o total unificado.
- **Removido fluxo de acerto de contas** (settlements); substituído pelos modos transparent/balanced que mostram proporção sem acerto formal.
- **Offline-first**: todos os writes em `SharedSpacePage` refatorados para fire-and-forget (`.catch`); `guardAction` removido. Confirm dialogs aguardam normalmente; o write subsequente é fire-and-forget.
- **CLAUDE.md**: seção `⚠️ REGRA PRINCIPAL` com padrão correto/errado e exemplos de código explicitando que o app deve funcionar offline.

## 2026-06-17 — painel admin em /admin com deleção de usuário via Cloud Function

- **Rota `/admin`** protegida por `RequireAdmin` (email `a.thurcos@gmail.com`); qualquer outro usuário é redirecionado para `/app`.
- **AdminPage** com 4 abas: Visão Geral (4 cards de métrica + tabelas recentes), Usuários (busca por nome/email, tabela completa), Espaços de Casal (dono + parceiro resolvidos por nome), Convites (status, expiração, quem usou).
- **Deleção de conta**: botão de lixeira em cada linha de usuário, modal de confirmação exige digitar o primeiro nome, toast de sucesso mostra quantos documentos foram removidos.
- **Cloud Function `adminDeleteUser`** (`functions-admin/` codebase separado, sem dependência do Stripe): usa Admin SDK para deletar workspace pessoal, espaços de casal criados, membership em espaços alheios, billing, privacy requests e a conta Firebase Auth. Deployed em `southamerica-east1`.
- **Firestore rules**: `isAdmin()` adicionada; admin tem `read` em `users`, `workspaces` e `coupleInvites`.
- **`firebase.json`**: dois codebases separados — `billing` (existente, com Stripe) e `admin` (novo, sem secrets) — permitindo deploy independente.
- CSS 100% com variáveis de token; nenhuma cor hardcoded. Detalhe técnico em `docs/history/2026-06.md`.

## 2026-06-17 — cancelar espaço do casal sem parceiro

- **`cancelCoupleWorkspace`** (nova): quando o dono está sozinho e quer sair, deleta em batch o member record, o workspaceRef e o workspace em vez de fazer `update(status: removed)`. O path de update só estava disponível para `role == 'partner'` nas rules, o que gerava "missing or insufficient permissions".
- **SharedSpacePage**: `handleLeaveOrRemove` agora distingue três casos — dono+parceiro (`removePartner`), dono sozinho (`cancelCoupleWorkspace`), parceiro saindo (`leaveCoupleWorkspace`). Botão "Cancelar e sair do espaço" visível sem precisar expandir `<details>`.

## 2026-06-17 — invites de casal deletados após uso em vez de acumular

- **Firestore rule** (`coupleInvites` delete): adicionada condição `status == 'accepted' && usedBy == request.auth.uid` para que quem aceitou o convite possa deletá-lo depois que o membro foi criado.
- **`acceptCoupleInvite`**: após `batch.commit()` confirmar (membro criado, regras satisfeitas), dispara `deleteDoc` fire-and-forget no invite.
- **`createCoupleInvite`**: removida guarda `!== 'accepted'` — agora deleta todos os invites antigos do workspace, incluindo aceitos.
- **`cleanupExpiredInvites`**: removida guarda `accepted`; dono pode limpar tudo (ativos expirados + revogados + aceitos).
- Rules publicadas via `firebase deploy --only firestore:rules`.
- Detalhe técnico em `docs/history/2026-06.md`.

## 2026-06-17 — três bugs de navegação e fluxo de convite

- **Bug: usuário logado via na landing** — rota `/` agora usa `RootRoute` que redireciona autenticados para `/app`; antes renderizava `<LandingCss />` incondicionalmente, quebrando o PWA instalado.
- **Bug: aceite de convite perdido após login/cadastro** — `JoinInvitePage` passa `state.returnTo = /join/:code` ao navegar para `/login` ou `/register`; `LoginPage` já usava `location.state.returnTo` para redirecionar de volta. `OnboardingPage` redireciona para `/join/:code` ao terminar onboarding se há invite pendente no localStorage, em vez de ir sempre para `/app`.
- **Bug: botão "Sair" escondido** — "Cancelar e sair do espaço" movido de `<details>` para botão visível na tela de aguardar parceiro.

## 2026-06-17 — redesign do fluxo de aceite de convite de casal

- **`JoinInvitePage`** (`/join/:code`): agora faz preview automático do convite quando o usuário já está logado e com onboarding completo, mostrando o nome do workspace, data de expiração e botão "Entrar" direto na página — sem precisar ir ao `/app/shared`.
- **`SharedSpacePage`** estado sem espaço: se há código pendente no localStorage, mostra o card de aceite como ação primária (não mais escondido em `<details>`); auto-dispara o preview no mount.
- Fluxo anterior ficava preso na etapa do convite pois a UI de aceite estava oculta em `<details>Tenho um convite</details>` e não havia preview automático.

## 2026-06-17 — limpeza de coupleInvites acumulados

- **`createCoupleInvite`**: deleta todos os invites anteriores do workspace (exceto `accepted`) ao criar um novo, em vez de atualizar status para `revoked`. Elimina o backlog de 38 docs acumulados.
- **`revokeCoupleInvite`**: deleta o documento em vez de marcar `status: revoked`.
- **`cleanupExpiredInvites`**: deleta todos os não-`accepted` (revogados + expirados + ativos vencidos) em vez de atualizar status. Invites `accepted` são mantidos pois a Firestore rule de membership faz `getAfter` neles.

## 2026-06-17 — providers de dados compartilhados e higiene de re-renders

- **`FinanceDataProvider` + `SharedDataProvider`** montados no nível do `<RequireOnboardingComplete>` em `App.tsx`: listeners de Firestore agora ficam vivos entre navegações em vez de serem destruídos e recriados em cada troca de página. Todas as 13 páginas autenticadas consomem contexto via `useFinanceContext()`, `useCardsContext()`, `useGoalsContext()`, `useSharedContext()` e `useCoupleSavingsContext()`.
- **`hydrateFromProfile` com guard de igualdade**: o Zustand só notifica subscribers (e grava no localStorage) quando algum dos 5 campos de aparência realmente muda, eliminando re-renders e escritas desnecessárias a cada snapshot do perfil.
- **`limit(300)` em `subscribeTransactions`**: limita o listener a 300 transações mais recentes, evitando crescimento ilimitado de memória e CPU com o tempo.

## 2026-06-17 — estabilidade de listeners em useCardsData

- **Sem cascata de re-subscription em cartões**: dependências dos effects de faturas e ledger trocadas de `state.cards`/`state.invoices` (array inteiro) para `cardIds`/`invoiceIds` (string de IDs). Listeners só são recriados quando o conjunto de cartões ou faturas muda, não a cada atualização de campo (como `localSyncStatus` pending → synced).
- Removido `CODEX.md` da raiz (instruções consolidadas em `CLAUDE.md`).

## 2026-06-17 — higiene de custo Firestore no Blaze

- **Menos writes invisíveis**: a sincronização de aparência só grava em `/users/{uid}` quando tema, densidade, fonte ou movimento realmente mudarem.
- **Menos operações repetidas**: categorias padrão passam a ser preparadas uma vez por workspace na sessão do app, evitando rechecagens a cada mount de página financeira.
- Testes adicionados para garantir que aparência igual não dispara sync e que categorias padrão não são preparadas repetidamente no mesmo workspace.
- Validação: `npm run lint`, `npm run typecheck`, `npm test -- --run` (45/45), `npm run build`.

## 2026-06-17 — QA preventivo de permissões e listeners Firestore

- **Listeners protegidos com retry**: metas, cartões/faturas/ledger, espaço compartilhado e cofrinho do casal agora tentam novamente em `permission-denied`, `unavailable` e `deadline-exceeded` transitórios antes de mostrar erro.
- **Categorias com cor sem acesso negado**: `firestore.rules` agora permite `color` em criação/edição de categorias, alinhando as regras com os formulários do app.
- **Metas/cofrinho com schema nas rules**: create/update de `goals` e create de `goalContributions` ganharam validação de campos, usuário, valores e `monthKey`.
- Testes de rules adicionados para categoria colorida, meta válida, tentativa de forjar `createdBy` e contribuição zerada.
- Validação: `npm run lint`, `npm run typecheck`, `npm test -- --run` (42/42), `npm run build`; `firestore.rules` compilado e publicado em `zerou-26757`. `npm run test:rules` segue bloqueado pelo Java local.

## 2026-06-17 — retry financeiro pós-onboarding e bottom sheet sem arrasto lateral

- **Conta recém-criada mais estável**: leituras financeiras protegidas agora tentam novamente quando o workspace acabou de nascer e o Firestore ainda não confirmou o membership no servidor.
- **Sem erro prematuro no dashboard**: a mensagem “Não foi possível carregar os dados financeiros deste workspace” deixa de aparecer durante a janela curta de confirmação da fundação inicial.
- **Metas no iPhone sem arrasto lateral**: bottom sheets, grids de cor/ícone, campos e controles segmentados receberam contenção de largura para evitar scroll horizontal no Safari/mobile.
- Teste novo cobre retry de `permission-denied` transitório em `useFinanceData`.
- Validação: `npm run lint`, `npm run typecheck`, `npm test -- --run` (42/42), `npm run build`; checagem Playwright em viewport 393x852 confirmou `scrollWidth == clientWidth` no sheet.

## 2026-06-17 — exclusão definitiva de conta nas configurações

- Adicionado botão **Excluir minha conta** em `Segurança > Métodos de login`, com confirmação digitada (`EXCLUIR`) e reautenticação por senha ou Google.
- Criado `accountDeletionService`: remove perfil, refs do usuário, workspace pessoal completo, cartões/faturas/ledger, coleções financeiras, billing shell e espaços de casal criados pelo usuário; se for parceiro, sai do espaço antes de apagar a referência local.
- `firestore.rules` agora permite deletes estritos para dados da própria conta, workspace pessoal e workspaces de casal em que o usuário é dono; regras publicadas em `zerou-26757`.
- Textos legais/docs atualizados para refletir que a exclusão automatizada já existe dentro do app autenticado.
- Validação: `npm run typecheck`, `npm test` (41/41), `npm run build`. `npm run test:rules` segue bloqueado por Java local (`java -version` código 3221226505).

## 2026-06-17 — onboarding mais curto e fundação sem erro genérico

- **Questionário inicial compacto**: removido o logo persistente do app autenticado/onboarding e reduzido o espaço vertical do wizard; CTA fica visível sem arrastar na etapa inicial.
- **Causa do erro genérico encontrada**: `firestore.rules` bloqueava `onboardingGoal` e `onboardingChallenge`, embora o onboarding gravasse esses campos no perfil.
- **Regras publicadas**: `firestore.rules` agora permite os campos opcionais do questionário e foi publicado em `zerou-26757` com `firebase deploy --only firestore:rules`.
- **Fundação mais tolerante a rede fraca**: criação inicial não faz mais leitura bloqueante antes da escrita e usa timeout curto para não prender a tela em conexão ruim.
- **Mensagens menos genéricas**: removido fallback “Nao foi possivel concluir esta acao agora” dos caminhos de Auth/SharedSpace; onboarding usa fallback específico.
- Validação: `npm run typecheck`, `npm test` (41/41), `npm run build`. `npm run test:rules` segue bloqueado por Java local (`java -version` código 3221226505).

## 2026-06-17 — boot resiliente em internet fraca e logos offline

- **Boot/Auth resiliente em rede fraca**: `AuthContext` salva o perfil localmente e usa esse cache como fallback depois de 1,8s se Firebase Auth/perfil ficarem presos em conexão “meio online”.
- **Perfil não some em erro de snapshot**: falha temporária do Firestore mantém o último perfil local em vez de deixar o usuário preso no carregamento.
- **Ações sensíveis protegidas**: quando a sessão está usando fallback local (`authFromCache`), telas de verificação/métodos de login ficam bloqueadas até Firebase confirmar a sessão real.
- **SVGs de bancos offline**: Workbox passou a precachear `svg`; logos em `public/bank-logos/` entram no service worker.
- Teste novo para cache de perfil. Validação: `npm run typecheck`, `npm test` (41/41), `npm run build`.

## 2026-06-17 — correção crítica: app travando/escrita pendente, offline e zoom

- **Firestore travando** (escrita ficava "pendente" e só sincronizava após refresh): `experimentalAutoDetectLongPolling` ligado e `persistentMultipleTabManager` no cache — o transporte WebChannel travava em algumas redes/navegadores.
- **Escritas otimistas em todo o app** (`fireWrite` em finance/cards/shared): nenhuma mutação bloqueia mais a UI esperando o servidor (fim do spinner infinito). Dispara a escrita, responde na hora e o `onSnapshot` mostra o item (offline-first de verdade). Validação síncrona (Zod) continua surgindo pro usuário.
- **Metas/cofrinho offline**: removido `orderBy('createdAt')` das queries de goals/goalContributions (offline o serverTimestamp fica nulo e escondia o item recém-criado); ordenação no cliente.
- **Zoom / arrastar lateral**: travado o overflow-x (html/body/app-main) e corrigida a margem negativa do header de valor que estourava a largura no mobile; `viewport-fit=cover`.
- Detalhe em `docs/history/2026-06.md`. Validação: `npm run typecheck`, `npm test` (37/37), `npm run build`.

## 2026-06-17 — Redesign Sol, app mobile-nativo, cofrinho do casal e landing nova

- Direção visual "Sol" (areia + tangerina, DM Sans 800 nos números) aplicada no app inteiro.
- App mobile-nativo: nav inferior com FAB, header de valor nas telas de lançamento, seletores em bottom-sheet, categorias com ícone+cor, onboarding em questionário, empty states ilustrados.
- Despesa no cartão pelo fluxo de Despesa; novo cartão com header de limite; dashboard compacto.
- Espaço do casal: divisão flexível (igual/%/valor) + **cofrinho do casal** (meta compartilhada + contribuições por pessoa, opção de descontar de conta pessoal).
- Tela de **Metas** ligada ao questionário do onboarding.
- Landing reescrita (CSS 3D) com mockup do app e copy de dor (PAS); promovida para `/`.
- SVGs oficiais de ~24 bancos; cores tokenizadas (teste `noHardcodedColors` verde).
- Documentação reorganizada estilo plantão (`CLAUDE.md`, `CODEX.md`, `SESSAO.md`, `docs/`).
- Detalhe técnico completo em `docs/history/2026-06.md`. Validação: `npm run typecheck`, `npm test`, `npm run build`; regras Firestore publicadas.

## 2026-06-15 - Estado atual da main

### Projeto

- Zerou e um SaaS/PWA financeiro mobile-first para controle financeiro individual e organizacao a dois.
- Nome publico do produto: Zerou.
- Tagline oficial: "Controle individual. Organizacao a dois."
- Stack principal: React, TypeScript strict, Vite, Firebase Web SDK, Cloud Firestore, Firebase Auth, Vercel e PWA.
- O app esta em modo de lancamento gratuito. Nao ha cobranca ativa, checkout ativo ou pagina publica de planos.

### Fase 1 - Fundacao SaaS

- Criado o app React/TypeScript/Vite na raiz do repositorio.
- Configurado Firebase client-side por variaveis `VITE_`, sem `firebaseConfig` hardcoded.
- Preparado Firebase Auth com email/senha, Google, reset de senha e logout.
- Criadas rotas publicas e autenticadas com React Router.
- Implementado onboarding inicial com criacao de perfil, workspace pessoal e membership.
- Criado app shell autenticado com sidebar desktop e bottom navigation mobile.
- Implementado dashboard inicial pos-login.
- Implementado design system inicial com tokens semanticos.
- Implementados os seis temas: Paper, Sakura, Obsidian, Midnight, Aurora e Rose Gold.
- Implementado modo `system`, persistencia em `localStorage` antes do primeiro render e sincronizacao do tema em `/users/{uid}`.
- Copiados assets oficiais da Zerou para `public/brand/`.
- Implementado PWA basico com manifest, service worker e icones oficiais.
- Criado `.env.example`, `.gitignore`, `firebase.json`, `firestore.rules`, `storage.rules` e `vercel.json`.
- Ajustado fallback SPA da Vercel para rotas como `/login`, `/register` e `/app/*`.

### Ajuste Spark/Firebase

- Removida a dependencia de Cloud Functions no fluxo ativo da fundacao para manter o app no plano Spark/free.
- Criacao de usuario, workspace pessoal e membership passou a ser feita client-side com regras Firestore restritivas.
- Publicadas Firestore Rules no projeto real `zerou-26757`.
- Corrigido erro inicial de onboarding causado por leitura protegida antes da fundacao existir.

### PWA e atualizacao automatica

- Implementado auto-refresh de versao inspirado no app Plantao.
- Service worker usa `skipWaiting`, `clientsClaim` e limpeza de caches antigos.
- Vercel recebeu headers sem cache para `sw.js` e `workbox-*.js`.
- O app verifica atualizacoes ao abrir, focar, voltar online, voltar de aba oculta e periodicamente.

### Fase 2 - Motor financeiro essencial

- Implementados tipos e contratos de `Account`, `Category`, `Transaction`, `Bill` e `RecurringRule`.
- Criados servicos Firestore client-side para contas, categorias, transacoes, contas a pagar e recorrencias.
- Persistencia de dinheiro em centavos inteiros.
- IDs client-side e `clientMutationId` para idempotencia de transacoes.
- Criado calculo puro de saldo com receita, despesa, transferencia, ajuste e soft delete.
- Dashboard financeiro com saldo total, disponivel livre v1, valor comprometido, proximos compromissos, transacoes recentes e acoes rapidas.
- Rotas adicionadas:
  - `/app/dashboard`
  - `/app/accounts`
  - `/app/transactions`
  - `/app/transactions/new`
  - `/app/transactions/:transactionId/edit`
  - `/app/bills`
  - `/app/recurring`
  - `/app/search`
- Cadastro rapido mobile de transacao com campos principais e avancado recolhido.
- Sync status visual baseado em `hasPendingWrites` do Firestore.

### Fase 3 - Cartoes e faturas

- Implementados tipos de `CreditCard`, `Invoice` e `InvoiceLedgerEntry`.
- Criado dominio puro de faturas em `src/domain/invoices/*`.
- Compra no cartao reconhece despesa sem reduzir saldo da conta imediatamente.
- Pagamento de fatura reduz saldo da conta uma unica vez.
- Suporte a fatura aberta/fechada, pagamento parcial, pagamento total, creditos, encargos, antecipacao e reconciliacao.
- Rotas adicionadas:
  - `/app/cards`
  - `/app/cards/:cardId`
  - `/app/cards/:cardId/invoices/:invoiceId`
- Ledger de fatura tratado como imutavel pelas regras.

### Fase 4 - Espaco compartilhado

- Implementado workspace do casal.
- Implementados convites com codigo amigavel `DUO-XXXX-XX`, hash SHA-256, validade, uso unico, revogacao e regeneracao.
- Geracao de QR code e link de convite no client sem persistir token bruto.
- Rota publica `/join/:code` preserva convite ate login/cadastro.
- Rota autenticada `/app/shared` com criacao de espaco do casal, convites, aceite, claims compartilhados, comentarios e settlements.
- Claims compartilhados nao expõem referencias pessoais de conta, cartao ou fatura.
- Criado calculo de balanco por membro e sugestao de acerto.
- Area compartilhada foi posteriormente simplificada para reduzir confusao no celular.

### Fase 5 - Billing Stripe custom

- Criado scaffold de `functions/` com Node 22, TypeScript strict, Firebase Functions v2, Firebase Admin, Stripe e Zod.
- Implementadas callable functions futuras:
  - `createCheckoutSession`
  - `createCustomerPortalSession`
- Implementado webhook Stripe com validacao de assinatura e `rawBody`.
- Criado processamento idempotente de `billingEvents`.
- Criado processor/retry de eventos.
- Criado script `functions/scripts/seedPlanCatalog.mjs`.
- Criados tipos e regras para `billingAccounts`, `subscriptions`, `billingEvents` e `planCatalog`.
- Decisao de produto posterior: billing fica suspenso. Zerou fica 100% gratuito por enquanto.
- Paginas e links publicos de planos foram removidos do fluxo ativo.

### Fase 6 - Lancamento

- Criada landing publica clara, mobile-first e mais direta.
- Tema Paper claro virou padrao visual publico e primeiro render.
- Landing recebeu mockup mobile com efeito/aspecto 3D leve.
- Funcionalidades passaram a aparecer no corpo da landing.
- Removidos links publicos soltos de planos, cookies e subprocessadores.
- Removido banner de cookies para nao bloquear cadastro/uso.
- Analytics fica desligado por padrao e so inicializa se `VITE_ENABLE_ANALYTICS=true`.
- Rotas publicas reais:
  - `/features`
  - `/security`
  - `/help`
  - `/contact`
  - `/privacy-center`
  - `/legal/terms`
  - `/legal/privacy`
- Rotas legadas redirecionam:
  - `/pricing`
  - `/legal/cookies`
  - `/legal/subprocessors`
- Criados textos juridicos operacionais em `docs/legal/TERMS.md` e `docs/legal/PRIVACY.md`.
- Privacidade e termos foram reforcados para o contexto brasileiro, LGPD, Marco Civil e CDC.
- Privacy Center virou pagina informativa, sem botoes publicos de protocolo.
- Copy publica removeu termos tecnicos como "billing", "checkout", "offline-first", "ledger" e "workspace".
- Mensagens de erro de validacao foram convertidas para texto humano, sem expor JSON, `too_small`, `invalid_format` ou payload tecnico.
- Onboarding autenticado virou modo foco, sem sidebar/bottom nav ate concluir fundacao.
- App shell passou a bloquear atalhos visuais para funcoes privadas antes da fundacao do usuario.

### Pos-Fase 6 - UX financeiro e contas

- Melhorada UX mobile do dashboard, navegacao inferior e fluxo inicial.
- Adicionadas sugestoes de instituicoes financeiras ao criar conta financeira.
- Busca de instituicao aceita nome, alias e acentos.
- Conta financeira sem vinculos agora e excluida fisicamente do Firestore.
- Se a conta financeira tiver lancamentos, contas a pagar ou recorrencias ligadas, a UI bloqueia a exclusao e orienta remover/alterar os vinculos.
- Saldo inicial sozinho nao impede a exclusao de uma conta financeira.
- Foram adicionadas marcas compactas locais por banco.
- Foi adicionada primeira leva de SVGs locais de bancos em `public/bank-logos/`:
  - Nubank
  - PicPay
  - Mercado Pago
  - Neon
  - Modal
  - Wise
  - Nomad
- Criado `scripts/generate-bank-logos.mjs` e script `npm run generate:bank-logos`.
- Bancos sem SVG disponivel continuam com marcador visual ate entrada de assets oficiais confiaveis.

### Documentacao e operacao

- Criados ou atualizados docs operacionais:
  - `README.md`
  - `ARCHITECTURE.md`
  - `SECURITY.md`
  - `PRIVACY.md`
  - `RUNBOOK.md`
  - `docs/PRODUCTION_CHECKLIST.md`
  - `docs/BILLING.md`
  - `docs/BOOTSTRAP_FIREBASE_STRIPE.md`
  - `docs/MANUAL_SETUP_REQUIRED.md`
  - `documentacao-v12.2/IMPLEMENTATION_STATUS.md`
  - `documentacao-v12.2/QA_SCENARIOS.md`
- Criado este `CHANGELOG.md`.
- Criado `HANDOFF-PARA-CLAUDE.md` para passar contexto para outro agente.

### Validacoes executadas

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm run functions:build`
- `npm run test:functions`
- `npm audit --omit=dev`
- Deploy de Firestore Rules/Indexes no projeto `zerou-26757`
- Smoke tests em `https://zerou-five.vercel.app`

### Limitacoes conhecidas

- `npm run test:rules` depende de Java local. Neste computador, `java -version` falha com codigo `3221226505`, entao os emuladores ficam bloqueados ate corrigir Java/PATH.
- Bundle inicial ainda passa de 500 kB. Code splitting deve ser feito depois.
- Billing Stripe existe como scaffold futuro, mas nao esta ativo no produto.
- Cloud Functions nao devem ser ativadas sem decisao de produto, Blaze, secrets e checklist operacional.
- Revisao juridica profissional ainda e recomendada antes de escala publica maior.
- App Check, backups, alertas de custo, dominio final e emails oficiais ainda precisam de configuracao externa.
