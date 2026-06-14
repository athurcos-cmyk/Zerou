# Setup manual pendente

Estas ações dependem do dono do projeto e não foram simuladas no repositório.

## Firebase Dev

- Projeto Firebase real identificado: `zerou-26757`.
- Registrar app web `zerou-web-dev`.
- Habilitar Authentication com Email/Senha e Google.
- Em Authentication -> Settings -> Authorized domains, adicionar o domínio final de produção.
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
- Definir as mesmas variáveis `VITE_FIREBASE_*` no ambiente da Vercel.
- Firestore rules/indexes já foram publicados em `zerou-26757`.
- Deploy de Functions v2 exige upgrade do Firebase para o plano Blaze, porque o Google precisa habilitar Cloud Functions, Cloud Build e Artifact Registry.
- Após upgrade para Blaze, executar `npx firebase-tools deploy --only functions --project zerou-26757`.
- Após criar o bucket Storage, executar `npx firebase-tools deploy --only storage --project zerou-26757`.

## Fases futuras

- Stripe/billing, espaço compartilhado, motor financeiro e landing jurídica pertencem às próximas fases.
