# Website → Backend Cutover Plan

Make **`ekotsa-website` a frontend** (marketing + admin UI + CMS) and **`ekotsa-backend` the only commercial API**.

Today the website still owns ~80 `/api/v1/*` route handlers (Prisma + business logic). Waves A–F already exist on Express. This plan flips traffic so those handlers stop being the source of truth.

```
Browser / Atithi
      │
      │  /api/v1/*  (same URLs clients already use)
      ▼
ekotsa-website (Next)
      │  rewrite / proxy  (Phase 1–2)
      ▼
ekotsa-backend (/v1 + /api/v1)
      │
      ▼
PostgreSQL (+ local/S3 object storage)
```

CMS stays in Next (Wave G deferred). See [WAVE_E_F.md](./WAVE_E_F.md) and [MIGRATION_PLAN.md](./MIGRATION_PLAN.md).

---

## 1. Target ownership

| Concern | Owner after cutover |
|---------|---------------------|
| Auth, devices, licenses, downloads, releases | **backend** |
| Orgs, registrations, payments, storage | **backend** |
| Recovery, portal, admin ops, contact, notifications | **backend** |
| Marketing pages, dashboard UI, admin UI shells | **website** |
| CMS editorial (articles/pages/menus/preview) | **website** (for now) |
| Cron for license-expiry emails | **backend** |
| Cron for CMS schedules | **website** |

Rule of thumb: if it mutates commercial state or serves Atithi contracts, it belongs on the backend.

---

## 2. Prerequisites (do before flipping traffic)

1. **Same Postgres** — `DATABASE_URL` on backend = website Prisma DB (or migrate data once; no dual-write).
2. **Shared secrets** — identical values for:
   - `JWT_SECRET`, `AUTH_COOKIE_NAME`
   - `DEVICE_TOKEN_PEPPER` / OTP pepper
   - `LICENSE_SIGNING_*`
   - `CRON_SECRET` (notifications)
3. **Cookie domain** — session cookie must be readable by both hosts if FE and API split domains; prefer:
   - same-site reverse proxy (`api.ekotsa.com` → backend, `ekotsa.com` → Next), **or**
   - keep browser calls on `ekotsa.com/api/v1/*` and rewrite server-side to backend (recommended Phase 1).
4. **CORS** — backend `CORS_ORIGINS` includes website + admin origins; `credentials: true`.
5. **Contract smoke** — run website contract tests / manual Atithi activate→refresh against backend `/api/v1`.
6. **Path aliases** — website auth paths are flat (`/api/v1/login`); backend uses `/v1/auth/login`. Add backend aliases **or** rewrite map (see §4).

---

## 3. Cutover mechanism (recommended)

### Phase 1 — Transparent proxy (no client changes)

In `ekotsa-website`:

1. Add env:
   ```bash
   EKOTSA_BACKEND_URL=http://localhost:4000   # prod: https://api.ekotsa.com
   EKOTSA_API_PROXY_MODE=rewrite              # rewrite | off
   ```
2. Add Next **rewrites** (or a single catch-all proxy route) for migrated prefixes:

   ```ts
   // next.config — conceptual
   async rewrites() {
     const backend = process.env.EKOTSA_BACKEND_URL;
     if (!backend || process.env.EKOTSA_API_PROXY_MODE === "off") return [];
     return [
       { source: "/api/v1/licenses/:path*", destination: `${backend}/api/v1/licenses/:path*` },
       { source: "/api/v1/devices/:path*", destination: `${backend}/api/v1/devices/:path*` },
       // …per-domain as flipped
     ];
   }
   ```

3. **Delete or stub** the matching `app/api/v1/.../route.ts` files after the rewrite is confirmed (Next may prefer the local route over rewrite if both exist — remove local handlers when flipping a domain).

4. Keep `proxy.ts` / middleware for CSRF, admin host gating, payload size — still applies before rewrite.

### Phase 2 — Direct API (optional later)

Point browser/`fetch` and Atithi at `https://api.ekotsa.com/v1/...` and drop the website proxy. Requires cookie/CORS work from §2. Not required for first production cut.

### Phase 3 — Strip website backend code

Remove from website:

- `src/modules/{auth,licenses,devices,downloads,payments,recovery,...}/server/*` used only by deleted routes
- Prisma models that backend owns (only after no website route/server-action uses them)
- Supabase storage client for payment proofs (backend local/S3)

Keep Prisma for **CMS** (+ anything still server-rendered from Next).

---

## 4. Path mapping (website URL → backend)

Backend already mounts both `/v1` and `/api/v1`. Prefer rewrites that preserve `/api/v1/...`.

| Website path | Backend path | Notes |
|--------------|--------------|-------|
| `/api/v1/login` | `/api/v1/auth/login` **or** alias `/api/v1/login` | **Gap:** add flat auth aliases on backend |
| `/api/v1/signup` | `/api/v1/auth/signup` | same |
| `/api/v1/logout` | `/api/v1/auth/logout` | same |
| `/api/v1/me` | `/api/v1/auth/me` | same |
| `/api/v1/send-otp` | `/api/v1/auth/forgot-password` | map or alias |
| `/api/v1/reset-password` | `/api/v1/auth/reset-password` | |
| `/api/v1/verify-code` / `auth/otp/*` | `/api/v1/auth/verify-otp` | confirm parity |
| `/api/v1/oauth/google/*` | `/api/v1/auth/google/*` | map |
| `/api/v1/activation/session` | `/api/v1/activation/session` | OK |
| `/api/v1/devices/*` | same | OK |
| `/api/v1/licenses/*` | same | OK |
| `/api/v1/releases/current` | same | OK |
| `/api/v1/downloads/*` | same | OK |
| `/api/v1/registrations/*` | same | OK |
| `/api/v1/payment-qr`, `submit-payment*` | same | OK |
| `/api/v1/recovery/*`, `portal/*` | same | OK |
| `/api/v1/contact`, `business-assessment` | same | OK |
| `/api/v1/admin/*` (non-CMS) | same | see gaps below |
| `/api/v1/internal/notifications/*` | same | point cron at backend |
| `/api/v1/admin/cms/*`, `internal/cms/*` | **stay on website** | Wave G |

**Before flipping auth:** implement backend aliases for flat `/login|/signup|/logout|/me|/send-otp|/reset-password` so website and Atithi need zero path changes.

---

## 5. Flip order (safe sequence)

Flip one domain at a time. For each: rewrite → remove Next handler → soak 24–72h → next domain.

| Step | Domains | Risk | Soak checks |
|------|---------|------|-------------|
| **0** | Health + env parity | Low | Backend `/v1/health`; shared DB sync |
| **1** | Auth (+ Google OTP) | High | Signup/login cookie; dashboard `/me`; Atithi login |
| **2** | Activation + devices + licenses | High | Desktop register → issue → refresh |
| **3** | Releases + downloads | Med | Installer authorize returns HTTPS URL |
| **4** | Registrations + payments | Med | Submit proof → admin approve → grant |
| **5** | Recovery + portal + device-reset | Med | Request → approve → download artifact |
| **6** | Admin ops (users, metrics, exports, …) | Med | Admin UI pages load |
| **7** | Contact + notifications + cron | Low | Lead create; outbox process |
| **8** | Delete dead website modules / unused Prisma | Low | Build + e2e |
| **—** | CMS | Skip | Keep on Next |

Feature flags per domain (optional):

```bash
PROXY_AUTH=1
PROXY_LICENSES=1
PROXY_DEVICES=1
# ...
```

---

## 6. Known gaps to close on backend before / during flip

Website still has handlers the backend does not fully mirror:

| Website route | Action |
|---------------|--------|
| Flat auth (`/login`, `/signup`, …) | Add aliases on backend |
| `admin/licenses` list/extend/status/preview | Port or map onto grants APIs |
| `admin/licenses/grants/preview` | Port or drop from UI |
| `admin/devices`, `admin/devices/revoke` | Port thin admin device list/revoke |
| `admin/downloads` | Port or stub 501 until needed |
| `admin/payments/note` | Add note endpoint or fold into status |
| `admin/users/validity` | Port or retire |
| `admin/generate-code`, `admin/codes` | Legacy activation codes — decide keep/defer |
| `verify-email` | Port or mark unused |
| CSRF / fresh-admin mutation parity | Align middleware with website `withAdminMutation` |

Track these as a short “parity backlog” before flipping the related admin UI.

---

## 7. What the website keeps doing

- Render marketing, dashboard, admin **UI**
- Call `/api/v1/*` (proxied) from client/server components
- CMS server actions + Prisma Cms\* models
- `proxy.ts` route protection for `/admin`, `/dashboard`
- Optional BFF-only helpers that do **not** duplicate commercial writes

Website must **not**:

- Create LicenseGrant / Device / PaymentSubmission itself after flip
- Own payment-proof storage
- Run license-expiry notification cron (point to backend)

---

## 8. Implementation checklist (website repo)

- [x] `EKOTSA_BACKEND_URL` + rewrite helper / `next.config` rewrites
- [x] **UI-only enforcement:** commercial API handlers removed; Prisma runtime throws
- [x] Backend auth path aliases + OTP / codes / admin gaps
- [ ] Shared secret + DB on staging; smoke Atithi + web login
- [x] Notification / payment / commercial traffic → backend via proxy
- [x] Delete flipped `app/api/v1/**` (archived under `_archived_api_handlers/`)
- [x] Commercial `src/modules/*/server` removed (archived)
- [x] Website README + `docs/BACKEND_PROXY.md` (UI-only)
- [x] Wave G: CMS admin on backend (website UI calls `/api/v1/admin/cms/*`; public uses API + seed fallback)
- [x] Google OAuth PKCE on backend (start/callback/exchange; desktop `ekotsa:` / `hotel-manager:`)

**Status:** Website is **UI-only**. Requires `EKOTSA_BACKEND_URL`. No Postgres/Prisma/Supabase for commercial or CMS data.

---

## 9. Rollback

While Next route files still exist: set `EKOTSA_API_PROXY_MODE=off` (or per-domain flag off) → traffic returns to website handlers.

After route files are deleted: redeploy previous website revision **or** restore handlers from git. Prefer keeping handlers one release behind deletes.

---

## 10. Success criteria

- Atithi activates and refreshes with **zero** website business logic in the path
- Web login/session works via backend-issued cookie
- Admin payment verify / recovery approve hit backend only
- Website Prisma usage limited to CMS (+ transitional read-only if any)
- No dual-write; one Postgres owner for commercial tables (backend Sequelize sync or shared migrations — pick one and document)

---

## Immediate next engineering tasks

1. ~~**Backend:** add flat auth aliases~~ **done**
2. ~~**Website:** rewrite infra~~ **done** — see `ekotsa-website/docs/BACKEND_PROXY.md`
3. ~~**Wave G + Google PKCE**~~ **done** — see [WAVE_G.md](./WAVE_G.md)
4. **Staging:** shared DB + secrets; smoke desktop Google OAuth + CMS admin save + web login
