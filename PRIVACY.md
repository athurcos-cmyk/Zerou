# Zerou Privacy

## Product Principle

Zerou separates personal finance data from couple-shared summaries. Sharing is explicit and does not expose personal accounts, cards or invoice references by default.

## Cookie Consent

Categories:

- Necessary: always active for app operation.
- Preferences: optional product preferences.
- Analytics: optional and blocked until consent.
- Marketing: optional and disabled by default.

Consent is persisted with version `zerou-cookie-v1` in local storage and can be changed from the footer or `/privacy-center`.

## LGPD Request Flow

Authenticated users can create requests at `/privacy-center`. The app writes a document to:

```text
privacyRequests/{requestId}
```

Supported request types:

- `correction`
- `export`
- `deletion`
- `marketing_revocation`
- `cache_help`

Requests are intentionally not auto-fulfilled in this phase. Operations must review, export or delete data manually until a verified automation exists.

## Legal Status

Documents in `docs/legal/` and `/legal/*` are drafts with visible placeholders. They require legal review before broad public launch.
