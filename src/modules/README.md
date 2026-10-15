# Domain modules

Commercial APIs migrated from `ekotsa-website` `/api/v1/*` into Express.

| Module | Wave | Status |
|--------|------|--------|
| `health` | — | live |
| `users` | A → merge into `auth` | legacy scaffold |
| `platform` | A | stub (`/_status` only) |
| `auth` | A | **live** — signup/login/logout/OTP reset/Google PKCE |
| `licenses` | B | **live** — issue / status / refresh + Ed25519 |
| `devices` | B | **live** — register + Bearer me + activation session |
| `downloads` | C | **live** — session + authorize + events |
| `releases` | C | **live** — `GET /releases/current` (URL gated) |
| `organizations` | D | **live** — get by id |
| `registrations` | D | **live** — create / status / me |
| `recovery` | E | **live** — request / status / approve / reject / download |
| `portal` | E | **live** — overview / device-resets / recovery download |
| `payments` | D | **live** — QR + submit + local proof storage + admin verify→grant |
| `admin` | B–G | **live** — grants, payments, recoveries, resets, users, metrics, notifications, cms |
| `notifications` | F | **live** — outbox + admin + internal cron |
| `contact` | F | **live** — contact + business-assessment |
| `cms` | G | **live** — public reads + admin CRUD + preview + schedule cron |

Only `platform` is still a stub. Live modules expose domain routes (some also have `/_status`).

Full API inventory: [`docs/MIGRATION_PLAN.md`](../../docs/MIGRATION_PLAN.md).
