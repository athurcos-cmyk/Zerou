# Zerou

Controle individual. Organizacao a dois.

Fundacao React/TypeScript/Firebase da Fase 1 do Zerou v12.2.

## Stack

- React + TypeScript strict + Vite
- Firebase Web SDK: App, Auth, Firestore, Storage e Analytics opcional
- React Router, Zustand, React Hook Form, Zod
- Tailwind CSS com CSS variables e tokens semanticos
- Vite PWA Plugin
- Vitest, Firebase Rules Unit Testing e Playwright

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
npm run emulators
```

Para `npm run test:rules`, Java precisa estar instalado e disponivel no PATH.

## Firebase

O client Firebase le apenas variaveis `VITE_` e nao contem `firebaseConfig` hardcoded.

Para manter o projeto no plano Spark/free, a Fase 1 cria o perfil e o workspace pessoal diretamente no Firestore, em uma transacao client-side protegida por Security Rules. As rules so permitem criar a propria fundacao em `/users/{uid}`, `/workspaces/personal_{uid}`, `/members/{uid}` e `/workspaceRefs/personal_{uid}` com owner e role fixos.

## Escopo da Fase 1

Implementado: autenticacao, onboarding, workspace pessoal, shell autenticado, dashboard vazio, temas Paper/Sakura/Obsidian/Midnight/Aurora/Rose Gold, modo system, PWA basico e regras iniciais.

Fora desta fase: motor financeiro, cartoes, espaco compartilhado funcional, Stripe/billing, landing completa e dados financeiros persistidos.
