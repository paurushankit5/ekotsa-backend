import { CmsRoleAssignment, User } from "../../db/models/index.js";
import type { CmsRoleName } from "../../db/models/CmsRoleAssignment.js";
import { AppError } from "../../middleware/errorHandler.js";
import {
  hasCmsPermission,
  type CmsPermission,
} from "./cms.workflow.js";

export async function getCmsRoleForUser(
  userId: string,
): Promise<CmsRoleName | "USER" | null> {
  const assignment = await CmsRoleAssignment.findOne({ where: { userId } });
  if (assignment) return assignment.role;

  const user = await User.findByPk(userId, { attributes: ["id", "role"] });
  if (!user) return null;
  return user.role === "ADMIN" ? "ADMIN" : "USER";
}

export async function userHasCmsPermission(
  userId: string,
  permission: CmsPermission,
): Promise<boolean> {
  const role = await getCmsRoleForUser(userId);
  if (!role) return false;
  return hasCmsPermission(role, permission);
}

export async function requireCmsPermission(
  userId: string,
  permission: CmsPermission,
): Promise<void> {
  const ok = await userHasCmsPermission(userId, permission);
  if (!ok) {
    throw new AppError(403, `CMS permission denied: ${permission}`, "CMS_PERMISSION_DENIED");
  }
}
