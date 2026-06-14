# Zerou - Implementation Status

> Atualizar obrigatoriamente ao fim de cada fase. Este arquivo e o handoff entre execuções.

## Resumo

```text
Fase atual: 1 concluída
Última fase concluída: 1. Fundação SaaS
Ambiente validado: local com emuladores
Última atualização: 2026-06-14
Gate da Fase 1: passou
```

## Estado por fase

| Fase | Status | Gate | Observações |
|---|---|---|---|
| 1. Fundação SaaS | completed | login + workspace pessoal isolado + seis temas persistidos por usuário | Fundação React/Firebase/PWA entregue. Rules testadas em emuladores. |
| 2. Motor financeiro essencial | pending | transação offline sincroniza sem duplicar | Não iniciar antes do prompt da Fase 2. |
| 3. Cartões e faturas | pending | ledger parcial e dupla contagem testados | Não iniciado. |
| 4. Espaço compartilhado | pending | casal sem vazamento pessoal | Convite pendente só é preservado localmente. |
| 5. Billing Stripe custom | pending | webhook idempotente + entitlements | Não iniciado. |
| 6. Lançamento | pending | landing, jurídico e QA | Rotas públicas reservadas com placeholder. |

## O que foi implementado

- Projeto React + TypeScript strict + Vite na raiz do repositório.
- Firebase client-side via variáveis `VITE_`, com Analytics opcional e inicialização apenas no browser.
- Auth preparado com email/senha, Google, reset de senha, verificação de email, logout e métodos vinculados.
- Rotas públicas e autenticadas com React Router.
- Onboarding básico com aceite versionado, criação de perfil e workspace pessoal por callable Functions.
- Callable Functions v2 `ensureUserProfile` e `ensurePersonalWorkspace`, idempotentes e em `southamerica-east1`.
- App shell autenticado com sidebar desktop, bottom navigation mobile e dashboard vazio pós-login.
- Ajuste pós-QA do deploy: Firebase agora inicializa de forma lazy, a landing não quebra quando `VITE_FIREBASE_*` está ausente/inválido e as telas de auth exibem erro acionável de configuração.
- Landing pública da Fase 1 refinada para mobile/desktop, usando símbolo oficial sem retângulo de imagem negativa no hero.
- `vercel.json` adicionado para fallback SPA em rotas como `/register`, `/login` e `/app/onboarding`.
- Sistema de temas completo: Paper, Sakura, Obsidian, Midnight, Aurora e Rose Gold.
- Modo `system`, prepaint script antes do render, persistência em `localStorage` e sincronização em `/users/{uid}`.
- Tela `Configurações -> Aparência` em `/app/settings/appearance`.
- Tela `Segurança -> Métodos de login` em `/app/settings/security/login-methods`.
- Assets oficiais copiados de `assets-visuais/` para `public/brand/`.
- PWA básico com manifest, service worker gerado pelo Vite PWA Plugin e ícones oficiais.
- Firestore Rules com isolamento por membership e bloqueio de campos protegidos.
- Storage Rules inicialmente fechadas.
- `.env.example`, `.firebaserc.example`, `firebase.json`, `firestore.rules`, `storage.rules`, indexes e docs locais.

## Arquivos principais criados ou alterados

```text
README.md
.env.example
.gitignore
.firebaserc.example
package.json
vite.config.ts
tsconfig.json
tailwind.config.ts
postcss.config.js
firebase.json
firestore.rules
firestore.indexes.json
storage.rules
public/brand/*
public/favicon.ico
src/main.tsx
src/App.tsx
src/firebase/config.ts
src/auth/*
src/layout/AppShell.tsx
src/onboarding/OnboardingPage.tsx
src/pages/*
src/settings/*
src/styles/themes.css
src/styles/global.css
src/theme/*
src/types/contracts.ts
src/workspaces/workspaceService.ts
functions/package.json
functions/tsconfig.json
functions/src/index.ts
tests/firestore.rules.test.ts
tests/storage.rules.test.ts
tests/e2e/public.spec.ts
docs/MANUAL_SETUP_REQUIRED.md
```

## Testes executados

| Comando | Resultado | Observação |
|---|---|---|
| `npm run lint` | passou | ESLint sem erros. |
| `npm run typecheck` | passou | TypeScript strict do app. |
| `npm test` | passou | 2 arquivos, 5 testes unitários. |
| `npm run build` | passou | Vite/PWA build gerado; aviso de chunk inicial > 500 kB. |
| `npm run test:rules` | passou | 2 arquivos, 6 testes em Firestore/Storage emulators. Java JetBrains JBR foi usado no PATH local. |
| `npm run test:e2e` | passou | 1 teste Playwright; Chromium instalado com `npx playwright install chromium`. |
| `npm run build` em `functions/` | passou | `tsc` das Functions. |
| `@chrome` em `https://zerou-five.vercel.app/` | falhou antes do ajuste | Console mostrou `FirebaseError: auth/invalid-api-key`, deixando `#root` vazio. |
| Chrome/local em `http://127.0.0.1:4175/` | passou | Landing nova renderizada sem erros no cadastro local. |
| Playwright live em `https://zerou-five.vercel.app/register` | falhou antes do ajuste | Vercel retornava 404 por falta de rewrite SPA. Corrigido com `vercel.json`. |

## Pendências manuais externas

```text
- [ ] Criar projeto Firebase Dev real.
- [ ] Habilitar Email/Senha e Google no Firebase Auth.
- [ ] Criar Firestore Native Mode e Storage bucket.
- [ ] Preencher `.env.local` com as chaves reais do app web Firebase.
- [ ] Configurar `.firebaserc` real a partir de `.firebaserc.example`.
- [ ] Instalar Java no PATH padrão da máquina; o PATH atual tinha Oracle Java quebrando `java -version`, mas o JBR do PyCharm funcionou.
- [ ] Autenticar Firebase CLI se for usar recursos cloud fora dos emuladores.
- [ ] Configurar Vercel com as variáveis `VITE_FIREBASE_*`.
```

## Limitações conhecidas

```text
- O dashboard está vazio por decisão de escopo; não há motor financeiro nem dados financeiros persistidos.
- A primeira conta opcional do onboarding ficou apenas sinalizada para a Fase 2 para não antecipar o motor financeiro.
- Rotas públicas de pricing, legal, ajuda e afins são placeholders; landing completa pertence à Fase 6.
- O deploy Vercel ainda depende de variáveis reais `VITE_FIREBASE_*` e domínio autorizado no Firebase Auth para Google funcionar em produção.
- As callable Functions `ensureUserProfile` e `ensurePersonalWorkspace` precisam estar implantadas no Firebase real para o onboarding concluir fora dos emuladores.
- O build mostra aviso de chunk inicial > 500 kB por causa do bundle com SDKs; otimizar com code splitting depois.
- `npm audit` reportou vulnerabilidades moderadas transitivas em dependências de ferramentas; não foi aplicado `audit fix --force`.
```

## Decisões arquiteturais acumuladas

| Data | Decisão | Motivo | Impacto |
|---|---|---|---|
| 2026-06-14 | Tema individual usa `localStorage` antes do render e sincroniza com `/users/{uid}` após login. | Evitar flash visual e preservar preferência por usuário. | Preferência visual não é salva em workspace e não afeta parceiro. |
| 2026-06-14 | Workspace pessoal é criado server-side por callable Function idempotente. | Cliente não pode escrever membership, role, owner ou campos protegidos. | Gate de isolamento validado por Rules tests. |
| 2026-06-14 | Storage permanece fechado na Fase 1. | Caminhos autorizados de anexos só devem existir quando o domínio for implementado. | Uploads falham até fases futuras definirem paths. |
| 2026-06-14 | Primeira conta financeira não é persistida no onboarding. | Evitar antecipar motor financeiro da Fase 2. | Onboarding conclui com perfil e workspace pessoal apenas. |

## Contratos alterados

| Data | Interface/path | Alteração | Migração necessária? |
|---|---|---|---|
| 2026-06-14 | `/users/{uid}` | Preferências de aparência implementadas conforme contrato. | Não. |
| 2026-06-14 | `/workspaces/{workspaceId}` e `/members/{uid}` | Criação server-side do workspace pessoal. | Não. |
| 2026-06-14 | `firestore.rules` | Leitura por membership ativa e updates client-side restritos à aparência. | Não. |

## Próxima fase

```text
Prompt a executar: documentacao-v12.2/prompts/02-MOTOR-FINANCEIRO-ESSENCIAL.md
Pré-condições: Firebase Dev real configurado, Auth providers habilitados, `.env.local` preenchido.
Arquivos que o próximo agente deve ler: README-START-HERE.md, documentacao-v12.2/README.md, ZEROU-V12.2-ESPECIFICACAO-MESTRA.md, CONTRATOS-CANONICOS.md, THEME-SYSTEM.md, BRAND-GUIDELINES.md, BRAND-ASSET-INTEGRATION.md, PRODUCT-COPY-CANONICAL.md, IMPLEMENTATION_STATUS.md e o prompt da Fase 2.
```

## Verificação do sistema de temas

```text
- [x] registro central contém Paper, Sakura, Obsidian, Midnight, Aurora e Rose Gold
- [x] componentes autenticados usam tokens semânticos
- [x] preferência aplica antes do primeiro render
- [x] localStorage e Firestore sincronizam sem bloquear a UI
- [x] tema pertence ao usuário, não ao workspace
- [x] modo system reage a prefers-color-scheme
```
