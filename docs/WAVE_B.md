# Wave B — Complete

Devices + licenses for Atithi desktop activation / refresh / bind.

## Desktop flow

```
POST /v1/auth/login
POST /v1/activation/session          (user cookie)
POST /v1/devices/register            (activation token)
POST /v1/licenses/issue|refresh      (Bearer deviceAuth)
GET  /v1/licenses/status
POST /v1/devices/revoke              (optional)
```

Paths also work under `/api/v1/*`.

## Endpoints

### Devices
| Method | Path | Auth |
|--------|------|------|
| POST | `/v1/activation/session` | User cookie |
| POST | `/v1/devices/register` | Activation session |
| GET | `/v1/devices/me` | Device Bearer |
| POST | `/v1/devices/revoke` | Device Bearer |

### Licenses
| Method | Path | Auth |
|--------|------|------|
| POST | `/v1/licenses/issue` | Device Bearer |
| GET | `/v1/licenses/status` | Device Bearer |
| POST | `/v1/licenses/refresh` | Device Bearer |

### Admin grants
| Method | Path | Auth |
|--------|------|------|
| POST | `/v1/admin/licenses/grants` | ADMIN cookie |
| GET | `/v1/admin/licenses/grants` | ADMIN cookie |
| POST | `/v1/admin/licenses/grants/revoke` | ADMIN cookie |

(Payment approve → grant is Wave D — see [WAVE_C_D.md](./WAVE_C_D.md).)

## Models
- `User.trialStartedAt`
- `Device`, `DeviceAuthToken`, `ActivationSession`
- `LicenseGrant`
- Ed25519 artifacts via `src/services/license-artifacts.ts`

## Entitlement
1. Active `LicenseGrant` for device → paid  
2. Else `trialStartedAt` + `LICENSE_TRIAL_DAYS` → trial  
3. Else not activated  

## Local setup

```bash
# set DATABASE_URL in .env
npm run db:sync
npm run keys:license   # if signing keys missing
npm run make-admin -- you@example.com
npm run dev
```

## Out of Wave B (later)
- Downloads / releases — **done in Wave C** ([WAVE_C_D.md](./WAVE_C_D.md))
- Payments → auto grant — **done in Wave D** ([WAVE_C_D.md](./WAVE_C_D.md))
- Recovery / device-reset / full admin (Wave E)
- Activation codes / legacy `License` table
