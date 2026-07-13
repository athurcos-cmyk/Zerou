# Zerou Production Checklist

Do not mark broad public production as ready until every blocking item is complete.

## Legal And Business

- [ ] CNPJ, razao social, endereco and official legal contact filled in legal documents.
- [ ] Terms, Privacy, Cookies and Subprocessors reviewed by legal counsel.
- [ ] Support email and privacy email active on the final domain.
- [ ] Public domain configured and authorized in Firebase Auth.

## Firebase

- [ ] Separate Prod Firebase project created.
- [ ] Auth providers enabled in Prod.
- [ ] Firestore Native Mode region confirmed.
- [ ] Firestore Rules and indexes deployed to Prod.
- [ ] Storage bucket created only when uploads are required.
- [ ] App Check monitored, then enforced.
- [ ] Budget alerts configured.
- [ ] Backup/export and restore tested.

## Vercel

- [ ] Production environment variables `VITE_FIREBASE_*` configured.
- [x] Production URL and canonical URL updated from `zerou-five.vercel.app` to `granativa.com.br` — DNS at registro.br configured, domain authorized in Firebase Auth, `functions` deployed with the new `APP_BASE_URL`. Live end-to-end since 2026-07-12 (Google login confirmed working in production by the owner). `zerou-five.vercel.app` still works as a legacy Vercel URL. See `docs/planning/TODOS.md`.
- [ ] CSP verified against Auth, Firestore, Analytics and PWA.
- [ ] Preview and production deployment policy confirmed.

## Privacy

- [ ] Cookie banner tested for accept, refuse and preference review.
- [ ] Analytics verified not to load before consent.
- [ ] Privacy Center request creation verified against Prod Firestore.
- [ ] Data export manual runbook tested.
- [ ] In-app account deletion tested in production with a disposable account.

## Billing Future

- [ ] Keep app free until a new product decision changes this.
- [ ] If billing is enabled later: Blaze active, Stripe Test Mode verified, products/prices created, secrets configured, webhook deployed and Portal tested.

## Regression

- [ ] Auth login/register/reset/Google.
- [ ] Onboarding creates profile and personal workspace.
- [ ] Personal workspace isolation.
- [ ] Financial transactions and offline pending state.
- [ ] Card invoice partial payment and ledger immutability.
- [ ] Couple invite, claim and settlement with no personal data leak.
- [ ] Billing stays inactive/free in current launch mode.
