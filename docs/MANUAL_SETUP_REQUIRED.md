# Setup manual pendente

Estas acoes dependem do dono do projeto e nao foram simuladas no repositorio.

## Firebase Dev

- Projeto Firebase real identificado: `zerou-26757`.
- Registrar app web `zerou-web-dev`.
- Habilitar Authentication com Email/Senha e Google.
- Em Authentication -> Settings -> Authorized domains, adicionar o dominio final de producao.
- Cloud Firestore em Native Mode criado e com rules/indexes publicados.
- Criar bucket Storage em Firebase Console -> Storage -> Get Started.
- Configurar alias Firebase CLI a partir de `.firebaserc.example`.
- Preencher `.env.local` com as chaves reais.
- Manter `.env.local` fora do Git.

## Emuladores

- Instalar Java no PATH para rodar `npm run test:rules` e `npm run emulators`.
- Instalar Firebase CLI globalmente ou usar o `firebase-tools` local instalado pelo projeto.

## Deploy

- Configurar o projeto na Vercel apontando para a raiz.
- Definir as mesmas variaveis `VITE_FIREBASE_*` no ambiente da Vercel.
- Firestore rules/indexes ja foram publicados em `zerou-26757`.
- A Fase 1 roda sem Cloud Functions para permanecer compativel com o plano Spark/free.
- Apos criar o bucket Storage, executar `npx firebase-tools deploy --only storage --project zerou-26757`.

## Fases futuras

- Stripe/billing, espaco compartilhado, motor financeiro e landing juridica pertencem as proximas fases.
