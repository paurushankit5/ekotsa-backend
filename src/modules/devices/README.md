# Devices (Bearer identity) — Wave B

Atithi-compatible device registration and binding.

## Flow

1. User logs in (`POST /v1/auth/login`) → session cookie  
2. `POST /v1/activation/session` (cookie) → one-time `activationSession.token`  
3. Desktop `POST /v1/devices/register` → `deviceAuth.token`  
4. Desktop calls use `Authorization: Bearer <deviceAuth.token>`  
5. Optional: `POST /v1/devices/revoke` to kill the device + tokens  

Also mounted at `/api/v1/...` for Atithi path compatibility.

## Endpoints

| Method | Path | Auth |
|--------|------|------|
| POST | `/v1/activation/session` | User cookie |
| POST | `/v1/devices/register` | Activation session token in body |
| GET | `/v1/devices/me` | Bearer device token |
| POST | `/v1/devices/revoke` | Bearer device token |

## Register body

```json
{
  "activationSessionToken": "...",
  "deviceId": "at-least-16-chars-id",
  "deviceName": "Front Desk PC",
  "platform": "windows",
  "appVersion": "0.1.0",
  "installationId": "optional",
  "deviceFingerprint": "optional"
}
```

## Response

```json
{
  "ok": true,
  "device": { "id": "...", "deviceName": "...", "platform": "windows", "status": "ACTIVE" },
  "deviceAuth": { "token": "...", "expiresAt": 1735689600 }
}
```

`expiresAt` is unix seconds (Atithi-friendly). Register also starts `User.trialStartedAt` if unset.
