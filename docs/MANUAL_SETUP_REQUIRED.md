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
- O lancamento atual roda gratuito e sem checkout ativo para usuarios.
- Cloud Functions de billing continuam como scaffold futuro e nao sao obrigatorias para usar o app agora.
- Apos criar o bucket Storage, executar `npx firebase-tools deploy --only storage --project zerou-26757`.

## Antes de producao publica ampla

- Revisar `docs/PRODUCTION_CHECKLIST.md`.
- Substituir placeholders legais em `docs/legal/`.
- Confirmar emails oficiais de suporte e privacidade.
- Corrigir Java local para rodar `npm run test:rules`.
- Configurar App Check, backups, alertas e dominio final.
