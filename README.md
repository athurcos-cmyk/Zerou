# Zerou

Controle individual. Organizacao a dois.

App React/TypeScript/Firebase do Zerou v12.2 com Fases 1, 2, 3, 4 e 5 implementadas.

## Stack

- React + TypeScript strict + Vite
- Firebase Web SDK: App, Auth, Firestore, Storage e Analytics opcional
- React Router, Zustand, React Hook Form, Zod
- Tailwind CSS com CSS variables e tokens semanticos
- Vite PWA Plugin
- Vitest, Firebase Rules Unit Testing e Playwright
- Cloud Functions v2 para billing Stripe customizado

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

Billing real exige Blaze, secrets Stripe, Price IDs no `planCatalog` e webhook cadastrado. Sem isso, a UI mostra cobrança indisponivel.

## Escopo atual

Implementado: autenticacao, onboarding, workspace pessoal, shell autenticado, dashboard financeiro v1, contas, transacoes, contas a pagar, recorrencias, busca, cartoes, faturas, ledger de fatura, espaco compartilhado, convites de casal, claims compartilhados, settlements, pricing, tela de cobrança, Functions Stripe custom, entitlements server-side, temas Paper/Sakura/Obsidian/Midnight/Aurora/Rose Gold, modo system, PWA basico e regras Firestore publicaveis.

Fora do escopo atual: landing completa, rotas juridicas finais, deploy cloud das Functions sem Blaze/secrets, Pix, boleto, cupons avancados e admin completo.

## QA e status

O handoff das fases fica em `documentacao-v12.2/IMPLEMENTATION_STATUS.md`.
A matriz de cenarios de sucesso/erro fica em `documentacao-v12.2/QA_SCENARIOS.md`.
Setup de billing fica em `docs/BILLING.md` e `docs/BOOTSTRAP_FIREBASE_STRIPE.md`.
