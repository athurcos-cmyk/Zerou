# Zerou

Controle individual. Organizacao a dois.

App React/TypeScript/Firebase do Zerou v12.2 com Fases 1 a 6 implementadas em modo de lancamento gratuito.

## Stack

- React + TypeScript strict + Vite
- Firebase Web SDK: App, Auth, Firestore, Storage e Analytics opcional
- React Router, Zustand, React Hook Form, Zod
- Tailwind CSS com CSS variables e tokens semanticos
- Vite PWA Plugin
- Vitest, Firebase Rules Unit Testing e Playwright
- Cloud Functions v2 mantidas como scaffold futuro, sem cobrança ativa no app

## Setup local

1. Instale Node.js 22 ou superior.
2. Copie `.env.example` para `.env.local`.
3. Preencha `.env.local` com a configuracao real do app web Firebase.
4. Instale dependencias:

```bash
npm install
```

5. Rode o app:

```bash
npm run dev
```

## Scripts

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:rules
npm run test:e2e
npm run functions:build
npm run test:functions
npm run emulators
```

Para `npm run test:rules`, Java precisa estar instalado e disponivel no PATH.

## Firebase

O client Firebase le apenas variaveis `VITE_` e nao contem `firebaseConfig` hardcoded.

A fundacao e os fluxos financeiros atuais rodam client-side com Security Rules restritivas. A Fase 5 adiciona scaffold real de Cloud Functions para Stripe Checkout, Customer Portal, webhook assinado, processamento idempotente e entitlements server-side.

Decisao atual: a Zerou fica 100% gratuita por enquanto. Billing real exige nova decisao de produto, Blaze, secrets Stripe, Price IDs no `planCatalog` e webhook cadastrado.

## Escopo atual

Implementado: autenticacao, onboarding, workspace pessoal, shell autenticado mobile-first, dashboard financeiro com resumo de gastos, contas, transacoes, contas a pagar, recorrencias, busca, cartoes, faturas, ledger de fatura, espaco compartilhado, convites de casal, despesas compartilhadas, settlements, Functions Stripe custom futuro sem UI ativa, entitlements server-side, landing publica clara com funcionalidades no corpo, rotas legais de Termos/Privacidade, privacidade simplificada, analytics desligado por padrao, temas Paper/Sakura/Obsidian/Midnight/Aurora/Rose Gold, modo system opcional, PWA basico e regras Firestore publicaveis.

Fora do escopo atual: deploy cloud das Functions sem Blaze/secrets, Pix, boleto, cupons avancados, admin completo, automacao real de exportacao/exclusao de dados e cobranca ativa.

## QA e status

O handoff das fases fica em `documentacao-v12.2/IMPLEMENTATION_STATUS.md`.
A matriz de cenarios de sucesso/erro fica em `documentacao-v12.2/QA_SCENARIOS.md`.
Arquitetura, seguranca, privacidade e operacao ficam em `ARCHITECTURE.md`, `SECURITY.md`, `PRIVACY.md`, `RUNBOOK.md` e `docs/PRODUCTION_CHECKLIST.md`.
Setup de billing futuro fica em `docs/BILLING.md` e `docs/BOOTSTRAP_FIREBASE_STRIPE.md`.
