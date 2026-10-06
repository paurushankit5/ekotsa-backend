# Simple Auth API

Base: `http://localhost:4000/v1/auth`  
Session: httpOnly cookie `ekotsa_session` (set `credentials: include` from the browser).

## Endpoints

| Method | Path | Body |
|--------|------|------|
| POST | `/signup` | `{ email, password, name? }` |
| POST | `/login` | `{ email, password }` |
| POST | `/logout` | — |
| GET | `/me` | cookie required |
| POST | `/forgot-password` | `{ email }` → sends 6-digit OTP |
| POST | `/verify-otp` | `{ email, otp }` → `{ resetToken }` |
| POST | `/reset-password` | `{ newPassword, resetToken }` or `{ newPassword, email, otp }` |
| GET | `/google/start` | redirect to Google |
| GET | `/google/callback` | Google redirect back |

## Setup

1. Set `DATABASE_URL` and `JWT_SECRET` in `.env`
2. `npm run db:sync`
3. `npm run dev`
4. Optional: SMTP for real email; otherwise OTP is logged to the console
5. Optional: Google OAuth env vars for `/google/*`

## Quick curl

```bash
# signup
curl -c cookies.txt -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"password123","name":"You"}' \
  http://localhost:4000/v1/auth/signup

# me
curl -b cookies.txt http://localhost:4000/v1/auth/me

# forgot password (check server logs for OTP if SMTP unset)
curl -H 'content-type: application/json' \
  -d '{"email":"you@example.com"}' \
  http://localhost:4000/v1/auth/forgot-password
```
