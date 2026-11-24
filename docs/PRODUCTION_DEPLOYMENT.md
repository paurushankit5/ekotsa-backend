# Production deployment checklist

Checklist for taking Ekotsa live. Hosting (decided 2026-11-25; named in the Privacy Policy):

| Role | URL | Runs | Host |
|---|---|---|---|
| Public website | `https://www.ekotsa.com` | ekotsa-website (Next.js) | Vercel, region `bom1` (Mumbai) — `vercel.json` |
| Admin panel | `https://admin.ekotsa.com` | same ekotsa-website deployment | Vercel (same project, second domain) |
| API | `https://api.ekotsa.com` | ekotsa-backend (Express) | Render, region Singapore — `render.yaml` |
| Database | — | Neon Postgres | AWS ap-southeast-1 (Singapore) |

If you ever change host, update the provider table in the website's Privacy Policy first.

### Vercel (website)
1. Import the `ekotsa-website` repo; framework Next.js (auto). `vercel.json` pins functions to Mumbai.
2. Add domains `www.ekotsa.com`, `admin.ekotsa.com`, and `ekotsa.com` (redirect → www).
3. Environment variables: from `.env.production.example` (no backend secrets).
4. Accept Vercel's DPA (Vercel dashboard → Settings → Legal) — the Privacy Policy lists Vercel as a processor.

### Render (API)
1. New → Blueprint → select the `ekotsa-backend` repo; Render reads `render.yaml` (Singapore, health check,
   migrations run before each deploy via `preDeployCommand`).
2. Fill every `sync: false` secret in the dashboard (values from section 1 and `.env.production.example`).
3. Custom domain `api.ekotsa.com` (CNAME as Render shows). Accept Render's DPA.
4. Log retention: the Privacy Policy keeps security logs for 2 years. Render/Vercel keep request logs only for a
   short period, so add a log stream (Render → Log Streams; Vercel → Log Drains) to a store with ≥1-year
   retention, or rely on the database `audit_logs` table and record this decision (see lawyer item B7).

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
5. Analytics (PostHog EU, consent-only): create a project at https://eu.posthog.com, put its project key in
   `NEXT_PUBLIC_POSTHOG_KEY` (`NEXT_PUBLIC_ANALYTICS_PROVIDER=posthog`, host `https://eu.i.posthog.com`).
   In PostHog project settings: enable **Discard client IP data**, set data retention to **12 months**,
   keep session replay off. Accept PostHog's DPA. (The Privacy and Cookie policies promise these settings.)
   Leaving the key empty keeps analytics off.

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
expiry reminders and the privacy retention job (`/api/v1/internal/privacy/purge`). That job applies the
Privacy Policy retention schedule — under-18 submissions without guardian approval (7 days), enquiries (24
months), download registrations/history (36 months), expired codes, old email logs (24 months), security
logs (2 years), inactive customer accounts (3 years → email notice → erased 7 days later; accounts with
licence or payment records in the last 8 years are kept) — and emails the Grievance Officer a digest of
privacy requests due within 7 days or overdue. Send `{"dryRun":true}` to see counts without deleting. If the host has its own scheduler, call the same endpoints with header
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
- [ ] **Real client IPs reach the API through the Vercel proxy.** Requests from the website pass Vercel → Render.
      Check `SELECT key FROM rate_limit_counters ORDER BY "resetAt" DESC LIMIT 5;` after a few logins from two
      different networks: keys must show the visitors' IPs, not one shared Vercel IP. If they show Vercel's IP,
      every visitor shares one rate limit — fix before launch (adjust `TRUST_PROXY_HOPS` or forward the client IP).
- [ ] Privacy request form → confirmation email arrives → request appears in Admin → Privacy requests
- [ ] `POST /api/v1/internal/privacy/purge` with `{"dryRun":true}` and the cron token returns counts

## 11. Clean-up after go-live

- Delete development/test data if the dev database is reused (QA accounts `qa-test-*@example.com`,
  `demo-admin@ekotsa.test` via `npx tsx scripts/demo-admin.ts delete`).
- Delete `D:\Ekotsa\_env-backups\` once the new configuration is confirmed (contains secrets).
- Rotate any secret that was ever stored in the website repo's `.env.local`
  (Gmail app password, Google client secret of the old website OAuth client).
