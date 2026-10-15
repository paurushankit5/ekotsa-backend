import { sequelize } from "../sequelize.js";
import { initUserModel, User } from "./User.js";
import { initPasswordResetOtpModel, PasswordResetOtp } from "./PasswordResetOtp.js";
import { initDeviceModel, Device } from "./Device.js";
import { initDeviceAuthTokenModel, DeviceAuthToken } from "./DeviceAuthToken.js";
import { initActivationSessionModel, ActivationSession } from "./ActivationSession.js";
import { initLicenseGrantModel, LicenseGrant } from "./LicenseGrant.js";
import { initOrganizationModel, Organization } from "./Organization.js";
import {
  initCustomerRegistrationModel,
  CustomerRegistration,
} from "./CustomerRegistration.js";
import {
  initDownloadAuthorizationModel,
  DownloadAuthorization,
} from "./DownloadAuthorization.js";
import { initDownloadEventModel, DownloadEvent } from "./DownloadEvent.js";
import {
  initPaymentSubmissionModel,
  PaymentSubmission,
} from "./PaymentSubmission.js";
import { initRecoveryRequestModel, RecoveryRequest } from "./RecoveryRequest.js";
import { initRecoveryArtifactModel, RecoveryArtifact } from "./RecoveryArtifact.js";
import {
  initDeviceResetRequestModel,
  DeviceResetRequest,
} from "./DeviceResetRequest.js";
import { initAuditLogModel, AuditLog } from "./AuditLog.js";
import { initContactLeadModel, ContactLead } from "./ContactLead.js";
import {
  initNotificationOutboxModel,
  NotificationOutbox,
} from "./NotificationOutbox.js";
import { initActivationCodeModel, ActivationCode } from "./ActivationCode.js";
import { initCmsArticleModel, CmsArticle } from "./CmsArticle.js";
import { initCmsPageModel, CmsPage } from "./CmsPage.js";
import { initCmsProductModel, CmsProduct } from "./CmsProduct.js";
import {
  initCmsMenuItemModel,
  initCmsMenuModel,
  CmsMenu,
  CmsMenuItem,
} from "./CmsMenu.js";
import { initCmsSettingModel, CmsSetting } from "./CmsSetting.js";
import { initCmsRedirectModel, CmsRedirect } from "./CmsRedirect.js";
import { initCmsAssetModel, CmsAsset } from "./CmsAsset.js";
import { initCmsRevisionModel, CmsRevision } from "./CmsRevision.js";
import { initCmsPreviewTokenModel, CmsPreviewToken } from "./CmsPreviewToken.js";
import {
  initCmsWorkflowActionModel,
  CmsWorkflowAction,
} from "./CmsWorkflowAction.js";
import {
  initCmsRoleAssignmentModel,
  CmsRoleAssignment,
} from "./CmsRoleAssignment.js";
import {
  initGoogleOAuthTransactionModel,
  GoogleOAuthTransaction,
} from "./GoogleOAuthTransaction.js";
import { initAppReleaseModel, AppRelease } from "./AppRelease.js";

initUserModel(sequelize);
initPasswordResetOtpModel(sequelize);
initDeviceModel(sequelize);
initDeviceAuthTokenModel(sequelize);
initActivationSessionModel(sequelize);
initLicenseGrantModel(sequelize);
initActivationCodeModel(sequelize);
initOrganizationModel(sequelize);
initCustomerRegistrationModel(sequelize);
initDownloadAuthorizationModel(sequelize);
initDownloadEventModel(sequelize);
initPaymentSubmissionModel(sequelize);
initRecoveryRequestModel(sequelize);
initRecoveryArtifactModel(sequelize);
initDeviceResetRequestModel(sequelize);
initAuditLogModel(sequelize);
initContactLeadModel(sequelize);
initNotificationOutboxModel(sequelize);
initCmsArticleModel(sequelize);
initCmsPageModel(sequelize);
initCmsProductModel(sequelize);
initCmsMenuModel(sequelize);
initCmsMenuItemModel(sequelize);
initCmsSettingModel(sequelize);
initCmsRedirectModel(sequelize);
initCmsAssetModel(sequelize);
initCmsRevisionModel(sequelize);
initCmsPreviewTokenModel(sequelize);
initCmsWorkflowActionModel(sequelize);
initCmsRoleAssignmentModel(sequelize);
initGoogleOAuthTransactionModel(sequelize);
initAppReleaseModel(sequelize);

User.hasMany(PasswordResetOtp, { foreignKey: "userId", as: "resetOtps" });
PasswordResetOtp.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasMany(Device, { foreignKey: "userId", as: "devices" });
Device.belongsTo(User, { foreignKey: "userId", as: "user" });

Device.hasMany(DeviceAuthToken, { foreignKey: "deviceId", as: "tokens" });
DeviceAuthToken.belongsTo(Device, { foreignKey: "deviceId", as: "device" });

User.hasMany(ActivationSession, { foreignKey: "userId", as: "activationSessions" });
ActivationSession.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasMany(LicenseGrant, { foreignKey: "userId", as: "licenseGrants" });
LicenseGrant.belongsTo(User, { foreignKey: "userId", as: "user" });

Device.hasMany(LicenseGrant, { foreignKey: "deviceId", as: "licenseGrants" });
LicenseGrant.belongsTo(Device, { foreignKey: "deviceId", as: "device" });

User.hasMany(Organization, { foreignKey: "createdByUserId", as: "ownedOrganizations" });
Organization.belongsTo(User, { foreignKey: "createdByUserId", as: "createdBy" });

Organization.hasMany(CustomerRegistration, {
  foreignKey: "organizationId",
  as: "registrations",
});
CustomerRegistration.belongsTo(Organization, {
  foreignKey: "organizationId",
  as: "organization",
});

User.hasOne(CustomerRegistration, { foreignKey: "linkedUserId", as: "registration" });
CustomerRegistration.belongsTo(User, { foreignKey: "linkedUserId", as: "linkedUser" });

User.hasMany(DownloadAuthorization, { foreignKey: "userId", as: "downloadAuthorizations" });
DownloadAuthorization.belongsTo(User, { foreignKey: "userId", as: "user" });

CustomerRegistration.hasMany(DownloadAuthorization, {
  foreignKey: "registrationId",
  as: "downloadAuthorizations",
});
DownloadAuthorization.belongsTo(CustomerRegistration, {
  foreignKey: "registrationId",
  as: "registration",
});

User.hasMany(DownloadEvent, { foreignKey: "userId", as: "downloadEvents" });
DownloadEvent.belongsTo(User, { foreignKey: "userId", as: "user" });

CustomerRegistration.hasMany(DownloadEvent, {
  foreignKey: "registrationId",
  as: "downloadEvents",
});
DownloadEvent.belongsTo(CustomerRegistration, {
  foreignKey: "registrationId",
  as: "registration",
});

User.hasMany(PaymentSubmission, { foreignKey: "userId", as: "payments" });
PaymentSubmission.belongsTo(User, { foreignKey: "userId", as: "user" });

CustomerRegistration.hasMany(PaymentSubmission, {
  foreignKey: "registrationId",
  as: "payments",
});
PaymentSubmission.belongsTo(CustomerRegistration, {
  foreignKey: "registrationId",
  as: "registration",
});

Organization.hasMany(PaymentSubmission, {
  foreignKey: "organizationId",
  as: "payments",
});
PaymentSubmission.belongsTo(Organization, {
  foreignKey: "organizationId",
  as: "organization",
});

User.hasMany(RecoveryRequest, { foreignKey: "userId", as: "recoveryRequests" });
RecoveryRequest.belongsTo(User, { foreignKey: "userId", as: "user" });
RecoveryRequest.belongsTo(Device, { foreignKey: "deviceId", as: "device" });
RecoveryRequest.belongsTo(LicenseGrant, { foreignKey: "grantId", as: "grant" });
RecoveryRequest.belongsTo(RecoveryArtifact, { foreignKey: "artifactId", as: "artifact" });

User.hasMany(RecoveryArtifact, { foreignKey: "userId", as: "recoveryArtifacts" });
RecoveryArtifact.belongsTo(User, { foreignKey: "userId", as: "user" });
RecoveryArtifact.belongsTo(Device, { foreignKey: "deviceId", as: "device" });
RecoveryArtifact.belongsTo(LicenseGrant, { foreignKey: "grantId", as: "grant" });

User.hasMany(DeviceResetRequest, { foreignKey: "userId", as: "deviceResetRequests" });
DeviceResetRequest.belongsTo(User, { foreignKey: "userId", as: "user" });
DeviceResetRequest.belongsTo(Device, { foreignKey: "deviceId", as: "device" });

User.hasMany(ActivationCode, { foreignKey: "redeemedByUserId", as: "redeemedCodes" });
ActivationCode.belongsTo(User, { foreignKey: "redeemedByUserId", as: "redeemedBy" });

User.hasOne(CmsRoleAssignment, { foreignKey: "userId", as: "cmsRoleAssignment" });
CmsRoleAssignment.belongsTo(User, { foreignKey: "userId", as: "user" });

User.hasMany(GoogleOAuthTransaction, { foreignKey: "userId", as: "googleOAuthTransactions" });
GoogleOAuthTransaction.belongsTo(User, { foreignKey: "userId", as: "user" });

CmsMenu.hasMany(CmsMenuItem, { foreignKey: "menuId", as: "items", onDelete: "CASCADE" });
CmsMenuItem.belongsTo(CmsMenu, { foreignKey: "menuId", as: "menu" });

export {
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
  RecoveryRequest,
  RecoveryArtifact,
  DeviceResetRequest,
  AuditLog,
  ContactLead,
  NotificationOutbox,
  CmsArticle,
  CmsPage,
  CmsProduct,
  CmsMenu,
  CmsMenuItem,
  CmsSetting,
  CmsRedirect,
  CmsAsset,
  CmsRevision,
  CmsPreviewToken,
  CmsWorkflowAction,
  CmsRoleAssignment,
  GoogleOAuthTransaction,
  AppRelease,
};
export type { UserRole } from "./User.js";
export type { DeviceStatus } from "./Device.js";
export type { LicenseGrantStatus } from "./LicenseGrant.js";
export type { OrganizationStatus } from "./Organization.js";
export type { RegistrationStatus } from "./CustomerRegistration.js";
export type { PaymentStatus } from "./PaymentSubmission.js";
export type { RecoveryRequestStatus } from "./RecoveryRequest.js";
export type { DeviceResetRequestStatus } from "./DeviceResetRequest.js";
export type { NotificationOutboxStatus } from "./NotificationOutbox.js";
export type { CmsArticleKind, CmsContentStatus } from "./CmsArticle.js";
export type { CmsProductDbStatus } from "./CmsProduct.js";
export type { CmsMenuLocation } from "./CmsMenu.js";
export type { CmsAssetKind } from "./CmsAsset.js";
export type { CmsRoleName } from "./CmsRoleAssignment.js";
export type { AppReleaseStatus, AppReleasePlatform } from "./AppRelease.js";
