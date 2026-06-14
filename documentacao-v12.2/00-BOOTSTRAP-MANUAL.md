# Zerou v12.2 — Bootstrap manual e scaffold permitido

Este documento separa ações humanas de preparação externa das ações que o Codex pode executar no repositório. Não fingir que recursos externos foram criados.

# 1. Ambientes

Criar primeiro um ambiente de desenvolvimento:

```text
Zerou Dev
Project ID: zerou-dev-[sufixo-unico]
Alias CLI: dev
```

Criar produção apenas antes do lançamento:

```text
Zerou Prod
Project ID: zerou-prod-[sufixo-unico]
Alias CLI: prod
```

Nunca desenvolver diretamente em produção.

# 2. Ações humanas — Firebase Dev

1. Criar projeto Firebase Dev.
2. Registrar app web com nickname `zerou-web-dev`.
3. Criar Cloud Firestore em Native Mode e revisar a região antes de confirmar. Preferir `southamerica-east1` quando adequada.
4. Habilitar Firebase Authentication:
   - Email/password;
   - Google.
5. Criar bucket Storage padrão com regras inicialmente fechadas.
6. Ativar plano Blaze antes de Cloud Functions reais e recursos pagos.
7. Configurar alertas de orçamento.
8. Instalar Firebase CLI e vincular alias `dev`.
9. Inicializar Emulator Suite:
   - Auth Emulator;
   - Firestore Emulator;
   - Functions Emulator;
   - Storage Emulator;
   - Hosting Emulator.

# 3. Ações humanas — Stripe Test Mode

1. Criar ou acessar conta Stripe.
2. Ativar Test Mode durante desenvolvimento.
3. Criar produtos e preços de teste:
   - Duo mensal;
   - Duo anual;
   - Premium mensal;
   - Premium anual.
4. Configurar Customer Portal.
5. Após deploy do endpoint HTTP de webhook, cadastrar o endpoint no Stripe Dashboard.
6. Copiar o webhook signing secret para o secret manager da Functions.
7. Não instalar `stripe/firestore-stripe-payments`.

# 4. Secrets e configuração

Usar secrets server-side para credenciais sensíveis. Nunca commitar segredo.

Variáveis frontend permitidas:

```text
VITE_APP_NAME=Zerou
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_STRIPE_PUBLISHABLE_KEY
VITE_APP_BASE_URL
VITE_BRAND_ASSETS_BASE_PATH=/brand
VITE_ENABLE_ANALYTICS
```

Secrets e variáveis backend:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
APP_BASE_URL
EMAIL_PROVIDER
EMAIL_API_KEY
EMAIL_FROM
PRIVACY_EMAIL
SUPPORT_EMAIL
ENABLE_PIX_AUTOMATIC
ENABLE_FCM
ENABLE_OCR
ENABLE_ANALYTICS
```

IDs configuráveis no catálogo Firestore, não hardcodados na UI:

```text
STRIPE_PRICE_DUO_MONTHLY
STRIPE_PRICE_DUO_ANNUAL
STRIPE_PRICE_PREMIUM_MONTHLY
STRIPE_PRICE_PREMIUM_ANNUAL
```

# 5. O que o Codex pode fazer antes das credenciais

Criar no repositório:

```text
.env.example
.firebaserc.example
firebase.json
firestore.rules
firestore.indexes.json
storage.rules
functions/
scripts/
docs/MANUAL_SETUP_REQUIRED.md
docs/BOOTSTRAP_FIREBASE_STRIPE.md
```

Também pode:

- configurar emuladores;
- validar build local;
- criar adapters;
- criar feature flags;
- mostrar estado explícito `Cobrança indisponível no ambiente atual`;
- escrever testes com mocks locais;
- documentar bloqueios reais.

# 6. Gate antes da integração cloud

O ambiente cloud só está pronto quando ao menos estes valores existirem:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_APP_ID
APP_BASE_URL
```

O billing Stripe só pode ser marcado como ativo quando existirem:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
produtos e preços Stripe de teste
Customer Portal configurado
endpoint webhook cadastrado
```

# 7. App Check

Aplicar gradualmente:

1. scaffold e métricas;
2. monitoramento no ambiente Dev;
3. enforcement em callable Functions sensíveis;
4. enforcement em Firestore e Storage após testes.

# 8. Assets oficiais da marca

Antes de finalizar shell, PWA manifest ou landing page, copiar os arquivos aprovados do pacote `zerou-brand-assets.zip` conforme `BRAND-ASSET-INTEGRATION.md`.

Não gerar logo temporário diferente da identidade aprovada. Quando os arquivos rasterizados ainda não estiverem copiados, usar placeholder textual explícito e registrar o bloqueio em `IMPLEMENTATION_STATUS.md`.
