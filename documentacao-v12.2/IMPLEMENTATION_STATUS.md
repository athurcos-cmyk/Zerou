# Zerou - Implementation Status

> Atualizar obrigatoriamente ao fim de cada fase. Este arquivo e o handoff entre execucoes.

## Resumo

```text
Fase atual: 2 implementada em modo Spark/free
Ultima fase concluida: 2. Motor financeiro essencial
Ambiente validado: local sem emuladores por bloqueio Java; Firestore Rules compiladas e publicadas; Vercel pendente deste commit
Ultima atualizacao: 2026-06-14
Gate da Fase 2: implementacao, build, dominio e deploy de rules passaram; teste automatizado de rules/offline segue bloqueado pelo Java local.
```

## Estado por fase

| Fase | Status | Gate | Observacoes |
|---|---|---|---|
| 1. Fundacao SaaS | implemented / Spark mode | local passou; Firestore rules publicadas | Fundacao React/Firebase/PWA entregue. Cloud Functions removidas do caminho ativo para manter plano Spark/free. |
| 2. Motor financeiro essencial | implemented / Spark mode | build passou; rules publicadas; offline automatizado bloqueado por Java | Contas, transacoes, dashboard v1, bills, recorrencias, busca e sync status implementados sem Cloud Functions. |
| 3. Cartoes e faturas | pending | ledger parcial e dupla contagem testados | Nao iniciado. |
| 4. Espaco compartilhado | pending | casal sem vazamento pessoal | Convite pendente so e preservado localmente. |
| 5. Billing Stripe custom | pending | webhook idempotente + entitlements | Nao iniciado. |
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
public/brand/*
src/main.tsx
src/pwa/registerServiceWorker.ts
src/vite-env.d.ts
src/App.tsx
src/firebase/config.ts
src/auth/*
src/finance/*
src/layout/AppShell.tsx
src/onboarding/OnboardingPage.tsx
src/pages/*
src/settings/*
src/styles/themes.css
src/theme/*
src/types/contracts.ts
src/workspaces/workspaceService.ts
tests/firestore.rules.test.ts
tests/storage.rules.test.ts
tests/e2e/public.spec.ts
docs/MANUAL_SETUP_REQUIRED.md
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
- [ ] Reexecutar `npm run test:rules` e um teste offline automatizado assim que Java funcional estiver no PATH.
```

## Limitacoes conhecidas

```text
- O teste automatizado de regras/offline depende do Java local, que esta quebrado neste computador.
- O dashboard agora e real, mas nao inclui cartoes/faturas; o ponto de extensao fica reservado para a Fase 3.
- Rotas publicas de pricing, legal, ajuda e afins sao placeholders; landing completa pertence a Fase 6.
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

## Proxima fase

```text
Prompt a executar: documentacao-v12.2/prompts/03-CARTOES-E-FATURAS.md
Pre-condicoes: Auth providers habilitados, `.env.local` preenchido, Firestore rules da Fase 2 publicadas, Vercel com bundle da Fase 2 e fluxo financeiro essencial validado manualmente.
Arquivos que o proximo agente deve ler: README-START-HERE.md, documentacao-v12.2/README.md, ZEROU-V12.2-ESPECIFICACAO-MESTRA.md, CONTRATOS-CANONICOS.md, THEME-SYSTEM.md, BRAND-GUIDELINES.md, BRAND-ASSET-INTEGRATION.md, PRODUCT-COPY-CANONICAL.md, IMPLEMENTATION_STATUS.md e o prompt da Fase 3.
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
