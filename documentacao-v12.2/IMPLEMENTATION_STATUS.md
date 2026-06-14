# Zerou - Implementation Status

> Atualizar obrigatoriamente ao fim de cada fase. Este arquivo e o handoff entre execucoes.

## Resumo

```text
Fase atual: 1 implementada em modo Spark/free
Ultima fase concluida: 1. Fundacao SaaS
Ambiente validado: local com emuladores; Vercel publico sem erro de render
Ultima atualizacao: 2026-06-14
Gate da Fase 1: passou localmente; producao serve bundle Spark/free e aguarda validacao manual do onboarding com conta real
```

## Estado por fase

| Fase | Status | Gate | Observacoes |
|---|---|---|---|
| 1. Fundacao SaaS | implemented / Spark mode | local passou; Firestore rules publicadas | Fundacao React/Firebase/PWA entregue. Cloud Functions removidas do caminho ativo para manter plano Spark/free. |
| 2. Motor financeiro essencial | pending | transacao offline sincroniza sem duplicar | Nao iniciar antes do prompt da Fase 2. |
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
- Firestore Rules com isolamento por membership e bloqueio de campos protegidos.
- Storage Rules inicialmente fechadas.
- `.env.example`, `.firebaserc.example`, `firebase.json`, `firestore.rules`, `storage.rules`, indexes e docs locais.

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
src/App.tsx
src/firebase/config.ts
src/auth/*
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
```

## Limitacoes conhecidas

```text
- O dashboard esta vazio por decisao de escopo; nao ha motor financeiro nem dados financeiros persistidos.
- A primeira conta opcional do onboarding ficou apenas sinalizada para a Fase 2 para nao antecipar o motor financeiro.
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

## Proxima fase

```text
Prompt a executar: documentacao-v12.2/prompts/02-MOTOR-FINANCEIRO-ESSENCIAL.md
Pre-condicoes: Auth providers habilitados, `.env.local` preenchido, Firestore rules publicadas, Vercel com bundle Spark/free e onboarding validado no deploy publico.
Arquivos que o proximo agente deve ler: README-START-HERE.md, documentacao-v12.2/README.md, ZEROU-V12.2-ESPECIFICACAO-MESTRA.md, CONTRATOS-CANONICOS.md, THEME-SYSTEM.md, BRAND-GUIDELINES.md, BRAND-ASSET-INTEGRATION.md, PRODUCT-COPY-CANONICAL.md, IMPLEMENTATION_STATUS.md e o prompt da Fase 2.
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
