import "dotenv/config";
import {
  sequelize,
  User,
  PasswordResetOtp,
  Device,
  DeviceAuthToken,
  ActivationSession,
  LicenseGrant,
  ActivationCode,
  Organization,
  CustomerRegistration,
  DownloadAuthorization,
  DownloadEvent,
  PaymentSubmission,
} from "./models/index.js";

/**
 * @deprecated Prefer `npm run db:migrate`.
 *
 * `sequelize.sync({ alter: true })` compares every model to the live DB and emits
 * ALTER/CREATE statements for drift. That is useful for empty local bootstrap only —
 * it is not a migration system, re-touches already-correct schema, and can be
 * destructive on production (type changes, drop/recreate edge cases).
 *
 * Use versioned files in `src/db/migrations/` instead.
 */
async function sync() {
  console.warn(
    "[ekotsa-backend] WARNING: db:sync uses sequelize.sync({ alter: true }). Prefer npm run db:migrate.",
  );
  void User;
  void PasswordResetOtp;
  void Device;
  void DeviceAuthToken;
  void ActivationSession;
  void LicenseGrant;
  void ActivationCode;
  void Organization;
  void CustomerRegistration;
  void DownloadAuthorization;
  void DownloadEvent;
  void PaymentSubmission;
  await sequelize.sync({ alter: true });
  console.log("[ekotsa-backend] database synced (legacy path)");
  await sequelize.close();
}

sync().catch(async (error) => {
  console.error("[ekotsa-backend] database sync failed", error);
  await sequelize.close().catch(() => undefined);
  process.exit(1);
});
