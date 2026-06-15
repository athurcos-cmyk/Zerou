# Zerou Security

## Controls Implemented

- Firebase Auth protects private routes.
- Firestore Security Rules enforce user ownership, active membership and workspace boundaries.
- Client cannot write `billingAccounts`, `billingEvents`, plan catalog or protected invoice aggregates.
- Couple workspace sharing stores summary-only claims and blocks personal source references.
- Cookie consent blocks optional Analytics until explicit opt-in.
- Vercel headers include `nosniff`, `Referrer-Policy`, CSP and noindex for private app routes.
- Logout can clear local Firestore persistence for shared devices.

## Known Gaps Before Public Production

- App Check is scaffolded conceptually but not enforced.
- Legal documents need professional review.
- Backup and restore process must be tested against a production-like Firebase project.
- Alerting and budget notifications must be configured in Firebase/GCP.
- Storage bucket remains pending until an upload feature is active.
- Firestore emulator tests currently depend on a working local Java installation.

## Incident Response

1. Pause public marketing or invite distribution.
2. Preserve logs from Vercel, Firebase Auth, Firestore and Functions if enabled.
3. Rotate exposed secrets in Firebase/Vercel/GitHub immediately.
4. Publish emergency Firestore Rules if a data boundary is affected.
5. Notify affected users using the email adapter only after a real provider is configured.
6. Record timeline, scope, mitigation and follow-up tasks.

## Secret Handling

Never commit `.env.local`, service account JSON, Stripe secrets or Firebase Admin keys. Frontend may only use `VITE_` Firebase public config values.
