# Zerou Privacy

## Product Principle

Zerou separates personal finance data from couple-shared summaries. Sharing is explicit and does not expose personal accounts, cards or invoice references by default.

## Public Legal Pages

The public legal surface is intentionally small:

- `/legal/terms`
- `/legal/privacy`

Legacy routes `/legal/cookies` and `/legal/subprocessors` redirect to `/legal/privacy`. Cookies, local storage and technical providers are covered inside the privacy policy instead of separate public pages.

## Local Storage And Analytics

The app uses necessary browser storage such as `localStorage`, IndexedDB, PWA cache and Firebase Auth mechanisms for login, preferences, mobile operation and security.

Analytics stays disabled by default and must only be enabled with an explicit product decision and consent flow when required.

## Data Rights

LGPD rights are described in the privacy policy. The current Privacy page is informational and does not expose request buttons for marketing revocation, export, deletion or local cache cleanup.

Account deletion should live inside authenticated settings with explicit confirmation when the verified automation is ready.
