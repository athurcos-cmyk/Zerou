# Zerou Billing

> ⚠️ **O CODIGO FOI REMOVIDO DO REPO EM 2026-08-08 (decisao do dono).** Este documento continua
> valendo — as decisoes de arquitetura sao o ativo, o codigo era so uma implementacao delas, escrita
> antes de existir qualquer decisao de preco. Recuperar tudo:
>
> ```bash
> git checkout billing-stripe-v0 -- functions/src/billing functions/src/index.ts functions/scripts/seedPlanCatalog.mjs src/billing
> ```
>
> Saiu: `functions/src/billing/` inteiro (11 arquivos), as 5 functions do `index.ts`
> (`createCheckoutSession`, `createCustomerPortalSession`, `stripeWebhook`, `processBillingEvent`,
> `retryFailedBillingEvents`), a dep `stripe`, `src/billing/billingService.ts`, o seed do catalogo e
> os tipos de billing do `src/types/contracts.ts`.
>
> **Ficou**: as regras do Firestore (`billingAccounts`, `planCatalog`, `billingEvents`), a cobertura
> delas em `tests/firestore.rules.test.ts`, e a limpeza de `billingEvents` na exclusao de conta.
> Elas ja liberam por padrao quando nao existe documento — que e o caso de todo mundo hoje — entao
> nao custam nada e remove-las seria risco sem ganho.
>
> **Quando for reativar, conte com revalidar tudo**: a versao da API do Stripe vai ter mudado, os
> precos nao existiam quando esse codigo foi escrito e a parte fiscal brasileira nunca foi tratada.
> A tag economiza o desenho, nao a revisao.
>
> ⚠️ **O codebase de functions continua se chamando `billing`** no `firebase.json` (`functions:billing:*`
> em todo comando de deploy dos docs). O nome ficou historico e **nao deve ser renomeado** — renomear
> codebase ja causou o conflito "More than one codebase claims following functions".

Fase 5 implementa billing customizado sem Firebase Stripe Extension, mas a decisao atual de produto e manter o app 100% gratuito por enquanto.

## Estado atual

- Nao ha checkout, Customer Portal nem pagina de planos — o app e gratuito e nao vende nada.
- `free` libera o uso atual do app, incluindo espaco compartilhado.
- `duo` e `premium` ficam como estrutura tecnica futura (so nas regras e neste documento).
- Firestore Rules continuam bloqueando escrita de billing pelo client.
- A checagem de entitlement que existia em `canCreateCoupleWorkspace` saiu junto: era uma leitura de
  rede a mais pra perguntar uma flag que valia `true` nos tres planos do catalogo.

## Arquitetura

```text
Checkout/Portal callable
Stripe webhook HTTP assinado
billingAccounts/{billingAccountId}
billingAccounts/{billingAccountId}/subscriptions/{subscriptionId}
billingAccounts/{billingAccountId}/billingEvents/{stripeEventId}
planCatalog/{planId}
```

## Setup externo necessario apenas se billing for reativado no futuro

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

Sem secrets/Price IDs, os callables retornam erro seguro. Isso e intencional: o app nao finge checkout ativo.
