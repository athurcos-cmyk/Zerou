# Bootstrap Firebase + Stripe

Checklist para liberar billing real da Zerou em uma etapa futura. No lancamento atual, a Zerou permanece 100% gratuita e este checklist nao bloqueia o uso do app.

- [ ] Firebase em Blaze com alertas de custo.
- [ ] Cloud Functions v2 habilitado.
- [ ] `STRIPE_SECRET_KEY` no Secret Manager.
- [ ] `STRIPE_WEBHOOK_SECRET` no Secret Manager.
- [ ] `APP_BASE_URL` configurado para o ambiente.
- [ ] Produtos e precos em Stripe Test Mode.
- [ ] Customer Portal configurado no Stripe.
- [ ] `planCatalog/free`, `planCatalog/duo` e `planCatalog/premium` populados.
- [ ] Endpoint HTTP `stripeWebhook` cadastrado no Stripe Dashboard.
- [ ] Webhook testado com evento duplicado.
- [ ] Nova decisao de produto aprovando cobranca ativa.
- [ ] Tela `/app/settings/billing` refletindo assinatura atual.

Nao instalar `stripe/firestore-stripe-payments` nem `@stripe/firestore-stripe-payments`.
