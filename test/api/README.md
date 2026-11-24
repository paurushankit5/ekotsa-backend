# API behaviour tests (moved from ekotsa-website)

These HTTP tests exercise backend behaviour (desktop contracts, device concurrency,
commercial/registration protection, admin hardening, CMS scheduler security). They lived in
`ekotsa-website/test` from before the frontend/backend split and were moved here because the
website is now frontend-only.

They talk to a running server over HTTP. Point `BASE_URL` at the backend (`/api/v1` is mounted
on the backend directly) or at the website, which proxies `/api/v1/*` to the backend:

```bash
BASE_URL=http://localhost:4000 node --test test/api/*.test.mjs
```

## Status: not yet green — need porting

When moved (2026-11-24) none of these passed unmodified against the current stack:

| File | Reason |
|---|---|
| `contracts`, `device-concurrency` | `Invalid URL` — helper/fixture setup assumes the old website integration harness |
| `admin-hardening` | needs `INTEGRATION_ADMIN_EMAIL`/`PASSWORD`; admin password login now needs the local demo admin or MFA; some checks (415 content type, origin) were website-era middleware |
| `commercial-workflow` | expected `401`, got `400` (validation runs before auth on one route); self-serve payment is removed |
| `cms-security` | scheduler returns `503` until `CRON_SECRET` is configured (Phase 1) |

Port each file against the backend (fix setup, update expectations to current behaviour), then add
them to `npm test`.
