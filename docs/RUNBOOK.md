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
