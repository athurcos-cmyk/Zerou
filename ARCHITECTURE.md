# Zerou Architecture

Zerou is a React, TypeScript, Vite and Firebase PWA for personal and couple finance organization.

## Current Runtime

- Frontend: React Router SPA deployed on Vercel.
- Auth: Firebase Auth with Email/Password and Google.
- Data: Cloud Firestore with client-side writes constrained by Security Rules.
- Storage: configured with closed rules until a feature needs uploads.
- Functions: Stripe billing scaffold exists, but is not deployed as an active paid path while the product is free.
- PWA: Vite PWA service worker with auto-update and no-cache headers for `sw.js` and Workbox assets.

## Data Boundaries

- Personal workspaces store accounts, transactions, bills, recurring rules, cards, invoices and ledger.
- Couple workspaces store only shared summaries: claims, splits, settlements, comments and audit logs.
- Personal account/card/invoice references do not enter shared claims.
- Theme preference belongs to `/users/{uid}` and is not shared with a partner.

## Launch Mode

The app is 100% free for now. Billing documents and Functions remain as future infrastructure. Firestore Rules allow couple workspace creation in free launch mode while still blocking client writes to billing accounts and Stripe event collections.

## Environments

Recommended setup:

- Dev Firebase project for day-to-day work.
- Prod Firebase project only before public launch.
- Vercel preview and production may point to the same app during early private use, but production readiness requires the checklist in `docs/PRODUCTION_CHECKLIST.md`.
