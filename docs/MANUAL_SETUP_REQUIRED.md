# Setup manual pendente

Estas ações dependem do dono do projeto e não foram simuladas no repositório.

## Firebase Dev

- Criar projeto Firebase Dev.
- Registrar app web `zerou-web-dev`.
- Habilitar Authentication com Email/Senha e Google.
- Criar Cloud Firestore em Native Mode.
- Criar bucket Storage.
- Configurar alias Firebase CLI a partir de `.firebaserc.example`.
- Preencher `.env.local` com as chaves reais.
- Manter `.env.local` fora do Git.

## Emuladores

- Instalar Java no PATH para rodar `npm run test:rules` e `npm run emulators`.
- Instalar Firebase CLI globalmente ou usar o `firebase-tools` local instalado pelo projeto.

## Deploy

- Configurar o projeto na Vercel apontando para a raiz.
- Definir as mesmas variáveis `VITE_FIREBASE_*` no ambiente da Vercel.
- Deploy de Functions exige projeto Firebase real e plano compatível.

## Fases futuras

- Stripe/billing, espaço compartilhado, motor financeiro e landing jurídica pertencem às próximas fases.
