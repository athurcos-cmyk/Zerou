# Zerou - Implementation Status

> Atualizar obrigatoriamente ao fim de cada fase. Este arquivo e o handoff entre execucoes.

## Resumo

```text
Fase atual: 5 implementada com scaffold Stripe custom; deploy cloud de Functions bloqueado por Blaze/secrets
Ultima fase concluida: 5. Billing Stripe custom
Ambiente validado: local sem emuladores por bloqueio Java; Firestore Rules compiladas e publicadas; build/e2e/unitarios/functions passaram
Ultima atualizacao: 2026-06-15
Gate da Fase 5: scaffold, testes locais, webhook signature, idempotencia documental, entitlements e Rules passaram; Checkout Test Mode real fica bloqueado ate Blaze, secrets Stripe, Price IDs e webhook externo serem configurados.
```

## Estado por fase

| Fase | Status | Gate | Observacoes |
|---|---|---|---|
| 1. Fundacao SaaS | implemented / Spark mode | local passou; Firestore rules publicadas | Fundacao React/Firebase/PWA entregue. Cloud Functions removidas do caminho ativo para manter plano Spark/free. |
| 2. Motor financeiro essencial | implemented / Spark mode | build passou; rules publicadas; offline automatizado bloqueado por Java | Contas, transacoes, dashboard v1, bills, recorrencias, busca e sync status implementados sem Cloud Functions. |
| 3. Cartoes e faturas | implemented / Spark mode | dominio, build, e2e e rules publicadas passaram; emulator bloqueado por Java | Ledger imutavel por rules e totais derivados no client; backend server-side fica pendente para etapa Blaze/Functions futura. |
| 4. Espaco compartilhado | implemented / Spark mode | build, e2e, unitarios e rules publicadas passaram; emulator bloqueado por Java | Workspace do casal, convite de uso unico, QR/link, claims compartilhados e settlements implementados sem Cloud Functions. |
| 5. Billing Stripe custom | implemented / cloud blocked | build, e2e, unitarios, functions e rules publicadas passaram; cloud E2E bloqueado por Blaze/secrets | Checkout/Portal callables, webhook assinado, billingEvents idempotentes, processor/retry, planCatalog e entitlements server-side implementados. |
| 6. Lancamento | pending | landing, juridico e QA | Rotas publicas reservadas com placeholder. |

## O que foi implementado

- Projeto React + TypeScript strict + Vite na raiz do repositorio.
- Firebase client-side via variaveis `VITE_`, com Analytics opcional e inicializacao apenas no browser.
- Auth preparado com email/senha, Google, reset de senha, verificacao de email, logout e metodos vinculados.
- Rotas publicas e autenticadas com React Router.
- Onboarding basico com aceite versionado.
- Fundacao Spark/free: perfil, workspace pessoal, membership owner e workspaceRef sao criados em transacao client-side no Firestore.
- Security Rules permitem somente a criacao atomica da propria fundacao em `users/{uid}`, `workspaces/personal_{uid}`, `members/{uid}` e `workspaceRefs/personal_{uid}`.
- App shell autenticado com sidebar desktop, bottom navigation mobile e dashboard vazio pos-login.
- Landing publica da Fase 1 refinada para mobile/desktop, usando simbolo oficial sem retangulo de imagem negativa no hero.
- `vercel.json` adicionado para fallback SPA em rotas como `/register`, `/login` e `/app/onboarding`.
- Sistema de temas completo: Paper, Sakura, Obsidian, Midnight, Aurora e Rose Gold.
- Modo `system`, prepaint script antes do render, persistencia em `localStorage` e sincronizacao em `/users/{uid}` apos perfil existir.
- Tela `Configuracoes -> Aparencia` em `/app/settings/appearance`.
- Tela `Seguranca -> Metodos de login` em `/app/settings/security/login-methods`.
- Assets oficiais copiados de `assets-visuais/` para `public/brand/`.
- PWA basico com manifest, service worker gerado pelo Vite PWA Plugin e icones oficiais.
- Auto-refresh de versao do PWA inspirado no app Plantao: `registerSW` imediato, checagem ao abrir/focar/voltar online/voltar de aba oculta e a cada 30 minutos.
- Service worker configurado com `skipWaiting`, `clientsClaim` e limpeza de caches antigos.
- Headers Vercel sem cache para `sw.js` e `workbox-*.js`, evitando que usuarios fiquem presos em versoes antigas.
- Firestore Rules com isolamento por membership e bloqueio de campos protegidos.
- Storage Rules inicialmente fechadas.
- `.env.example`, `.firebaserc.example`, `firebase.json`, `firestore.rules`, `storage.rules`, indexes e docs locais.
- Fase 2: tipos canonicos de `Account`, `Category`, `Transaction`, `Bill` e `RecurringRule`.
- Fase 2: servicos Firestore client-side para contas, categorias padrao, transacoes, bills e recorrencias.
- Fase 2: IDs client-side e `clientMutationId` idempotente para transacoes.
- Fase 2: dinheiro parseado e persistido como inteiros em centavos.
- Fase 2: saldo derivado por dominio puro, com receita, despesa, transferencia, ajuste e soft delete.
- Fase 2: dashboard v1 com saldo total, disponivel livre v1, valor comprometido, proximos compromissos, transacoes recentes, acoes rapidas e sync status.
- Fase 2: rotas `/app/dashboard`, `/app/transactions`, `/app/transactions/new`, `/app/transactions/:transactionId/edit`, `/app/accounts`, `/app/bills`, `/app/recurring` e `/app/search`.
- Fase 2: cadastro rapido mobile de transacao com valor, tipo, descricao, categoria, conta, data e avancado recolhido.
- Fase 2: Firestore metadata `hasPendingWrites` usado para mostrar `pending` sem criar fila paralela em Dexie.
- Fase 2: opcao de logout com limpeza de cache local do Firestore para dispositivo compartilhado.
- Fase 2: Security Rules publicadas para accounts, categories, transactions, bills e recurring por membership ativa e campos protegidos.
- Fase 3: tipos canonicos de `CreditCard`, `Invoice` e `InvoiceLedgerEntry`.
- Fase 3: modulo puro `src/domain/invoices/*` para calcular faturas por ledger imutavel.
- Fase 3: compra no cartao (`card_purchase`) reconhece despesa, mas nao reduz saldo de conta.
- Fase 3: pagamento de fatura (`card_payment`) reduz saldo de conta uma unica vez.
- Fase 3: dashboard inclui faturas abertas/fechadas no disponivel livre v1.
- Fase 3: rotas `/app/cards`, `/app/cards/:cardId` e `/app/cards/:cardId/invoices/:invoiceId`.
- Fase 3: telas basicas para criar cartao, registrar compra parcelada, fechar fatura, pagar fatura, registrar creditos, encargos, antecipacao e reconciliacao.
- Fase 3: Firestore Rules publicadas para cards, invoices e ledger, com agregados de fatura protegidos e ledger sem update/delete.
- Fase 3: matriz de cenarios de QA criada em `documentacao-v12.2/QA_SCENARIOS.md` cobrindo Fases 3 a 6 sem implementar fases futuras.
- Fase 4: tipos canonicos de `CoupleInvite`, `SharedExpenseClaim`, `Settlement`, `SharedComment`, `AuditLog` e `WorkspaceRef`.
- Fase 4: servico `src/shared/sharedService.ts` com `createCoupleWorkspace`, `createCoupleInvite`, `previewCoupleInvite`, `acceptCoupleInvite`, `revokeCoupleInvite`, `regenerateCoupleInvite`, `cleanupExpiredInvites`, `leaveCoupleWorkspace` e `removePartner`.
- Fase 4: codigos amigaveis `DUO-XXXX-XX`, hash SHA-256 persistido, hint sem token bruto, validade padrao de 48 horas, uso unico, revogacao e regeneracao.
- Fase 4: QR code e link de convite gerados no client sem persistir token bruto.
- Fase 4: rota publica `/join/:code` preserva convite localmente para continuar apos login/cadastro.
- Fase 4: rota autenticada `/app/shared` com criacao do espaco do casal, convites, aceite, members, claims compartilhados, comentarios e settlements.
- Fase 4: claims compartilhados expõem apenas resumo, total, split, pagador, status e comentarios; referencias pessoais de conta/cartao/fatura ficam fora do contrato.
- Fase 4: modulo puro `src/domain/shared/calculateSharedBalances.ts` calcula balanco por membro e sugestao de acerto com suporte a pagamento parcial/total.
- Fase 4: Firestore Rules publicadas para couple workspace, members, workspaceRefs, coupleInvites, sharedExpenseClaims, settlements, comments e auditLogs.
- Fase 4: entitlement preparado via `canCreateCoupleWorkspace` em modo Spark/local flag; billing real permanece para Fase 5.
- Fase 5: scaffold versionado de `functions/` com Node 22, TypeScript strict, Firebase Functions v2, Firebase Admin, Stripe e Zod.
- Fase 5: `createCheckoutSession` callable autenticada com validacao backend de plano/intervalo, URL segura, Price ID buscado no `planCatalog`, customer server-side e idempotency key.
- Fase 5: `createCustomerPortalSession` callable autenticada para abrir o Portal apenas do customer do usuario.
- Fase 5: `stripeWebhook` HTTP `onRequest` valida `stripe-signature` usando `rawBody` e persiste `billingEvents/{stripeEventId}` de forma idempotente.
- Fase 5: processor assíncrono por Firestore trigger busca assinatura atual na Stripe, sincroniza subscription/billingAccount e recalcula entitlements server-side.
- Fase 5: scheduler de retry para eventos `failed` e `processing` presos, com erro redigido sem segredos.
- Fase 5: `planCatalog/{free,duo,premium}` preparado com script admin `functions/scripts/seedPlanCatalog.mjs`.
- Fase 5: Security Rules permitem leitura do proprio billing account/subscriptions, bloqueiam billingEvents ao client e impedem frontend de forjar entitlements.
- Fase 5: criacao de workspace casal agora exige entitlement server-side `canCreateCoupleWorkspace` em `/billingAccounts/billing_{uid}`.
- Fase 5: rota publica `/pricing` e tela autenticada `/app/settings/billing` implementadas, exibindo cobranca indisponivel quando Price IDs/secrets nao existem.

## Decisao Firestore vs Realtime Database

| Data | Decisao | Motivo | Impacto |
|---|---|---|---|
| 2026-06-14 | Manter Zerou em Cloud Firestore. | O projeto `plantao` usa Realtime Database com bons resultados para arvores simples, sync de anotacoes e codigo de dono. Zerou tera consultas financeiras por periodo, categoria, conta, workspace, colaboracao e regras por documento; Firestore e mais adequado. | Fase 1 fica no plano Spark/free sem Cloud Functions, mas preserva modelagem documental para as proximas fases. |
| 2026-06-14 | Remover Cloud Functions do caminho ativo da Fase 1. | Evitar exigencia de plano Blaze antes do produto precisar de backend pago. | Onboarding cria documentos pelo client, com Firestore Rules rigorosas validando IDs, owner, role e referencias cruzadas. |

## Arquivos principais criados ou alterados

```text
README.md
.env.example
.gitignore
.firebaserc.example
package.json
firebase.json
firestore.rules
storage.rules
vercel.json
functions/package.json
functions/src/billing/*
functions/src/index.ts
functions/scripts/seedPlanCatalog.mjs
public/brand/*
src/main.tsx
src/pwa/registerServiceWorker.ts
src/vite-env.d.ts
src/App.tsx
src/firebase/config.ts
src/auth/*
src/billing/*
src/finance/*
src/cards/*
src/domain/invoices/*
src/domain/shared/*
src/layout/AppShell.tsx
src/onboarding/OnboardingPage.tsx
src/pages/*
src/shared/*
src/settings/*
src/styles/themes.css
src/theme/*
src/types/contracts.ts
src/workspaces/workspaceService.ts
tests/firestore.rules.test.ts
tests/storage.rules.test.ts
tests/e2e/public.spec.ts
docs/MANUAL_SETUP_REQUIRED.md
docs/BILLING.md
docs/BOOTSTRAP_FIREBASE_STRIPE.md
documentacao-v12.2/QA_SCENARIOS.md
```

## Testes executados

| Comando | Resultado | Observacao |
|---|---|---|
| `npm run lint` | passou | ESLint sem erros; `test-results` ignorado como pasta gerada. |
| `npm run typecheck` | passou | TypeScript strict do app e testes. |
| `npm test` | passou | 2 arquivos, 5 testes unitarios. |
| `npm run build` | passou | Vite/PWA build gerado; aviso de chunk inicial > 500 kB. |
| `npm run test:rules` | passou | 2 arquivos, 9 testes em Firestore/Storage emulators; cobre criacao Spark e bloqueios de fraude. |
| `npm run test:e2e` | passou | 1 teste Playwright da landing publica. |
| `npx firebase-tools deploy --only firestore:rules,firestore:indexes --project zerou-26757` | passou | Firestore rules/indexes Spark publicados no projeto real. |
| HTTP live `https://zerou-five.vercel.app/{/,login,register,forgot-password,app}` | passou | Todas as rotas responderam 200 com o bundle Spark/free `assets/index-BB2S_rbX.js`. |
| Fix onboarding Spark apos erro `permission-denied` | passou localmente | Servico deixou de ler workspace/membership antes da criacao; agora usa leitura permitida de `/users/{uid}` e batch atomico. Bundle gerado: `assets/index-BqlIKcE_.js`. |
| `npm run typecheck` apos auto-refresh PWA | passou | TypeScript strict validado. |
| `npm run lint` apos auto-refresh PWA | passou | ESLint sem erros apos ajustar `registerServiceWorker`. |
| `npm test` apos auto-refresh PWA | passou | 2 arquivos, 5 testes unitarios. |
| `npm run build` apos auto-refresh PWA | passou | Bundle gerado: `assets/index-34_EQCq0.js`, `sw.js` e `workbox-9c191d2f.js`; aviso de chunk inicial > 500 kB permanece. |
| `npm run test:e2e` apos auto-refresh PWA | passou | 1 teste Playwright da landing publica. |
| `npm run test:rules` apos auto-refresh PWA | bloqueado por ambiente | Firebase CLI falhou antes dos emuladores: `java -version` saiu com codigo 3221226505; Java local/PATH precisa ser corrigido para reexecutar emuladores. Rules nao foram alteradas nesta mudanca. |
| HTTP live `https://zerou-five.vercel.app` apos auto-refresh PWA | passou | HTML publico serve `assets/index-34_EQCq0.js`; `sw.js` responde 200 com `Cache-Control: no-cache, no-store, must-revalidate`, `skipWaiting` e `clientsClaim`. |
| `npm run typecheck` na Fase 2 | passou | TypeScript strict validado apos dominio financeiro, telas e rules tests. |
| `npm run lint` na Fase 2 | passou | ESLint sem erros. |
| `npm test` na Fase 2 | passou | 3 arquivos, 10 testes unitarios; cobre dominio financeiro, temas e hardcoded colors. |
| `npm run build` na Fase 2 | passou | Bundle gerado: `assets/index-ChTxLlxD.js`; aviso de chunk inicial > 500 kB permanece. |
| `npm run test:e2e` na Fase 2 | passou | 1 teste Playwright da landing publica. |
| `npm run test:rules` na Fase 2 | bloqueado por ambiente | Emulator Suite ainda falha em `java -version` com codigo 3221226505; pastas locais de JDK nao possuem `bin/java.exe` e `winget` nao esta disponivel. |
| `npx firebase-tools deploy --only firestore:rules,firestore:indexes --project zerou-26757` na Fase 2 | passou | Rules novas compilaram e foram publicadas no Firestore real. |
| HTTP live `https://zerou-five.vercel.app` na Fase 2 | passou | HTML publico serve `assets/index-ChTxLlxD.js`. |
| `npm run typecheck` na Fase 3 | passou | TypeScript strict validado apos cartoes, faturas, ledger e rotas novas. |
| `npm run lint` na Fase 3 | passou | ESLint sem erros. |
| `npm test` na Fase 3 | passou | 4 arquivos, 20 testes unitarios; cobre dominio de invoices, idempotencia, parciais, overpayment, creditos, encargos, parcelas e saldo de conta. |
| `npm run build` na Fase 3 | passou | Bundle gerado: `assets/index-BYgXz7gs.js`; aviso de chunk inicial > 500 kB permanece. |
| `npm run test:e2e` na Fase 3 | passou | 1 teste Playwright da landing publica. |
| `npm run test:rules` na Fase 3 | bloqueado por ambiente | Firebase CLI falhou antes dos emuladores: `java -version` saiu com codigo 3221226505. Os testes de rules foram escritos, mas dependem do Java local funcional. |
| `npx firebase-tools deploy --only firestore:rules,firestore:indexes --project zerou-26757` na Fase 3 | passou | Rules de cards, invoices, ledger e transacoes de cartao compilaram e foram publicadas no Firestore real. |
| HTTP live `https://zerou-five.vercel.app` na Fase 3 | passou | Producao serve `assets/index-BYgXz7gs.js`; rotas `/`, `/app/cards`, `/app/cards/example` e `/app/cards/example/invoices/example` retornaram 200. |
| `npm run typecheck` na Fase 4 | passou | TypeScript strict validado apos espaco compartilhado, convites, claims, settlements e rules tests. |
| `npm run lint` na Fase 4 | passou | ESLint sem erros. |
| `npm test` na Fase 4 | passou | 6 arquivos, 29 testes unitarios; cobre dominio financeiro, invoices, shared balances, invite codes, temas e cores. |
| `npm run build` na Fase 4 | passou | Vite/PWA build gerado; aviso de chunk inicial > 500 kB permanece. |
| `npm run test:e2e` na Fase 4 | passou | 2 testes Playwright: landing publica e rota publica `/join/DUO-7X4K-92`. |
| `npm run test:rules` na Fase 4 | bloqueado por ambiente | Firebase CLI falhou antes dos emuladores: `java -version` saiu com codigo 3221226505. Os testes foram atualizados para Fases 3 e 4, mas precisam do Java local funcional. |
| `npx firebase deploy --only firestore:rules,firestore:indexes --project zerou-26757` na Fase 4 | passou | Rules e indexes de coupleInvites compilaram e foram publicados no Firestore real. |
| `npm run typecheck` na Fase 5 | passou | TypeScript strict do app validado apos rotas de pricing/billing e Firebase Functions client. |
| `npm run lint` na Fase 5 | passou | ESLint sem erros; `functions/lib` e `functions/node_modules` ignorados. |
| `npm test` na Fase 5 | passou | 6 arquivos, 29 testes unitarios do app. |
| `npm run functions:build` na Fase 5 | passou | TypeScript strict das Cloud Functions v2 compilou. |
| `npm run test:functions` na Fase 5 | passou | 4 arquivos, 11 testes; cobre entitlements, assinatura Stripe valida/invalida, payload sanitizado e URL segura. |
| `npm run build` na Fase 5 | passou | Bundle PWA gerado; aviso de chunk inicial > 500 kB permanece. |
| `npm run test:e2e` na Fase 5 | passou | 3 testes Playwright: landing, join invite e pricing. |
| `npm run test:rules` na Fase 5 | bloqueado por ambiente | Firebase CLI falhou antes dos emuladores: `java -version` saiu com codigo 3221226505. Tests foram atualizados com billing entitlements, mas dependem do Java local funcional. |
| `npx firebase deploy --only firestore:rules,firestore:indexes --project zerou-26757` na Fase 5 | passou | Rules de billing account, planCatalog e entitlement de casal compilaram e foram publicadas. |

## Pendencias manuais externas

```text
- [x] Projeto Firebase real identificado (`zerou-26757`).
- [ ] Confirmar Email/Senha e Google habilitados no Firebase Auth.
- [x] Preencher `.env.local` com as chaves reais do app web Firebase.
- [x] Autenticar Firebase CLI.
- [x] Configurar Vercel com as variaveis `VITE_FIREBASE_*`.
- [x] Autorizar `zerou-five.vercel.app` em Firebase Auth -> Settings -> Authorized domains.
- [ ] Criar bucket Storage em Firebase Console -> Storage -> Get Started, quando a fase que usar Storage chegar.
- [x] Fazer novo deploy Vercel com o bundle Spark/free deste commit.
- [ ] Validar onboarding em producao ate cair no dashboard vazio.
- [ ] Corrigir instalacao Java/PATH local para permitir `firebase emulators:exec` novamente.
- [ ] Validar manualmente em producao: criar conta financeira, registrar receita, despesa, bill e conferir dashboard.
- [ ] Validar manualmente em producao: criar cartao, registrar compra, pagar fatura parcial e conferir saldo livre.
- [ ] Validar manualmente em producao com dois usuarios reais: criar espaco do casal, gerar convite, aceitar, criar claim e registrar settlement.
- [ ] Reexecutar `npm run test:rules` e um teste offline automatizado assim que Java funcional estiver no PATH.
- [ ] Ativar Blaze antes de publicar Cloud Functions reais da Fase 5.
- [ ] Configurar secrets `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`.
- [ ] Criar produtos/precos Stripe Test Mode para Duo mensal/anual e Premium mensal/anual.
- [ ] Popular `planCatalog` com Price IDs e precos via `npm --prefix functions run seed:plan-catalog`.
- [ ] Deployar Functions da Fase 5 apos Blaze/secrets e cadastrar `stripeWebhook` no Stripe Dashboard.
- [ ] Executar E2E cloud real: Checkout Test Mode, webhook, billing UI, Portal e cancelamento/alteracao.
```

## Limitacoes conhecidas

```text
- O teste automatizado de regras/offline depende do Java local, que esta quebrado neste computador.
- A Fase 3 roda em modo Spark/free: sem Cloud Functions, o client cria entradas de ledger sob Rules restritivas; uma versao backend/server-side pode substituir esse caminho quando o projeto aceitar Blaze.
- A Fase 4 roda em modo Spark/free: convites, memberships, claims e settlements sao criados pelo client sob Rules restritivas; Cloud Functions podem endurecer rate limit, limpeza automatica e entitlement server-side no futuro.
- Os agregados persistidos da fatura ficam protegidos por Rules e nao sao alterados pelo client; a UI deriva totais do ledger.
- O entitlement de casal agora consulta billing server-side em `/billingAccounts/billing_{uid}`; a ativacao cloud depende do setup Stripe/Functions.
- A Fase 5 tem scaffold real de billing, mas Checkout cloud nao foi marcado como ativo porque Blaze, secrets Stripe, Price IDs e endpoint webhook externo ainda nao estao configurados.
- As Cloud Functions nao foram deployadas nesta execucao para evitar ativar recurso pago sem preparacao externa. Apenas Firestore Rules/indexes foram publicados.
- A partir da Fase 5, criar novo espaco compartilhado exige entitlement server-side Duo/Premium; usuarios Free existentes nao perdem dados, mas nao criam novo casal.
- Rotas publicas de legal, ajuda e afins sao placeholders; `/pricing` ja exibe estrutura da Fase 5, e landing completa pertence a Fase 6.
- O build mostra aviso de chunk inicial > 500 kB por causa do bundle com SDKs; otimizar com code splitting depois.
- `npm audit` reportou vulnerabilidades moderadas transitivas em dependencias de ferramentas; nao foi aplicado `audit fix --force`.
```

## Contratos alterados

| Data | Interface/path | Alteracao | Migracao necessaria? |
|---|---|---|---|
| 2026-06-14 | `/users/{uid}` | Preferencias de aparencia e fundacao Spark implementadas conforme contrato da Fase 1. | Nao para usuarios novos; usuarios parciais criados antes da mudanca podem precisar recriar conta ou limpeza manual. |
| 2026-06-14 | `/workspaces/{workspaceId}` e `/members/{uid}` | Criacao do workspace pessoal agora e client-side transacional, validada por Rules. | Nao para usuarios novos. |
| 2026-06-14 | `firestore.rules` | Rules permitem somente criacao atomica da propria fundacao e atualizacao posterior de aparencia. | Publicar rules no Firebase real. |
| 2026-06-14 | `/workspaces/{workspaceId}/accounts/{accountId}` | Conta financeira da Fase 2 implementada conforme contrato canonico. | Nao para usuarios novos. |
| 2026-06-14 | `/workspaces/{workspaceId}/categories/{categoryId}` | Categorias padrao idempotentes implementadas por IDs deterministico. | Nao para usuarios novos. |
| 2026-06-14 | `/workspaces/{workspaceId}/transactions/{transactionId}` | Transacoes com `clientMutationId`, `syncStatus`, soft delete e versao implementadas. | Nao para usuarios novos. |
| 2026-06-14 | `/workspaces/{workspaceId}/bills/{billId}` | Contas a pagar basicas entram no disponivel livre v1. | Nao. |
| 2026-06-14 | `/workspaces/{workspaceId}/recurring/{recurringId}` | Regras recorrentes basicas entram como compromissos previstos. | Nao. |
| 2026-06-14 | `/workspaces/{workspaceId}/cards/{cardId}` | Cartoes de credito da Fase 3 implementados por workspace/membership. | Nao. |
| 2026-06-14 | `/workspaces/{workspaceId}/cards/{cardId}/invoices/{invoiceId}` | Faturas com status persistido e agregados protegidos; totais derivados pelo ledger. | Nao. |
| 2026-06-14 | `/workspaces/{workspaceId}/cards/{cardId}/invoices/{invoiceId}/ledger/{entryId}` | Ledger de fatura criado com idempotencia por documento e bloqueado para update/delete. | Nao. |
| 2026-06-14 | `/workspaces/{workspaceId}/transactions/{transactionId}` | Tipos `card_purchase` e `card_payment` adicionados; compra nao exige conta, pagamento exige conta. | Nao. |
| 2026-06-15 | `/workspaces/{workspaceId}` | Tipo `couple`, `partnerUserId`, `activeMemberCount` e `billingAccountId` preparados para espaco compartilhado. | Nao. |
| 2026-06-15 | `/workspaces/{workspaceId}/coupleInvites/{inviteId}` | Convites de casal com hash, hint, status, expiracao, acceptedBy e revokedAt; token bruto nao e persistido. | Nao. |
| 2026-06-15 | `/users/{uid}/workspaceRefs/{workspaceId}` | Referencia individual para workspace compartilhado; escolha de tema segue no usuario e nao no casal. | Nao. |
| 2026-06-15 | `/workspaces/{workspaceId}/sharedExpenseClaims/{claimId}` | Claims compartilhados com resumo, total, split, pagador, status e versao; campos pessoais bloqueados. | Nao. |
| 2026-06-15 | `/workspaces/{workspaceId}/settlements/{settlementId}` | Settlements com devedor/credor, valor proposto, valor pago, status e historico. | Nao. |
| 2026-06-15 | `/workspaces/{workspaceId}/comments/{commentId}` e `/auditLogs/{auditId}` | Comentarios e auditoria do espaco compartilhado sem expor token bruto de convite. | Nao. |
| 2026-06-15 | `/planCatalog/{planId}` | Catalogo Free/Duo/Premium legivel pelo client; Price IDs/precos sao configurados por admin script, nao pela UI. | Popular documentos antes de checkout real. |
| 2026-06-15 | `/billingAccounts/{billingAccountId}` | Billing account server-side com owner, customer Stripe, plano atual, status e entitlements. | Criado/atualizado por Functions; client nao escreve. |
| 2026-06-15 | `/billingAccounts/{billingAccountId}/subscriptions/{subscriptionId}` | Snapshot server-side de assinatura Stripe sincronizada por webhook/processor. | Criado/atualizado por Functions. |
| 2026-06-15 | `/billingAccounts/{billingAccountId}/billingEvents/{stripeEventId}` | Eventos Stripe persistidos uma vez, status de processamento, tentativas e erro redigido. | Client nao le; criado por webhook. |
| 2026-06-15 | `firestore.rules` | Criacao de `couple` workspace agora exige `entitlements.canCreateCoupleWorkspace == true` no billing account server-side. | Usuarios Free nao criam novo casal; dados existentes preservados. |

## Proxima fase

```text
Prompt a executar: documentacao-v12.2/prompts/06-LANCAMENTO-LANDING-JURIDICO.md
Pre-condicoes: Auth providers habilitados, `.env.local` preenchido, Firestore rules da Fase 5 publicadas, Vercel com bundle da Fase 5, billing cloud configurado ou bloqueio externo mantido documentado.
Arquivos que o proximo agente deve ler: README-START-HERE.md, documentacao-v12.2/README.md, ZEROU-V12.2-ESPECIFICACAO-MESTRA.md, CONTRATOS-CANONICOS.md, THEME-SYSTEM.md, BRAND-GUIDELINES.md, BRAND-ASSET-INTEGRATION.md, PRODUCT-COPY-CANONICAL.md, IMPLEMENTATION_STATUS.md, QA_SCENARIOS.md, docs/BILLING.md, docs/BOOTSTRAP_FIREBASE_STRIPE.md e o prompt da Fase 6.
```

## Verificacao do sistema de temas

```text
- [x] registro central contem Paper, Sakura, Obsidian, Midnight, Aurora e Rose Gold
- [x] componentes autenticados usam tokens semanticos
- [x] preferencia aplica antes do primeiro render
- [x] localStorage e Firestore sincronizam sem bloquear a UI
- [x] tema pertence ao usuario, nao ao workspace
- [x] modo system reage a prefers-color-scheme
```
