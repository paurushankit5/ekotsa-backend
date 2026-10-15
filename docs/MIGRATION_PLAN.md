# Ekotsa Backend Migration Plan

Migrate commercial APIs from `ekotsa-website` (Next.js route handlers) into `ekotsa-backend` (Express), domain by domain, against **one PostgreSQL** database.

## Goals

- Dedicated **frontend** (`ekotsa-website`) + dedicated **API** (`ekotsa-backend`)
- Single source of truth: **PostgreSQL** (Prisma schema from website is the current schema)
- Remove **Supabase** as a product dependency (keep Postgres; replace Storage)
- Keep **Atithi / desktop** on `/api/v1/*` contracts with minimal breakage

## Current state

| Repo | Role today |
|------|------------|
| `ekotsa-website` | Marketing UI + admin UI + remaining APIs + Prisma models |
| `ekotsa-backend` | Express API: **Wave A–F live** (auth → licenses → downloads → payments → recovery/portal/admin → contact/notifications) |
| Postgres | Sequelize sync in backend; Prisma still on website until cutover |
| Supabase | Website payment proofs; backend uses **local object storage** for Wave D |

Canonical website API: `/api/v1/*` (legacy `/api/*` is deprecated). Backend exposes the same paths under `/v1/*` and `/api/v1/*`.

**Done docs:** [WAVE_B.md](./WAVE_B.md), [WAVE_C_D.md](./WAVE_C_D.md), [WAVE_E_F.md](./WAVE_E_F.md).

## Target architecture

```
Atithi (.exe)  ──┐
Website FE     ──┼──►  ekotsa-backend (/v1)  ──►  PostgreSQL
Admin FE       ──┘         │
                           └── Object storage (S3/R2/local)  [replaces Supabase Storage]
```

During migration, Next can **proxy** `/api/v1/*` to Express so clients do not change URLs until cutover.

---

## Domains (migration order)

Priority is **desktop licensing path first**, CMS last.

| # | Domain | Module folder | Priority | Depends on |
|---|--------|---------------|----------|------------|
| 0 | Foundation | `src/config`, `src/db`, `src/middleware`, `src/services` | P0 | — |
| 1 | Platform | `modules/platform` | P0 | Foundation |
| 2 | Auth & Identity | `modules/auth` (+ retire thin `modules/users`) | P0 **(simple auth live)** | Platform |
| 3 | Organizations & Registrations | `modules/organizations`, `modules/registrations` | P1 **live (Wave D)** | Auth |
| 4 | Licenses & Activation | `modules/licenses` | P0 **live (Wave B)** | Auth, Orgs |
| 5 | Devices | `modules/devices` | P0 **live (Wave B)** | Auth, Licenses |
| 6 | Downloads & Releases | `modules/downloads`, `modules/releases` | P1 **live (Wave C)** | Auth, Licenses, Devices |
| 7 | Payments & Storage | `modules/payments`, `services/local-object-storage` | P1 **live (Wave D)** | Auth, Orgs |
| 8 | Recovery & Device Resets | `modules/recovery`, device-reset | P2 **live (Wave E)** | Devices, Licenses |
| 9 | Portal & Admin Ops | `modules/portal`, `modules/admin` | P2 **live (Wave E)** | Most domains |
| 10 | Notifications & Contact | `modules/notifications`, `modules/contact` | P2 **live (Wave F)** | Auth |
| 11 | CMS | `modules/cms` | P3 (last) / optional | Auth; can stay in Next longer |

---

## Domain → existing APIs (website)

Only **canonical `/api/v1/*`** listed. Legacy `/api/*` mirrors many of these; do not migrate legacy — retire after cutover.

### 1. Platform / cross-cutting (not always separate routes)

- Health: backend already has `GET /v1/health` (website has no dedicated v1 health; add parity if needed)
- Services to port: `rate-limit`, `audit-log`, `idempotency`, `logger`, `runtime-env`, CSRF (`modules/security`)
- Internal cron-style:
  - `POST /api/v1/internal/notifications/process`
  - `POST /api/v1/internal/notifications/schedule`
  - `POST /api/v1/internal/cms/process-schedules`

### 2. Auth & Identity

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/signup` | |
| POST | `/api/v1/login` | |
| POST | `/api/v1/logout` | |
| GET | `/api/v1/me` | |
| POST | `/api/v1/send-otp` | password-reset OTP |
| POST | `/api/v1/reset-password` | |
| POST | `/api/v1/verify-email` | |
| POST | `/api/v1/auth/otp/start` | device/login OTP |
| POST | `/api/v1/auth/otp/verify` | |
| GET | `/api/v1/oauth/google/start` | |
| GET | `/api/v1/oauth/google/callback` | |
| POST | `/api/v1/oauth/google/exchange` | |
| POST | `/api/v1/activation/session` | activation session token |

**Prisma models:** `User`, `EmailVerificationToken`, `PasswordResetOtp`, `AuthOtp`, `ActivationSession`, `GoogleOAuthIdentity`, `GoogleOAuthTransaction`

**Website source:** `src/modules/auth/server/*`

### 3. Organizations & Registrations

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/registrations` | |
| GET | `/api/v1/registrations/status` | |

**Prisma models:** `Organization`, `OrganizationMembership`, `CustomerRegistration`, `RegistrationDownloadEvent`

**Website source:** `src/modules/organizations`, `src/modules/registrations`

### 4. Licenses & Activation

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/verify-code` | activation code |
| GET/POST | `/api/v1/licenses/status` | confirm verbs in handlers |
| POST | `/api/v1/licenses/issue` | |
| POST | `/api/v1/licenses/refresh` | desktop refresh |
| Admin | `/api/v1/admin/codes` | |
| Admin | `/api/v1/admin/generate-code` | |
| Admin | `/api/v1/admin/licenses` | |
| Admin | `/api/v1/admin/licenses/status` | |
| Admin | `/api/v1/admin/licenses/extend` | |
| Admin | `/api/v1/admin/licenses/recovery` | |
| Admin | `/api/v1/admin/licenses/grants` | |
| Admin | `/api/v1/admin/licenses/grants/preview` | |

**Prisma models:** `ActivationCode`, `License`, `LicenseGrant`, `LicenseGrantEvent`

**Website source:** `src/modules/licenses/server/*`, `src/services/license-signing.ts`, `license-artifacts.ts`

### 5. Devices

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/devices/register` | |
| GET | `/api/v1/devices/me` | |
| POST | `/api/v1/devices/revoke` | |
| POST | `/api/v1/devices/reset/request` | |
| Admin | `/api/v1/admin/devices` | |
| Admin | `/api/v1/admin/devices/revoke` | |
| Admin | `/api/v1/admin/device-resets` | |
| Admin | `/api/v1/admin/device-resets/decide` | |

**Prisma models:** `Device`, `DeviceAuthToken`, `DeviceResetRequest`

**Website source:** `src/modules/devices/server/*`, `src/services/device-reset/*`

### 6. Downloads & Releases

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/v1/releases/current` | |
| POST | `/api/v1/downloads/authorize` | |
| GET/POST | `/api/v1/downloads` | |
| Admin | `/api/v1/admin/downloads` | |

**Prisma models:** `DownloadAuthorization`, `RegistrationDownloadEvent`

**Website source:** `src/modules/downloads`, `src/modules/releases`

### 7. Payments & Storage

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/v1/payment-qr` | |
| POST | `/api/v1/submit-payment` | starts upload (Supabase today) |
| POST | `/api/v1/submit-payment/confirm` | |
| Admin | `/api/v1/admin/payments` | signed read URLs |
| Admin | `/api/v1/admin/payments/status` | |
| Admin | `/api/v1/admin/payments/note` | |
| Admin | `/api/v1/admin/verify-payment` | |

**Prisma models:** `PaymentSubmission`, `PaymentSubmissionNote`

**Storage:** replace `src/services/object-storage.ts` + Supabase with S3/R2/local adapter behind the same interface.

### 8. Recovery

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/recovery/request` | |
| GET | `/api/v1/recovery/status` | |
| GET | `/api/v1/recovery/[id]` | |
| POST | `/api/v1/recovery/approve` | |
| POST | `/api/v1/recovery/reject` | |
| GET | `/api/v1/portal/recovery/[id]` | portal view |
| Admin | `/api/v1/admin/recoveries` | |
| Admin | `/api/v1/admin/recoveries/revoke` | |

**Prisma models:** `RecoveryRequest`, `RecoveryArtifact`

### 9. Portal & Admin Ops

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/v1/portal/overview` | |
| GET | `/api/v1/portal/device-resets` | |
| Admin | `/api/v1/admin/users` | |
| Admin | `/api/v1/admin/users/validity` | |
| Admin | `/api/v1/admin/customers/search` | |
| Admin | `/api/v1/admin/leads` | |
| Admin | `/api/v1/admin/metrics` | |
| Admin | `/api/v1/admin/ops/summary` | |
| Admin | `/api/v1/admin/active-users` | |
| Admin | `/api/v1/admin/abuse/trials` | |
| Admin | `/api/v1/admin/support/timeline` | |
| Admin | `/api/v1/admin/exports/*` | audit, licenses, payments, recoveries |

### 10. Notifications & Contact

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/contact` | |
| POST | `/api/v1/business-assessment` | |
| Admin | `/api/v1/admin/notifications` | |
| Admin | `/api/v1/admin/notifications/templates` | |
| Admin | `/api/v1/admin/notifications/send-now` | |
| Admin | `/api/v1/admin/notifications/retry` | |
| Admin | `/api/v1/admin/notifications/cancel` | |
| Internal | `/api/v1/internal/notifications/*` | |

**Prisma models:** `ContactLead`, `NotificationOutbox`, `AuditLog`, `RequestIdempotency`

### 11. CMS

| Method | Path | Notes |
|--------|------|-------|
| Admin | `/api/v1/admin/cms/preview-links` | |
| Admin | `/api/v1/admin/cms/preview-links/[tokenHash]` | |
| Internal | `/api/v1/internal/cms/process-schedules` | |
| UI | `/admin/cms/*` pages (server modules, not all REST) | |

**Prisma models:** `CmsArticle`, `CmsPage`, `CmsProduct`, `CmsAsset`, `CmsMenu*`, `CmsSetting`, `CmsRedirect`, `CmsRevision`, `CmsRoleAssignment`, `CmsPreviewToken`, `CmsWorkflowAction`

CMS can remain in Next longer; migrate when marketing/admin split is ready.

---

## Phase 0 — Foundation (do first)

1. **ORM decision:** Prefer **Prisma** (schema already exists in website). Sequelize `User` scaffold should not become a second schema.
2. **Shared database:** Point backend `DATABASE_URL` at the same Postgres as website (Neon/Supabase/RDS — host optional).
3. **Copy / link schema:** Import `prisma/schema.prisma` + migrations into backend (or monorepo shared package later).
4. **Storage interface:** Define `ObjectStorage` with signed upload/read; implement Local/S3; keep Supabase adapter temporarily if needed.
5. **Auth parity:** Same JWT secret, cookie name, device token pepper — desktop must not break.
6. **Proxy strategy:** Next rewrites `/api/v1/<migrated-domain>/*` → Express while other domains stay in Next.  
   **Full plan:** [WEBSITE_CUTOVER_PLAN.md](./WEBSITE_CUTOVER_PLAN.md) (website becomes FE; backend owns commercial APIs).
7. **Contract tests:** Port website `test/contracts.test.mjs` / integration matrix against backend.

### Per-domain migration checklist

For each domain:

1. Scaffold module (`routes` / `controller` / `service`) — done as stubs
2. Port Prisma models used by domain (if not already generated)
3. Port service logic from `ekotsa-website/src/modules/...`
4. Implement `/v1/...` routes matching website paths (drop `/api` prefix or map 1:1)
5. Add contract + integration tests
6. Flip Next proxy for that path prefix
7. Mark website handlers as thin proxy or delete after soak
8. Update this plan status

---

## Suggested cut waves (Atithi-focused)

| Wave | Domains | Outcome |
|------|---------|---------|
| **A** | Foundation + Platform + Auth | Backend can authenticate users |
| **B** | Licenses + Devices | Desktop can activate / refresh / bind — **done in ekotsa-backend** |
| **C** | Downloads + Releases | Desktop can fetch builds |
| **D** | Orgs + Registrations + Payments + Storage | Commercial purchase path off Next |
| **E** | Recovery + Portal + Admin | Ops fully on backend |
| **F** | Notifications + Contact | Mail/ops off Next |
| **G** | CMS | Optional; or keep CMS in Next → **done on backend** ([WAVE_G.md](./WAVE_G.md)) |

**Website cutover (FE talks to backend):** [WEBSITE_CUTOVER_PLAN.md](./WEBSITE_CUTOVER_PLAN.md)  
**Wave G (CMS + Google PKCE):** [WAVE_G.md](./WAVE_G.md)

---

## Module map in `ekotsa-backend`

```
src/modules/
  platform/
  auth/            # absorbs current users module over time
  organizations/
  registrations/
  licenses/
  devices/
  downloads/
  releases/
  payments/
  recovery/
  portal/
  admin/
  notifications/
  contact/
  cms/
  health/          # existing
  users/           # legacy scaffold → merge into auth
```

---

## Non-goals (for now)

- Rewriting Atithi desktop UI
- Dual-writing to two databases
- Migrating legacy `/api/*` routes (deprecate only)
- Big-bang cutover of all domains in one PR
