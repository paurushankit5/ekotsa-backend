# Production deployment checklist

Host-agnostic checklist for taking Ekotsa live. Domains:

| Role | URL | Runs |
|---|---|---|
| Public website | `https://www.ekotsa.com` | ekotsa-website (Next.js) |
| Admin panel | `https://admin.ekotsa.com` | same ekotsa-website deployment |
| API | `https://api.ekotsa.com` | ekotsa-backend (Express) |

`https://ekotsa.com` (apex) should redirect permanently to `https://www.ekotsa.com`.

The website is frontend-only: it proxies `/api/v1/*` to the API and verifies sessions with the API's
public keys (`/api/v1/auth/jwks`). All secrets live in the backend.

---

## 1. Generate production secrets and keys (once, on a trusted machine)

Never reuse development values.

```bash
cd ekotsa-backend
# Run 4 times — JWT_SECRET, OTP_PEPPER, DEVICE_TOKEN_PEPPER, CRON_SECRET (all different):
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
npm run keys:auth      # AUTH_JWT_KEY_ID + AUTH_JWT_PRIVATE_KEY (session signing)
npm run keys:license   # LICENSE_SIGNING_PRIVATE_KEY + LICENSE_SIGNING_PUBLIC_KEY
```

Store them in the backend host's secret manager. Keep an offline backup of the licence private key —
if it is lost, every installed desktop app must be rebuilt with a new public key.

## 2. Database (Neon)

- Use a dedicated production database/branch (not the development one).
- `DATABASE_URL` with `sslmode=require`.
- Run migrations before the first start and on every deploy that adds one:

  ```bash
  DATABASE_URL=... npm run db:migrate:status
  DATABASE_URL=... npm run db:migrate
  ```

  Current migrations include `admin_handoff_codes` and `rate_limit_counters` (used for rate limiting).

## 3. Backend (api.ekotsa.com)

1. Configure every variable in `.env.production.example`.
2. Validate: `npm run check:env:production -- --env-file=<your prod env file>` → must print `PASS`.
   (The server also refuses to start in production when a check fails.)
3. Build and start: `npm ci && npm run build && npm start`.
4. Set `TRUST_PROXY_HOPS` to the number of proxies/load balancers in front of the app (usually `1`).
5. Health check: `GET https://api.ekotsa.com/v1/health` → `{"ok":true, ... "database":"up"}`.
6. Public keys: `GET https://api.ekotsa.com/api/v1/auth/jwks` → one ES256 key, no `d` field.

## 4. Website (www.ekotsa.com + admin.ekotsa.com)

1. Configure the variables in `ekotsa-website/.env.production.example`
   (`EKOTSA_BACKEND_URL=https://api.ekotsa.com`, `APP_BASE_URL`, `ADMIN_HOST`, cookie names).
   **No backend secrets** — the check fails if any are present.
2. Validate: `npm run check:env:production -- --check-backend` → `PASS`.
3. Point both `www.ekotsa.com` and `admin.ekotsa.com` at the same deployment.
4. Leave `DOWNLOAD_ALLOW_UNSIGNED` unset unless shipping unsigned installers is a deliberate decision.

## 5. Google Cloud Console (OAuth client used by the backend)

- Authorized redirect URI: `https://www.ekotsa.com/api/v1/oauth/google/callback`
- Authorized JavaScript origins: `https://www.ekotsa.com`, `https://admin.ekotsa.com`
- Put the client ID/secret in the backend env (`GOOGLE_OAUTH_CLIENT_ID/SECRET`).

## 6. Email (SMTP)

- Backend `SMTP_*` variables (currently Gmail `smtp.gmail.com:587` with an app password for
  `admin@ekotsa.com`). Gmail limits ~500 recipients/day; move to a transactional provider if volume grows.
- Add SPF/DKIM/DMARC DNS records for `ekotsa.com` so codes don't land in spam.

## 7. Cloudflare R2 (installers)

- Production bucket (e.g. `ekotsa-downloads`) and an API token with Object Read & Write.
- Bucket CORS: allow `PUT`, `GET` from `https://admin.ekotsa.com` (admins upload installers from the browser).
- Optional custom domain → `R2_PUBLIC_BASE_URL` (also set it on the website for the CSP).

## 8. Scheduled jobs

`.github/workflows/scheduled-jobs.yml` (this repo) calls the internal job endpoints. Add repository
secrets:

- `EKOTSA_API_BASE` = `https://api.ekotsa.com`
- `CRON_SECRET` = the backend's `CRON_SECRET`

Jobs: every 10 min — notifications outbox + scheduled CMS publishing; daily 03:30 UTC — licence
expiry reminders. If the host has its own scheduler, call the same endpoints with header
`x-cron-token: <CRON_SECRET>` instead.

## 9. Desktop app (Ekotsa Atithi) release build

Set at **build time** (baked into the release binary):

```
HM_BUILD_LICENSE_API_BASE=https://api.ekotsa.com
HM_BUILD_AUTH_PORTAL_BASE=https://www.ekotsa.com
HM_BUILD_LICENSE_KEY_ID=<LICENSE_SIGNING_KEY_ID>
HM_BUILD_LICENSE_PUBLIC_KEYS_JSON={"<LICENSE_SIGNING_KEY_ID>":"<LICENSE_SIGNING_PUBLIC_KEY>"}
HM_BUILD_DESKTOP_CALLBACK_BASE=hotel-manager://auth/callback
```

The public key must be the pair of the backend's `LICENSE_SIGNING_PRIVATE_KEY`. Then upload the
**signed** installer via Admin → Releases (the current releases are 12-byte placeholders).

## 10. Go-live smoke test

- [ ] `www.ekotsa.com` pages load; `ekotsa.com` redirects to www
- [ ] Sign up + log in (customer) → `/dashboard`
- [ ] Forgot password → OTP email arrives
- [ ] Contact form → notification email arrives at `SMTP_TO`
- [ ] `/download` → register → installer downloads (signed)
- [ ] Admin: Continue with Google (admin account) → `admin.ekotsa.com` dashboard
- [ ] Desktop app: sign in, activate device, licence issued and verified
- [ ] GitHub Actions "Scheduled jobs" run green
- [ ] Repeated login attempts hit `429` (rate limiting works)

## 11. Clean-up after go-live

- Delete development/test data if the dev database is reused (QA accounts `qa-test-*@example.com`,
  `demo-admin@ekotsa.test` via `npx tsx scripts/demo-admin.ts delete`).
- Delete `D:\Ekotsa\_env-backups\` once the new configuration is confirmed (contains secrets).
- Rotate any secret that was ever stored in the website repo's `.env.local`
  (Gmail app password, Google client secret of the old website OAuth client).
