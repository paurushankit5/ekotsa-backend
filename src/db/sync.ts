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

async function sync() {
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
  console.log("[ekotsa-backend] database synced");
  await sequelize.close();
}

sync().catch(async (error) => {
  console.error("[ekotsa-backend] database sync failed", error);
  await sequelize.close().catch(() => undefined);
  process.exit(1);
});
