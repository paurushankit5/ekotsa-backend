import type { CmsRoleName } from "../../db/models/CmsRoleAssignment.js";

export type CmsPermission =
  | "cms.read"
  | "cms.create"
  | "cms.edit"
  | "cms.submit_review"
  | "cms.review"
  | "cms.approve"
  | "cms.publish"
  | "cms.schedule"
  | "cms.unpublish"
  | "cms.archive"
  | "cms.delete"
  | "cms.restore"
  | "cms.revisions.read"
  | "cms.preview.create"
  | "cms.preview.revoke"
  | "cms.media.read"
  | "cms.media.upload"
  | "cms.media.edit"
  | "cms.media.delete"
  | "cms.seo.edit"
  | "cms.navigation.edit"
  | "cms.redirects.manage"
  | "cms.settings.edit"
  | "cms.legal.review"
  | "cms.legal.publish"
  | "cms.audit.read";

export type CmsWorkflowState =
  | "DRAFT"
  | "IN_REVIEW"
  | "CHANGES_REQUESTED"
  | "APPROVED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "UNPUBLISHED"
  | "ARCHIVED";

export type CmsWorkflowActionName =
  | "submit_review"
  | "request_changes"
  | "approve"
  | "schedule"
  | "publish"
  | "cancel_schedule"
  | "unpublish"
  | "archive";

export const cmsTransitionMap: Record<CmsWorkflowState, CmsWorkflowState[]> = {
  DRAFT: ["IN_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "ARCHIVED"],
  IN_REVIEW: ["CHANGES_REQUESTED", "APPROVED", "ARCHIVED"],
  CHANGES_REQUESTED: ["DRAFT", "IN_REVIEW", "ARCHIVED"],
  APPROVED: ["SCHEDULED", "PUBLISHED", "IN_REVIEW", "CHANGES_REQUESTED", "ARCHIVED"],
  SCHEDULED: ["APPROVED", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT", "UNPUBLISHED", "ARCHIVED"],
  UNPUBLISHED: ["PUBLISHED", "ARCHIVED", "DRAFT"],
  ARCHIVED: [],
};

const ALL_CMS_PERMISSIONS: CmsPermission[] = [
  "cms.read",
  "cms.create",
  "cms.edit",
  "cms.submit_review",
  "cms.review",
  "cms.approve",
  "cms.publish",
  "cms.schedule",
  "cms.unpublish",
  "cms.archive",
  "cms.delete",
  "cms.restore",
  "cms.revisions.read",
  "cms.preview.create",
  "cms.preview.revoke",
  "cms.media.read",
  "cms.media.upload",
  "cms.media.edit",
  "cms.media.delete",
  "cms.seo.edit",
  "cms.navigation.edit",
  "cms.redirects.manage",
  "cms.settings.edit",
  "cms.legal.review",
  "cms.legal.publish",
  "cms.audit.read",
];

const rolePermissions: Record<CmsRoleName, CmsPermission[]> = {
  AUTHOR: [
    "cms.read",
    "cms.create",
    "cms.edit",
    "cms.submit_review",
    "cms.revisions.read",
    "cms.preview.create",
  ],
  EDITOR: [
    "cms.read",
    "cms.create",
    "cms.edit",
    "cms.submit_review",
    "cms.review",
    "cms.revisions.read",
    "cms.seo.edit",
  ],
  REVIEWER: ["cms.read", "cms.review", "cms.revisions.read", "cms.seo.edit", "cms.legal.review"],
  PUBLISHER: [
    "cms.read",
    "cms.review",
    "cms.approve",
    "cms.publish",
    "cms.schedule",
    "cms.unpublish",
    "cms.archive",
    "cms.restore",
    "cms.revisions.read",
    "cms.redirects.manage",
    "cms.settings.edit",
    "cms.navigation.edit",
    "cms.legal.publish",
  ],
  SEO_MANAGER: ["cms.read", "cms.revisions.read", "cms.seo.edit"],
  MEDIA_MANAGER: [
    "cms.read",
    "cms.media.read",
    "cms.media.upload",
    "cms.media.edit",
    "cms.media.delete",
  ],
  LEGAL_REVIEWER: ["cms.read", "cms.legal.review", "cms.revisions.read"],
  AUDITOR: ["cms.read", "cms.revisions.read", "cms.audit.read"],
  ADMIN: ALL_CMS_PERMISSIONS,
  SUPER_ADMIN: ALL_CMS_PERMISSIONS,
};

export function hasCmsPermission(
  role: CmsRoleName | "USER",
  permission: CmsPermission,
): boolean {
  if (role === "USER") return false;
  return rolePermissions[role]?.includes(permission) ?? false;
}

export function canTransitionCmsState(from: CmsWorkflowState, to: CmsWorkflowState): boolean {
  return cmsTransitionMap[from]?.includes(to) ?? false;
}

export function getCmsWorkflowActionTarget(action: CmsWorkflowActionName): CmsWorkflowState {
  switch (action) {
    case "submit_review":
      return "IN_REVIEW";
    case "request_changes":
      return "CHANGES_REQUESTED";
    case "approve":
      return "APPROVED";
    case "schedule":
      return "SCHEDULED";
    case "publish":
      return "PUBLISHED";
    case "cancel_schedule":
      return "APPROVED";
    case "unpublish":
      return "UNPUBLISHED";
    case "archive":
      return "ARCHIVED";
  }
}

export function getCmsWorkflowActionPermission(action: CmsWorkflowActionName): CmsPermission {
  switch (action) {
    case "submit_review":
      return "cms.submit_review";
    case "request_changes":
    case "approve":
      return "cms.review";
    case "schedule":
      return "cms.schedule";
    case "publish":
      return "cms.publish";
    case "cancel_schedule":
    case "unpublish":
    case "archive":
      return "cms.publish";
  }
}
