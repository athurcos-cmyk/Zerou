# Zerou

Controle individual. Organização a dois.

Fundação React/TypeScript/Firebase da Fase 1 do Zerou v12.2.

## Stack

- React + TypeScript strict + Vite
- Firebase Web SDK: App, Auth, Firestore, Functions, Storage e Analytics opcional
- Firebase Functions v2 em TypeScript
- React Router, Zustand, React Hook Form, Zod
- Tailwind CSS com CSS variables e tokens semânticos
- Vite PWA Plugin
- Vitest, Firebase Rules Unit Testing e Playwright

## Setup local

1. Instale Node.js 22 ou superior.
2. Copie `.env.example` para `.env.local`.
3. Preencha `.env.local` com a configuração real do app web Firebase.
4. Instale dependências:

```bash
npm install
npm install --prefix functions
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

Para `npm run test:rules`, Java precisa estar instalado e disponível no PATH.

## Firebase

O client Firebase lê apenas variáveis `VITE_` e não contém `firebaseConfig` hardcoded. As callable Functions da fase são:

- `ensureUserProfile`
- `ensurePersonalWorkspace`

Elas criam perfil e workspace pessoal de forma idempotente no backend.

## Escopo da Fase 1

Implementado: autenticação, onboarding, workspace pessoal, shell autenticado, dashboard vazio, temas Paper/Sakura/Obsidian/Midnight/Aurora/Rose Gold, modo system, PWA básico e regras iniciais.

Fora desta fase: motor financeiro, cartões, espaço compartilhado funcional, Stripe/billing, landing completa e dados financeiros persistidos.
