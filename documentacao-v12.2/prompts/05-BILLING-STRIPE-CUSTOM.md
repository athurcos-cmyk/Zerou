# Instruções operacionais obrigatórias

Você está trabalhando no repositório do **Zerou**. Execute somente a fase descrita neste arquivo.

Leia antes de editar:

1. `ZEROU-V12.2-ESPECIFICACAO-MESTRA.md`;
2. `CONTRATOS-CANONICOS.md`;
3. `BRAND-GUIDELINES.md`;
4. `THEME-SYSTEM.md`;
5. `PRODUCT-COPY-CANONICAL.md`;
6. `IMPLEMENTATION_STATUS.md`;
7. arquivos existentes do repositório;
8. `00-BOOTSTRAP-MANUAL.md` quando houver dependência externa.

Regras:

- não antecipar funcionalidades de fases futuras;
- não fingir que criou recurso externo;
- não substituir funcionalidade por mock permanente;
- não remover comportamento previamente validado;
- manter TypeScript strict;
- persistir dinheiro como inteiros em centavos;
- nunca confiar em autorização, plano ou entitlement enviados pelo frontend;
- usar **Zerou** como nome exibido ao usuário e nunca reintroduzir o nome provisório anterior;
- seguir a identidade de `BRAND-GUIDELINES.md` em toda superfície visual criada nesta fase;
- seguir `THEME-SYSTEM.md`: não hardcodar cores em componentes da interface autenticada e consumir somente tokens semânticos;
- corrigir erros encontrados dentro do escopo atual;
- atualizar `IMPLEMENTATION_STATUS.md` ao final;
- parar ao concluir o gate desta fase.


# Fase 5 — Billing Stripe customizado

## Pré-condição

Fases 1 a 4 concluídas. Ler também `REFERENCIAS-OFICIAIS.md` e conferir documentação atual da Stripe e Firebase antes de integrar.

## Objetivo

Implementar cobrança SaaS sem Firebase Stripe Extension: catálogo, billing account, Checkout, Customer Portal, webhook HTTP assinado, processamento idempotente e entitlements server-side.

## Decisão obrigatória

Não instalar nem usar:

```text
stripe/firestore-stripe-payments
@stripe/firestore-stripe-payments
```

A fonte de verdade interna é o conjunto de registros server-side do Zerou sincronizados com Stripe por adapter próprio.

## Escopo permitido

### Estrutura sugerida

```text
functions/src/billing/
  billingProvider.ts
  stripeBillingProvider.ts
  planCatalog.ts
  entitlements.ts
  createCheckoutSession.ts
  createCustomerPortalSession.ts
  stripeWebhook.ts
  billingEventProcessor.ts
  retryFailedBillingEvents.ts
  webhookHandlers/
    onCheckoutSessionCompleted.ts
    onSubscriptionCreated.ts
    onSubscriptionUpdated.ts
    onSubscriptionDeleted.ts
    onInvoicePaid.ts
    onInvoicePaymentFailed.ts
    onInvoicePaymentActionRequired.ts
```

### Catálogo

Implementar `planCatalog/{planId}` com:

```text
free
duo
premium
```

Preços e Price IDs configuráveis no Firestore/admin script. Nunca hardcodar preço como autoridade na UI.

### Billing account

Implementar:

```text
/billingAccounts/{billingAccountId}
/billingAccounts/{billingAccountId}/subscriptions/{subscriptionId}
/billingAccounts/{billingAccountId}/billingEvents/{stripeEventId}
```

Criar customer Stripe server-side quando necessário e persistir somente identificadores necessários.

### Checkout callable

Implementar callable autenticada e protegida:

```text
createCheckoutSession()
```

Requisitos:

- auth obrigatória;
- App Check quando enforcement estiver ativo;
- validar `planId` e intervalo no backend;
- buscar Price ID no catálogo server-side;
- criar ou reutilizar Stripe Customer;
- aplicar chave de idempotência adequada;
- retornar URL Checkout;
- não confiar em preço do frontend.

### Customer Portal callable

Implementar:

```text
createCustomerPortalSession()
```

Requisitos:

- auth obrigatória;
- customer pertencente ao usuário autenticado;
- URL de retorno segura;
- App Check quando enforcement estiver ativo.

### Webhook HTTP

Implementar como HTTP `onRequest`, não callable:

```text
stripeWebhook
```

Fluxo obrigatório:

```text
receber req.rawBody
→ ler header stripe-signature
→ validar assinatura com stripe.webhooks.constructEvent
→ criar billingEvents/{event.id} de forma idempotente
→ responder 2xx rapidamente
→ processar de forma assíncrona
```

Não executar lógica longa, chamadas externas ou emails dentro de callback de transação Firestore.

### Processamento assíncrono

Implementar processador idempotente disparado por documento recebido ou mecanismo equivalente durável.

Requisitos:

- claim/lock de processamento seguro;
- status `received`, `processing`, `processed`, `failed`, `ignored`;
- contador de tentativas;
- erro redigido;
- retry agendado para eventos falhos ou presos;
- tolerar duplicação;
- tolerar eventos fora de ordem;
- buscar estado atual da subscription na Stripe quando necessário;
- recalcular entitlements server-side;
- não executar efeito colateral duplicado.

### Eventos mínimos

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
invoice.payment_action_required
```

Eventos não necessários devem ser marcados como `ignored`, sem falhar silenciosamente.

### Entitlements

Implementar serviço central:

```text
getEntitlementsForUser(userId)
getEntitlementsForWorkspace(workspaceId)
assertEntitlement(...)
```

Aplicação:

- plano pessoal do usuário controla seu workspace pessoal;
- plano do owner controla recursos do workspace casal;
- partner usa recursos habilitados dentro do casal;
- partner não recebe Premium no pessoal;
- downgrade bloqueia criação de novos recursos premium;
- dados existentes não devem ser apagados automaticamente.

### UI

Implementar:

```text
/pricing
/app/settings/billing
```

Exibir estado real:

- free;
- trialing;
- active;
- past_due;
- paused;
- cancelled;
- expired;
- billing indisponível no ambiente atual.

## Fora do escopo

Não implementar:

- Pix Automático ativo sem validação;
- boleto sem desenho comercial;
- cupom avançado;
- admin completo;
- landing 3D.

## Testes obrigatórios

### Adapter e callables

- checkout plano Duo mensal;
- checkout Premium anual;
- plano inválido falha;
- preço enviado pelo frontend é ignorado;
- usuário não autenticado falha;
- portal retorna URL somente para customer correto;
- idempotency key evita sessão duplicada quando aplicável.

### Webhook

- assinatura válida aceita;
- assinatura inválida rejeita;
- evento duplicado não duplica efeito;
- evento desconhecido vira `ignored`;
- retry de processamento falho;
- evento preso volta para fila;
- subscription atualizada fora de ordem termina com estado atual correto;
- erro é registrado sem segredo.

### Entitlements

- free não cria couple workspace quando política exigir Duo;
- Duo cria couple workspace;
- plano do owner habilita casal;
- parceiro não recebe Premium no pessoal;
- downgrade bloqueia recurso premium novo;
- frontend não consegue elevar entitlement.

### E2E test mode

- abrir Checkout em Test Mode;
- completar assinatura de teste;
- receber webhook;
- atualizar tela de billing;
- liberar entitlement correto;
- abrir Portal;
- cancelar ou alterar assinatura em teste;
- refletir novo estado.

Quando credenciais cloud não existirem, implementar testes locais/mocks e marcar E2E cloud como bloqueado em `IMPLEMENTATION_STATUS.md`. Não fingir sucesso.

## Gate de qualidade

```text
checkout em Test Mode funciona quando ambiente está configurado;
webhook assinado é persistido uma vez;
evento duplicado não duplica efeito;
entitlements server-side refletem assinatura e regra do owner do workspace casal.
```

## Entrega

Executar testes disponíveis, corrigir, documentar bloqueios externos reais, atualizar `IMPLEMENTATION_STATUS.md` e parar.
