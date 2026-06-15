# Zerou Billing

Fase 5 implementa billing customizado sem Firebase Stripe Extension.

## Arquitetura

```text
Checkout/Portal callable
Stripe webhook HTTP assinado
billingAccounts/{billingAccountId}
billingAccounts/{billingAccountId}/subscriptions/{subscriptionId}
billingAccounts/{billingAccountId}/billingEvents/{stripeEventId}
planCatalog/{planId}
```

## Setup externo necessario

1. Ativar plano Blaze no Firebase antes de publicar Functions.
2. Configurar secrets:

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

3. Configurar `APP_BASE_URL`.
4. Criar produtos/precos Stripe Test Mode:

```text
Duo mensal
Duo anual
Premium mensal
Premium anual
```

5. Popular `planCatalog`:

```bash
cd functions
set STRIPE_PRICE_DUO_MONTHLY=price_...
set STRIPE_PRICE_DUO_ANNUAL=price_...
set STRIPE_PRICE_PREMIUM_MONTHLY=price_...
set STRIPE_PRICE_PREMIUM_ANNUAL=price_...
npm run seed:plan-catalog
```

6. Publicar Functions e cadastrar o endpoint `stripeWebhook` no Stripe Dashboard.

## Estado sem credenciais

Sem secrets/Price IDs, a UI mostra cobrança indisponivel e os callables retornam erro seguro. Isso e intencional: o app nao finge checkout ativo.

