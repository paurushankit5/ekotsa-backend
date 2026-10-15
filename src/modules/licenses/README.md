# Licenses (Atithi desktop) — Wave B

Bearer device auth required on desktop routes. Admin grant routes need an **ADMIN** user cookie session.

## Desktop endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/licenses/issue` | Mint signed artifact |
| GET | `/v1/licenses/status` | Status + optional artifact |
| POST | `/v1/licenses/refresh` | Re-mint artifact (`{ deviceId? }`) |

Also under `/api/v1/licenses/*`.

## Admin grant endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/admin/licenses/grants` | Create or extend paid grant |
| GET | `/v1/admin/licenses/grants` | List grants |
| POST | `/v1/admin/licenses/grants/revoke` | Revoke grant |

Payment approve also creates grants — see [docs/WAVE_C_D.md](../../../docs/WAVE_C_D.md).

Create body example:

```json
{
  "userId": "...",
  "deviceId": "...",
  "plan": "standard",
  "durationDays": 365,
  "reason": "manual activation"
}
```

## Entitlement sources

1. **LicenseGrant** for device (paid) — wins over trial  
2. **User.trialStartedAt** + `LICENSE_TRIAL_DAYS` (default 21) — started on device register  
3. Otherwise `NOT_ACTIVATED`

## Artifact

Ed25519 signed `{ payload, payloadHash, signature }` compatible with Atithi `EntitlementGuard`.

## Signing env

```bash
npm run keys:license
```

- `LICENSE_SIGNING_KEY_ID`
- `LICENSE_SIGNING_PRIVATE_KEY`
- `LICENSE_SIGNING_PUBLIC_KEY`
- `LICENSE_GRACE_DAYS` (default 7)
- `LICENSE_MAX_OFFLINE_DAYS` (default 30)
- `LICENSE_TRIAL_DAYS` (default 21)
