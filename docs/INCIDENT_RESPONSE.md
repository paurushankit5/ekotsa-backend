# Incident response runbook (security and personal data)

Internal procedure. Owner: **Laya Priyadarshani** (business owner and Grievance Officer), admin@ekotsa.com,
+91 8544260088. Review after every incident and at least every 6 months.

> Status (25 Nov 2026): procedure written; **CERT-In point of contact not yet registered** and **India-resident log
> storage not yet in place** — see "Open items". Run a tabletop drill before go-live and record it below.

## 1. What counts as an incident

- Any unauthorised access to, or disclosure, alteration, loss or destruction of personal data (a **personal data breach**).
- Any cyber security incident of a type listed in the Annexure to the CERT-In Directions of 28 April 2022, e.g.:
  targeted scanning/probing of critical systems, compromise of systems or data, unauthorised access to IT systems
  or data, website defacement or malicious code on the website, identity theft/spoofing/phishing, denial-of-service,
  attacks on servers (database, mail, DNS) or cloud systems, data breach or data leak, attacks via malicious mobile apps.

## 2. Clock and first hour

| When | Action | Who |
|---|---|---|
| T+0 | Note the time you **became aware**. Start an incident log (time-stamped notes, no personal data copied into chat tools). | Whoever notices |
| ≤ 1 h | Contain: revoke leaked keys/secrets, disable compromised accounts, block abusive IPs, take affected feature offline. Preserve evidence (do not wipe servers; snapshot logs). | Owner + engineer |
| ≤ 1 h | Decide: is it a CERT-In reportable incident? (Section 1 list.) | Owner |
| **≤ 6 h** | If reportable: report to CERT-In — incident@cert-in.org.in, phone 1800-11-4949, fax 1800-11-6969 — using the CERT-In incident reporting form (www.cert-in.org.in). Include what is known; send updates later. | Owner |
| ≤ 24 h | Assess personal data impact: which people, which data categories, likely consequences. | Owner + engineer |
| Without undue delay | Tell affected people in plain language: what happened, likely consequences, what we did, what they should do, contact for questions. | Owner |
| From DPDP commencement | Intimate the Data Protection Board of India without delay, and file the detailed report within 72 hours (DPDP Rules, 2025; provisions scheduled ~18 months after Nov 2025 — counsel to confirm date). | Owner |
| If GDPR/UK GDPR applies to affected people | Notify the competent supervisory authority within 72 hours where required (counsel decides applicability). | Owner + counsel |
| After closure | Root-cause review; fix; update this runbook; record in the drill/incident log below. | Owner + engineer |

## 3. Where to look

| Source | Where | Retention |
|---|---|---|
| Application security log (`audit_logs` table: admin actions, privacy requests, guardian checks, legal holds, retention runs) | Neon (Singapore) | 2 years |
| API request logs (IP, method, path, status, user agent) | Render dashboard → Logs | Render plan default (short) — **gap** |
| Website request logs | Vercel dashboard → Logs | Vercel plan default (short) — **gap** |
| Rate-limit counters | `rate_limit_counters` table | ~1 hour |
| Email sending | Google Workspace admin console | Google default |

## 4. Containment cheat-sheet

- Rotate secrets: `JWT_SECRET`, `OTP_PEPPER`, `DEVICE_TOKEN_PEPPER`, `CRON_SECRET`, `AUTH_JWT_PRIVATE_KEY` (new key
  ID; old key kept only as `AUTH_JWT_PREVIOUS_PUBLIC_KEYS` if sessions must survive), SMTP app password, R2 keys,
  Google OAuth secret. Redeploy Render.
- Force sign-out of everyone: rotate `AUTH_JWT_PRIVATE_KEY` without keeping the previous key.
- Licence signing key compromise: generate a new key pair, ship a desktop build with the new public key; revoke
  affected licences in Admin.
- Place a **legal hold** (Admin → Legal holds) on records needed as evidence so the retention job does not delete them.

## 5. Open items before go-live

1. Register a CERT-In point of contact and record it here (CERT-In Directions, para (ii)).
2. Decide with counsel whether Ekotsa is a covered entity for the 180-day log rule; if so, stream Render and Vercel
   logs to storage **in India** (e.g. a log service/bucket in an Indian region) with ≥180 days retention and a
   documented retrieval procedure. Record the destination here.
3. Synchronise server clocks to NTP (Render/Vercel do this by default — verify and record).
4. Run a tabletop drill (scenario: leaked database URL) and record it below.

## 6. Drill and incident log

| Date | Type | Summary | Follow-ups |
|---|---|---|---|
| | | | |
