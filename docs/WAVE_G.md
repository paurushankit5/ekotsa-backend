# Wave G — CMS + Google OAuth PKCE

## CMS (admin + public)

Commercial CMS now lives on **ekotsa-backend**. The website is UI-only and calls these APIs (via `/api/v1` rewrite).

### Public
| Method | Path |
|--------|------|
| GET | `/v1/cms/public/bootstrap` |
| GET | `/v1/cms/public/blog`, `/blog/:slug` |
| GET | `/v1/cms/public/guides`, `/guides/:slug` |
| GET | `/v1/cms/public/products`, `/products/:slug` |
| GET | `/v1/cms/public/pages?path=` |
| GET | `/v1/cms/public/preview/:token` |

Website marketing falls back to **seed content** if the backend returns empty.

### Admin (`ADMIN` cookie)
Mounted at `/v1/admin/cms/*`:

- articles / products / pages — list, get, PUT upsert, DELETE  
- menus, settings, redirects, assets  
- workflow transition, revisions list/restore  
- preview-links create/revoke  

### Cron
`POST /v1/internal/cms/process-schedules` with `x-cron-token: CRON_SECRET`

### Models
`CmsArticle`, `CmsPage`, `CmsProduct`, `CmsMenu`(+Item), `CmsSetting`, `CmsRedirect`, `CmsAsset`, `CmsRevision`, `CmsPreviewToken`, `CmsWorkflowAction`, `CmsRoleAssignment`

---

## Google OAuth PKCE (browser + desktop)

DB-backed `GoogleOAuthTransaction` replaces in-memory state.

### Flow
```
POST|GET /v1/oauth/google/start   { desktopCallbackUri?, browserReturnTo?, emailHint? }
  → Google authorize (PKCE S256)

GET /v1/oauth/google/callback?code&state
  → upsert user, activation session, set cookie
  → desktop: redirect callback?handoff_code=&handoffCode=&provider=google
  → browser: browserReturnTo?oauth=google

POST /v1/oauth/google/exchange { handoffCode }
  → { user, activationSession: { token, expiresAt (unix), expiresAtIso } }
```

Also under `/v1/auth/google/*`.

Desktop schemes allowed: `ekotsa:`, `hotel-manager:`.

### Local setup
```bash
# backend .env
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/api/v1/oauth/google/callback
# or website-proxied:
# GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/v1/oauth/google/callback

npm run db:sync
```

Website needs `EKOTSA_BACKEND_URL` so OAuth routes proxy to the backend.
