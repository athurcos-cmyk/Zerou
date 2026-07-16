# Zerou Runbook

## Local Development

```bash
npm install
npm run dev
```

Required local file:

```text
.env.local
```

Do not commit `.env.local`.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run functions:build
npm run test:functions
npm run test:rules
```

`npm run test:rules` requires Java available in PATH.

## Deploy

Frontend deploy is handled by Vercel from `main`.

Firestore rules and indexes:

```bash
npx firebase deploy --only firestore:rules,firestore:indexes --project zerou-26757
```

Storage rules after bucket creation:

```bash
npx firebase deploy --only storage --project zerou-26757
```

Cloud Functions (`functions/src/`):

```bash
npx firebase deploy --only functions:billing --project zerou-26757
# ou uma função específica: --only functions:billing:whatsappWebhook
```

**`git push` NÃO reimplanta Cloud Functions.** Só existe uma forma de colocar código de `functions/src/` no ar: rodar o `firebase deploy` acima manualmente — não há CI/CD configurado. Editar `buildFinancialContext.ts`, `webhookHandler.ts`, `automation.ts` etc., rodar testes localmente, commitar e dar push deixa tudo verde (typecheck, testes, GitHub) enquanto a função **continua rodando a versão antiga** em produção — foi exatamente isso que aconteceu em 2026-07-16 (a correção do bug "Grazi sempre reporta R$0,00 de fatura" ficou pronta e commitada, mas só foi ao ar horas depois, num deploy manual separado, porque o passo de deploy anterior tinha acontecido ANTES da correção existir). Sempre que mexer em qualquer arquivo de `functions/src/`, o deploy é parte da entrega — não termina no commit.

Depois de todo deploy que toca `whatsappWebhook`, reaplicar (Cloud Run reseta a cada deploy):

```bash
gcloud run services update whatsappwebhook --region=southamerica-east1 --no-cpu-throttling --project=zerou-26757
```

## Ver logs de produção (Cloud Functions)

`gcloud` (Google Cloud CLI) já autenticado nesta máquina. Duas formas, conforme o nível de detalhe:

```bash
# Visão rápida — timeline resumida, boa pra ver se teve erro
gcloud functions logs read <nomeDaFunction> --region=southamerica-east1 --project=zerou-26757 --limit=100

# Só erros
gcloud functions logs read <nomeDaFunction> --region=southamerica-east1 --project=zerou-26757 --limit=300 --min-log-level=error
```

Pra ver o **payload estruturado completo** de cada execução (ex.: o texto exato de uma mensagem de WhatsApp, gravado via `logger.info('whatsapp_message_received', { phone, text })` no código) — `gcloud functions logs read` corta esses campos. Usar Cloud Logging direto:

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="<nomeDaFunction>" AND timestamp>="2026-07-16T11:00:00Z" AND timestamp<="2026-07-16T12:00:00Z"' \
  --project=zerou-26757 --format=json --limit=200
```

(Cloud Functions 2ª geração roda em cima de Cloud Run — por isso `resource.type="cloud_run_revision"` e `service_name` = nome da function em minúsculas.) Filtrar por `labels.execution_id="<id>"` isola uma execução específica. Usado em 2026-07-16 pra confirmar que uma mensagem de teste do WhatsApp ("Cria uma categoria chamada trabalho") tinha sido processada corretamente, sem precisar de acesso nenhum ao Firestore.

**Nunca redirecionar output de comando com token/segredo pra arquivo ou printar em texto puro** — `gcloud auth application-default print-access-token` e afins ficam de fora dessas consultas.

## Rollback

1. Revert or fix forward on `main`.
2. Push to GitHub so Vercel redeploys.
3. If rules caused the incident, deploy the last known good `firestore.rules`.
4. Verify `/`, `/login`, `/register`, `/app` and a logged-in workflow.

## Billing Event Reprocess

Billing Functions are scaffolded but not active in free launch mode. When Blaze, Stripe secrets and webhook are enabled, failed billing events can be retried by the scheduled Function or by updating the event status under the server-only billing event document.

## Privacy Requests

1. Review `privacyRequests/{requestId}`.
2. Confirm requester identity through Firebase Auth data.
3. Export, correct or delete data manually until automation is built.
4. Mark completion in an internal ops tracker. Client-side updates to request status are intentionally blocked.

## Backups And Alerts

Before public production:

- Enable Firebase/GCP budget alerts.
- Configure Firestore backup/export routine.
- Test restore into a separate Firebase project.
- Monitor Vercel deploy status and Firebase error logs.
