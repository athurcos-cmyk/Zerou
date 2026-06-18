# Changelog

Resumo das mudanças recentes do Zerou. O histórico detalhado por mês fica em `docs/history/`.

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
