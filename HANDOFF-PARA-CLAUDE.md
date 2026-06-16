# Handoff para Claude

Use este arquivo como contexto inicial para continuar o projeto Zerou em outra ferramenta.

## O que e o Zerou

Zerou e um SaaS/PWA financeiro mobile-first.

Proposta: ajudar uma pessoa a controlar o proprio dinheiro e, quando quiser, organizar despesas a dois com companheiro ou companheira sem misturar o que deve continuar privado.

Nome publico: Zerou.

Tagline oficial: "Controle individual. Organizacao a dois."

Estado atual: Fases 1 a 6 implementadas em modo de lancamento gratuito. O app esta funcional, mas ainda precisa de QA manual real em celular antes de divulgacao ampla.

URL atual de producao/preview: `https://zerou-five.vercel.app`.

Repositorio: `athurcos-cmyk/Zerou`.

Branch de trabalho do dono: `main`. O dono pediu para trabalhar direto na `main`, sem PR.

## Stack

- React 19
- TypeScript strict
- Vite
- Firebase Web SDK
- Firebase Auth
- Cloud Firestore
- Firebase Storage com rules fechadas por enquanto
- Firebase Functions v2 como scaffold futuro
- Vercel
- Vite PWA Plugin
- React Router
- React Hook Form
- Zod
- Zustand
- Recharts
- Framer Motion
- Lucide React
- Vitest
- Playwright
- Firebase Rules Unit Testing

Node esperado: `>=22.0.0`.

## Comandos principais

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run functions:build
npm run test:functions
npm run test:rules
npm run generate:bank-logos
```

Observacao: `npm run test:rules` depende de Java. No computador atual, Java esta quebrando com codigo `3221226505`.

## Variaveis de ambiente

O app usa `.env.local`, nao commitado.

Modelo em `.env.example`:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

Analytics fica desligado por padrao. So deve ligar com `VITE_ENABLE_ANALYTICS=true` e consentimento futuro.

## Decisoes de produto importantes

1. O app deve ser mobile-first.
2. Tema principal e claro, Paper.
3. Landing, login e cadastro devem ficar claros mesmo se o dispositivo estiver em dark mode.
4. O produto esta 100% gratuito por enquanto.
5. Nao reintroduzir pagina publica de planos neste momento.
6. Nao reintroduzir banner de cookies bloqueando entrada.
7. Nao usar linguagem tecnica para usuario final como "billing", "checkout", "ledger", "offline-first", "workspace" ou "Firestore".
8. Funcionalidades compartilhadas devem ser simples no celular. Evitar excesso de opcoes visiveis.
9. Dados pessoais financeiros de uma pessoa nao devem vazar para o espaco do casal.
10. Tema e individual por usuario. A escolha de um parceiro nao altera a interface do outro.

## Decisoes tecnicas importantes

1. Firestore foi escolhido em vez de Realtime Database.
2. O projeto roda em modo Spark/free para o fluxo ativo.
3. Cloud Functions existem como scaffold futuro, mas nao devem ser ativadas sem decisao explicita.
4. Stripe/billing existe no codigo como fundacao futura, mas nao esta ativo na UI publica.
5. Onboarding cria perfil, workspace pessoal, membership e workspaceRef pelo client sob Security Rules.
6. Firestore Rules ja foram publicadas no projeto real `zerou-26757`.
7. PWA tem auto-refresh de versao para reduzir problema de cache.
8. Service worker e Workbox devem continuar com headers sem cache na Vercel.
9. Contas financeiras sem vinculos sao deletadas fisicamente do Firestore.
10. Contas financeiras com lancamentos, contas a pagar ou recorrencias ligadas nao devem ser deletadas ate mover/remover vinculos.

## Estrutura principal

```text
src/
  auth/                 AuthContext e servicos de login
  billing/              client/scaffold de billing futuro
  cards/                cartoes e faturas
  domain/invoices/      calculos puros de faturas
  domain/shared/        calculos puros do casal
  finance/              contas, transacoes, bills, recorrencias, labels e banco de instituicoes
  layout/               AppShell, sidebar e bottom navigation
  onboarding/           fundacao do usuario
  pages/                telas publicas e autenticadas
  privacy/              consentimento futuro/privacidade
  pwa/                  registro e refresh de service worker
  shared/               espaco compartilhado
  settings/             configuracoes
  styles/               CSS global e temas
  theme/                sistema de tema
  types/                contratos TypeScript
  workspaces/           criacao e leitura de workspace
functions/
  src/billing/          Stripe scaffold futuro
  src/email/            adapter minimo de emails
public/
  brand/                assets oficiais Zerou
  bank-logos/           SVGs locais de bancos disponiveis
docs/
  legal/                termos e privacidade operacionais
documentacao-v12.2/     documentacao mestre original e status
```

## O que ja esta implementado

### Fundacao

- App React/TypeScript/Vite.
- Firebase Auth com email/senha e Google.
- Onboarding com perfil, workspace pessoal e membership.
- App shell autenticado.
- PWA basico.
- Temas oficiais: Paper, Sakura, Obsidian, Midnight, Aurora, Rose Gold.
- Modo system opcional.
- Assets oficiais Zerou.

### Financeiro

- Contas financeiras.
- Transacoes.
- Categorias padrao.
- Contas a pagar.
- Recorrencias.
- Dashboard com saldo total, disponivel livre, compromissos e resumo por categoria.
- Busca.
- Sync status.
- Exclusao fisica de conta financeira sem vinculos.
- Sugestoes de instituicoes financeiras.
- SVGs locais para alguns bancos.

### Cartoes e faturas

- Cartoes de credito.
- Faturas.
- Ledger de fatura.
- Compra parcelada.
- Pagamento parcial/total de fatura.
- Creditos, encargos, antecipacao e reconciliacao.
- Pagamento de fatura reduz saldo da conta uma unica vez.

### Espaco compartilhado

- Workspace do casal.
- Convite com codigo amigavel.
- QR/link.
- Aceite de convite.
- Claims compartilhados.
- Settlements.
- Comentarios e auditoria.
- UI simplificada depois de teste no celular.

### Lancamento

- Landing clara mobile-first.
- Mockup mobile com efeito 3D leve.
- Rotas publicas reais.
- Termos e privacidade operacionais.
- Privacy Center informativo.
- FAQ sem perguntas de "producao" ou "pagamento".
- Sem planos visiveis.
- Sem banner de cookies.
- Analytics desligado por padrao.

## Arquivos que precisam ser lidos antes de mexer pesado

```text
README.md
CHANGELOG.md
HANDOFF-PARA-CLAUDE.md
ARCHITECTURE.md
SECURITY.md
PRIVACY.md
RUNBOOK.md
docs/PRODUCTION_CHECKLIST.md
docs/legal/TERMS.md
docs/legal/PRIVACY.md
documentacao-v12.2/IMPLEMENTATION_STATUS.md
documentacao-v12.2/QA_SCENARIOS.md
documentacao-v12.2/ZEROU-V12.2-ESPECIFICACAO-MESTRA.md
documentacao-v12.2/CONTRATOS-CANONICOS.md
documentacao-v12.2/THEME-SYSTEM.md
documentacao-v12.2/BRAND-GUIDELINES.md
documentacao-v12.2/PRODUCT-COPY-CANONICAL.md
```

## Pontos sensiveis

- Nao commitar `.env.local`.
- Nao commitar service account.
- Nao hardcodar Firebase config.
- Nao ativar billing pago sem pedir.
- Nao deployar Cloud Functions sem pedir.
- Nao mudar de Firestore para Realtime Database sem redesenhar arquitetura.
- Nao transformar a landing em dark theme por padrao.
- Nao expor erro tecnico para usuario final.
- Nao criar dados fake persistidos como se fossem producao.
- Nao usar logo de banco sem fonte confiavel.

## Pendencias atuais

- Corrigir Java/PATH local para `npm run test:rules`.
- Fazer QA manual real no celular: cadastro, login, onboarding, conta financeira, receita, despesa, bill, cartao, fatura parcial, espaco do casal.
- Configurar dominio final e atualizar canonical/sitemap.
- Configurar App Check.
- Configurar backups/restore do Firestore.
- Configurar alertas de custo Firebase/Vercel.
- Configurar emails oficiais de suporte e privacidade.
- Revisar termos/privacidade com profissional juridico quando o app for ganhar escala.
- Adicionar SVGs oficiais dos bancos que ainda estao com fallback: Itau, Bradesco, Banco do Brasil, Caixa, Santander, Inter, C6, BTG, XP e outros.
- Fazer code splitting para reduzir bundle inicial maior que 500 kB.

## Ultimos commits relevantes

```text
74e4252 Document bank logo production smoke
7c24710 Add local SVG bank logos
eb6d884 Add compact bank identity marks
d0f7841 Use real delete for unused financial accounts
a3add1c Improve financial account management
094f748 Simplify public launch legal and marketing
1f87345 Polish mobile finance UX
f9fdb85 Implement fase 6 free launch
5fdefa6 Implement phase 5 billing foundation
f370cb4 Implement phase 4 shared workspace
1a20763 Implement phase 3 cards and invoices
93456e5 implement phase 2 financial core
```

## Estado de validacao

Passou recentemente:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run functions:build
npm run test:functions
npm audit --omit=dev
```

Tambem houve smoke em producao confirmando que a Vercel serviu o bundle novo e que `/bank-logos/nubank.svg` esta acessivel.

Bloqueado por ambiente:

```bash
npm run test:rules
```

Motivo: Java local quebrado neste computador.

## Sugestao de proxima rodada

1. Fazer QA manual no celular com usuario real.
2. Melhorar ainda mais a tela inicial autenticada para usuario novo.
3. Simplificar area compartilhada no celular se ainda parecer confusa.
4. Revisar fluxo de criar/editar/excluir conta financeira com estados vazios melhores.
5. Adicionar SVGs oficiais faltantes de bancos.
6. Fazer code splitting do app.
7. Corrigir Java e rodar `npm run test:rules`.
8. Revisar checklist de producao antes de divulgacao publica ampla.
