import { QueryTypes } from "sequelize";
import { loadEnv } from "../../config/env.js";
import { sequelize } from "../../db/models/index.js";
import { sendEmail } from "../../services/mailer.js";
import { PrivacyService } from "./privacy.service.js";
import { PrivacyRequestsService } from "./privacy-requests.service.js";
import { holdExclusion } from "./legal-holds.service.js";
import { AuditLog } from "../../db/models/index.js";

/**
 * Applies the retention schedule published in the Privacy Policy (section "How long we keep
 * personal data"). Run daily by the scheduler via POST /api/v1/internal/privacy/purge.
 * Pass dryRun to get counts without deleting or emailing anything.
 */

/** Days of notice before an inactive account is erased (policy promises at least 48 hours). */
export const INACTIVITY_NOTICE_DAYS = 7;
const INACTIVE_AFTER = "3 years";
const BATCH = 200;

type Task = { name: string; policy: string; where: string; table: string };

// Each task deletes rows of `table` matching `where` (SQL with no user input).
const TASKS: Task[] = [
  {
    name: "enquiries",
    policy: "Enquiries, demo and assessment requests: 24 months from last interaction",
    table: "contact_leads",
    where: `"updatedAt" < NOW() - INTERVAL '24 months' AND status NOT IN ('CUSTOMER','CONVERTED','WON') AND ${holdExclusion('contact_leads')}`,
  },
  {
    name: "download_history",
    policy: "Download history: 36 months",
    table: "download_events",
    where: `"createdAt" < NOW() - INTERVAL '36 months'`,
  },
  {
    name: "download_registrations",
    policy: "Download registrations: 36 months from last download or activation (not linked to an account)",
    table: "customer_registrations",
    where: `"linkedUserId" IS NULL AND GREATEST("updatedAt", COALESCE("lastDownloadAt", 'epoch'), COALESCE("firstDeviceActivatedAt", 'epoch')) < NOW() - INTERVAL '36 months' AND ${holdExclusion('customer_registrations')}`,
  },
  {
    name: "expired_download_links",
    policy: "Single-use download authorisations: 30 days after expiry",
    table: "download_authorizations",
    where: `"expiresAt" < NOW() - INTERVAL '30 days'`,
  },
  {
    name: "expired_codes",
    policy: "Sign-in and password-reset codes: removed 30 days after expiry",
    table: "password_reset_otps",
    where: `"expiresAt" < NOW() - INTERVAL '30 days'`,
  },
  {
    name: "expired_google_signins",
    policy: "Google sign-in transactions: removed 30 days after expiry",
    table: "google_oauth_transactions",
    where: `"expiresAt" < NOW() - INTERVAL '30 days'`,
  },
  {
    name: "expired_activation_sessions",
    policy: "Device activation sessions: removed 30 days after expiry",
    table: "activation_sessions",
    where: `"expiresAt" < NOW() - INTERVAL '30 days'`,
  },
  {
    name: "expired_admin_handoffs",
    policy: "Admin sign-in handoff codes: removed 1 day after expiry",
    table: "admin_handoff_codes",
    where: `"expiresAt" < NOW() - INTERVAL '1 day'`,
  },
  {
    name: "email_outbox",
    policy: "Emails and correspondence: 24 months",
    table: "notification_outbox",
    where: `status IN ('SENT','FAILED','CANCELED') AND "updatedAt" < NOW() - INTERVAL '24 months'`,
  },
  {
    name: "security_logs",
    policy: "Security and access logs: kept at least 1 year (2 years), then deleted",
    table: "audit_logs",
    where: `"createdAt" < NOW() - INTERVAL '2 years'`,
  },
  {
    name: "closed_privacy_requests",
    policy: "Closed privacy requests: 3 years after closure",
    table: "privacy_requests",
    where: `status IN ('RESOLVED','REJECTED') AND "resolvedAt" < NOW() - INTERVAL '3 years'`,
  },
  {
    name: "orphan_consent_records",
    policy: "Consent records: life of the related data + 3 years",
    table: "consent_records",
    where: `"updatedAt" < NOW() - INTERVAL '3 years' AND NOT (
        ("subjectType" = 'USER' AND EXISTS (SELECT 1 FROM users u WHERE u.id = consent_records."subjectId"))
     OR ("subjectType" = 'REGISTRATION' AND EXISTS (SELECT 1 FROM customer_registrations r WHERE r.id = consent_records."subjectId"))
     OR ("subjectType" = 'CONTACT_LEAD' AND EXISTS (SELECT 1 FROM contact_leads l WHERE l.id = consent_records."subjectId")))`,
  },
];

/** Customer accounts eligible for inactivity erasure (no licence/payment records still under retention). */
const INACTIVE_USERS_WHERE = `u.role = 'USER'
  AND ${holdExclusion('users', 'u')}
  AND COALESCE(u."lastActiveAt", u."updatedAt") < NOW() - INTERVAL '${INACTIVE_AFTER}'
  AND NOT EXISTS (SELECT 1 FROM license_grants g WHERE g."userId" = u.id AND g."expiresAt" > NOW() - INTERVAL '8 years')
  AND NOT EXISTS (SELECT 1 FROM payment_submissions p WHERE p."userId" = u.id AND p."createdAt" > NOW() - INTERVAL '8 years')`;

async function count(table: string, where: string) {
  const rows = await sequelize.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${where}`, {
    type: QueryTypes.SELECT,
  });
  return rows[0]?.n ?? 0;
}

async function remove(table: string, where: string) {
  const rows = await sequelize.query<{ id: string }>(`DELETE FROM ${table} WHERE ${where} RETURNING id`, {
    type: QueryTypes.SELECT,
  });
  return rows.length;
}

async function handleInactiveAccounts(dryRun: boolean) {
  const env = loadEnv();
  const toNotify = await sequelize.query<{ id: string; email: string; name: string | null }>(
    `SELECT u.id, u.email, u.name FROM users u WHERE ${INACTIVE_USERS_WHERE} AND u."inactivityNoticeSentAt" IS NULL LIMIT ${BATCH}`,
    { type: QueryTypes.SELECT },
  );
  const toDelete = await sequelize.query<{ id: string }>(
    `SELECT u.id FROM users u WHERE ${INACTIVE_USERS_WHERE}
       AND u."inactivityNoticeSentAt" < NOW() - INTERVAL '${INACTIVITY_NOTICE_DAYS} days'
       AND COALESCE(u."lastActiveAt", u."updatedAt") < u."inactivityNoticeSentAt" LIMIT ${BATCH}`,
    { type: QueryTypes.SELECT },
  );
  if (dryRun) return { noticesSent: toNotify.length, accountsErased: toDelete.length };

  let noticesSent = 0;
  for (const user of toNotify) {
    try {
      const login = new URL("/login", env.FRONTEND_URL).toString();
      await sendEmail({
        to: user.email,
        subject: "Your Ekotsa account will be deleted due to inactivity",
        text: [
          `Dear ${user.name || "Ekotsa user"},`,
          "",
          `Your Ekotsa account (${user.email}) has not been used for over 3 years. As set out in our Privacy Policy,`,
          `we will delete it and its personal data in ${INACTIVITY_NOTICE_DAYS} days.`,
          "",
          `To keep your account, simply sign in before then: ${login}`,
          "",
          "Laya (Owner), Grievance Officer, Ekotsa · admin@ekotsa.com · +91 8544260088",
        ].join("\n"),
      });
      await sequelize.query(`UPDATE users SET "inactivityNoticeSentAt" = NOW() WHERE id = :id`, {
        replacements: { id: user.id },
      });
      noticesSent++;
    } catch (error) {
      // Without a delivered notice the account is not erased; it will be retried tomorrow.
      console.error("[retention] inactivity notice failed", error);
    }
  }

  let accountsErased = 0;
  for (const user of toDelete) {
    try {
      // FKs cascade to devices, sessions and codes; registrations are unlinked (SET NULL).
      await sequelize.query(`DELETE FROM users WHERE id = :id AND role = 'USER'`, { replacements: { id: user.id } });
      accountsErased++;
    } catch (error) {
      console.error("[retention] account erasure failed", user.id, error);
    }
  }
  return { noticesSent, accountsErased };
}

export const RetentionService = {
  policies: () => TASKS.map((t) => ({ name: t.name, policy: t.policy })),

  async run(input: { dryRun?: boolean } = {}) {
    const dryRun = Boolean(input.dryRun);
    const results: Record<string, number> = {};

    // Child submissions without guardian approval (7 days).
    if (dryRun) {
      results.guardian_requests_expired = await count(
        "consent_records",
        `"guardianStatus" = 'PENDING' AND "guardianTokenExpiresAt" <= NOW()`,
      );
    } else {
      results.guardian_requests_expired = (await PrivacyService.purgeExpiredGuardianRequests()).erased;
    }

    // Registrations: also remove their download history/links before the registration row itself.
    if (!dryRun) {
      const regWhere = TASKS.find((t) => t.name === "download_registrations")!.where;
      await sequelize.query(
        `DELETE FROM download_events WHERE "registrationId" IN (SELECT id FROM customer_registrations WHERE ${regWhere})`,
      );
      await sequelize.query(
        `DELETE FROM download_authorizations WHERE "registrationId" IN (SELECT id FROM customer_registrations WHERE ${regWhere})`,
      );
    }

    for (const task of TASKS) {
      results[task.name] = dryRun ? await count(task.table, task.where) : await remove(task.table, task.where);
    }

    const inactive = await handleInactiveAccounts(dryRun);
    results.inactivity_notices_sent = inactive.noticesSent;
    results.inactive_accounts_erased = inactive.accountsErased;

    const requests = await PrivacyRequestsService.dailyMaintenance(dryRun);
    results.unconfirmed_privacy_requests_discarded = requests.unconfirmedDiscarded;
    results.privacy_requests_due_soon_or_overdue = requests.dueSoonOrOverdue;

    const ranAt = new Date().toISOString();
    if (!dryRun) {
      // Evidence of each run (counts only, no personal data).
      await AuditLog.create({
        actorRole: null,
        event: "retention.run",
        severity: "info",
        metaJson: JSON.stringify({ results, ranAt }),
      }).catch((error) => console.error("[retention] audit log failed", error));
    }
    return { dryRun, results, ranAt };
  },
};
