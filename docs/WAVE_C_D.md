# Wave C + D — Complete

Releases/downloads (C) and orgs/registrations/payments (D).

## Wave C — gated installer download

Public release metadata never includes `installerUrl`. Clients get a short-lived download token, then authorize to receive the HTTPS URL.

```
GET  /v1/releases/current?platform=windows
POST /v1/downloads/session          (user cookie) → token
POST /v1/downloads/authorize        (token + platform) → installer URL
POST /v1/downloads                  (optional analytics event)
```

Paths also work under `/api/v1/*`.

### Releases
| Method | Path | Auth |
|--------|------|------|
| GET | `/v1/releases/current` | Public (URL stripped) |

Configure via `APP_RELEASE_MANIFEST_JSON` (array or single object). Installer URL must be **https**.

### Downloads
| Method | Path | Auth |
|--------|------|------|
| POST | `/v1/downloads/session` | User cookie |
| POST | `/v1/downloads/authorize` | Download token (body / Bearer / `ek_download_session` cookie) |
| POST | `/v1/downloads` | Public (event ingest) |

Token TTL: 30 minutes, max 3 uses. Models: `DownloadAuthorization`, `DownloadEvent`.

---

## Wave D — registration + manual payment → grant

```
POST /v1/registrations
GET  /v1/registrations/status?email=
GET  /v1/registrations/me
GET  /v1/organizations/:id

GET  /v1/payments/qr
POST /v1/payments/submit              → signed upload URL
PUT  /v1/payments/upload/:bucket/:path
POST /v1/payments/submit/confirm
GET  /v1/admin/payments
POST /v1/admin/payments/status        → approve → LicenseGrant
```

Website aliases: `GET /v1/payment-qr`, `POST /v1/submit-payment`, `POST /v1/submit-payment/confirm`.

### Registrations / orgs
| Method | Path | Auth |
|--------|------|------|
| POST | `/v1/registrations` | Optional cookie (links user if present) |
| GET | `/v1/registrations/status` | Optional cookie, or `email` / `registrationId` |
| GET | `/v1/registrations/me` | User cookie |
| GET | `/v1/organizations/:id` | Public |

Signup/login/Google auto-link matching registration by email.

### Payments
| Method | Path | Auth |
|--------|------|------|
| GET | `/v1/payments/qr` | Public |
| POST | `/v1/payments/submit` | User cookie |
| POST | `/v1/payments/submit/confirm` | User cookie |
| PUT | `/v1/payments/upload/:bucket/:path` | Upload token URL |
| GET | `/v1/payments/proof/:bucket/:path` | Dev read |
| GET | `/v1/admin/payments` | ADMIN cookie |
| POST | `/v1/admin/payments/status` | ADMIN cookie (`approve` + `deviceId`) |
| POST | `/v1/admin/verify-payment` | ADMIN cookie (alias) |

Approve creates/extends a `LicenseGrant` via `LicenseService.createGrant`. Proofs stored under `STORAGE_LOCAL_DIR` (default `.storage/`) — replace with S3/R2 later.

### Models
- `Organization`, `CustomerRegistration`
- `PaymentSubmission`
- Local object storage: `src/services/local-object-storage.ts`

---

## Local setup

```bash
# set DATABASE_URL + APP_RELEASE_MANIFEST_JSON in .env
npm run db:sync
npm run make-admin -- you@example.com
npm run dev
```

## Out of Wave C/D (later)
- Recovery / device-reset (Wave E)
- Full admin portal / CMS / notifications
- Production object storage (S3/R2)
- Activation codes / legacy `License` table
