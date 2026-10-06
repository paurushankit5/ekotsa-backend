# Wave E + F — Complete

Recovery / portal / admin ops (E) and contact / notifications (F).

## Wave E — Recovery, portal, admin

### Recovery
```
POST /v1/recovery/request          (user) { grantId }
GET  /v1/recovery/status           (user)
GET  /v1/recovery/:id              (user) → signed artifact download
POST /v1/recovery/approve          (admin) { requestId, expiresInHours? }
POST /v1/recovery/reject           (admin) { requestId }
POST /v1/admin/licenses/recovery   (admin) direct issue by grantId
GET  /v1/admin/recoveries
POST /v1/admin/recoveries/revoke
```

Approve signs a license artifact (Ed25519) into `RecoveryArtifact` and links it to the request.

### Device reset
```
POST /v1/devices/reset/request     (user)
GET  /v1/portal/device-resets      (user)
GET  /v1/admin/device-resets
POST /v1/admin/device-resets/decide  { requestId, action: approve|reject }
```

Approve revokes the device + auth tokens. Cooldown / max-30d via env.

### Portal
```
GET /v1/portal/overview
GET /v1/portal/recovery/:id        (valid, non-revoked artifact only)
```

### Admin ops
```
GET /v1/admin/users
GET /v1/admin/customers/search?q=
GET /v1/admin/active-users
GET /v1/admin/metrics
GET /v1/admin/ops/summary
GET /v1/admin/leads
GET /v1/admin/abuse/trials?days=
GET /v1/admin/support/timeline?q=
GET /v1/admin/exports/{recoveries|audit|payments|licenses}
```

### Models
`RecoveryRequest`, `RecoveryArtifact`, `DeviceResetRequest`, `AuditLog`

---

## Wave F — Contact + notifications

### Public
```
POST /v1/contact
POST /v1/business-assessment
```

Contact creates `ContactLead` and optionally emails `SMTP_TO`.

### Admin notifications
```
GET  /v1/admin/notifications
GET  /v1/admin/notifications/templates
POST /v1/admin/notifications/send-now
POST /v1/admin/notifications/retry
POST /v1/admin/notifications/cancel
```

### Internal cron (`x-cron-token: CRON_SECRET`)
```
POST /v1/internal/notifications/schedule   — enqueue 7d/3d expiry reminders
POST /v1/internal/notifications/process    — drain outbox (SMTP or console)
```

### Models / services
`ContactLead`, `NotificationOutbox`  
`src/services/mailer.ts`, `notifications/{outbox,processor,templates}.ts`

Templates (code): `device_reset_*`, `license_extended`, `license_expiry_7d`, `license_expiry_3d`.

---

## Env additions

```bash
SMTP_TO=ops@ekotsa.com
CRON_SECRET=change-me-cron-secret
NOTIFICATIONS_MAX_ATTEMPTS=6
DEVICE_RESET_COOLDOWN_DAYS=7
DEVICE_RESET_MAX_REQUESTS_30D=2
DEVICE_RESET_REQUIRE_DEVICE_ID=false
```

```bash
npm run db:sync
npm run make-admin -- you@example.com
npm run dev
```

## Out of Wave E/F
- CMS (Wave G) — optional; can stay in Next
- Rate limits / CSRF parity with website
- Production S3/R2 object storage
