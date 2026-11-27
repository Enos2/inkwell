// Project: Inkwell
// Location: backend/config/permissions.ts
// Purpose: The list of every ability an admin can have, and which abilities each
// admin rank gets by default. The Super Admin can then switch single abilities
// on or off for one specific admin (stored in the database as "overrides").
// Managing admins (promote, demote, switches) is NOT in this list on purpose:
// only the Super Admin can ever do it.

import type { AdminRank } from "@prisma/client";

export const PERMISSION_LIST = [
  "VIEW_ADMIN_PANEL",
  "FEATURE_STORIES",
  "HIDE_STORIES",
  "DELETE_STORIES",
  "HIDE_COMMENTS",
  "SUSPEND_USERS",
  "BAN_USERS",
  "APPROVE_WRITERS",
  "VIEW_REPORTS",
  "RESOLVE_REPORTS",
  "MANAGE_ADS",
  "TOGGLE_ADSENSE",
  "VIEW_ACTIVITY_LOG",
  "MANAGE_CHALLENGES",
] as const;

export type Permission = (typeof PERMISSION_LIST)[number];

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  VIEW_ADMIN_PANEL: "Open the admin panel",
  FEATURE_STORIES: "Feature stories on the home page",
  HIDE_STORIES: "Hide stories",
  DELETE_STORIES: "Delete stories",
  HIDE_COMMENTS: "Hide or remove comments",
  SUSPEND_USERS: "Temporarily suspend users",
  BAN_USERS: "Ban users",
  APPROVE_WRITERS: "Approve writer applications",
  VIEW_REPORTS: "See reported content",
  RESOLVE_REPORTS: "Resolve or dismiss reports",
  MANAGE_ADS: "Create, edit and remove ads",
  TOGGLE_ADSENSE: "Turn Google AdSense on or off",
  VIEW_ACTIVITY_LOG: "See the admin activity log",
  MANAGE_CHALLENGES: "Create writing challenges and pick winners",
};

// The ranks the Super Admin is allowed to hand out. SUPER_ADMIN is not here:
// there is only one, and it can never be given away through the API.
export const ASSIGNABLE_RANKS = [
  "SENIOR_ADMIN",
  "AD_MANAGER",
  "MODERATOR",
  "EDITOR",
  "SUPPORT",
] as const;

export const RANK_DEFAULTS: Record<AdminRank, readonly Permission[]> = {
  SUPER_ADMIN: PERMISSION_LIST,
  SENIOR_ADMIN: [
    "VIEW_ADMIN_PANEL",
    "FEATURE_STORIES",
    "HIDE_STORIES",
    "DELETE_STORIES",
    "HIDE_COMMENTS",
    "SUSPEND_USERS",
    "BAN_USERS",
    "APPROVE_WRITERS",
    "VIEW_REPORTS",
    "RESOLVE_REPORTS",
    "VIEW_ACTIVITY_LOG",
    "MANAGE_CHALLENGES",
  ],
  AD_MANAGER: ["VIEW_ADMIN_PANEL", "MANAGE_ADS", "TOGGLE_ADSENSE"],
  MODERATOR: [
    "VIEW_ADMIN_PANEL",
    "HIDE_STORIES",
    "HIDE_COMMENTS",
    "SUSPEND_USERS",
    "BAN_USERS",
    "VIEW_REPORTS",
    "RESOLVE_REPORTS",
  ],
  EDITOR: [
    "VIEW_ADMIN_PANEL",
    "FEATURE_STORIES",
    "APPROVE_WRITERS",
    "MANAGE_CHALLENGES",
  ],
  SUPPORT: ["VIEW_ADMIN_PANEL", "VIEW_REPORTS"],
};

// Location: backend/config/permissions.ts
// End of file: permissions.ts