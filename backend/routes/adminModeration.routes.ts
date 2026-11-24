// Location: backend/routes/adminModeration.routes.ts
// Purpose: The admin moderation addresses under /api/admin/moderation. Each
// address needs its own ability: VIEW_REPORTS and RESOLVE_REPORTS for the report
// queue, HIDE_STORIES and FEATURE_STORIES for stories, and SUSPEND_USERS and
// BAN_USERS for people. The Super Admin can switch any of these off for one
// specific admin. Restoring a user checks the right ability inside the service.

import { Router } from "express";
import type { RequestHandler } from "express";
import type { Permission } from "../config/permissions";
import {
  authenticate,
  getAuthUser,
  requireAdmin,
  requirePermission,
} from "../middleware/auth";
import { userHasPermission } from "../services/permission.service";
import {
  listReports,
  resolveReport,
} from "../services/report.service";
import {
  banUser,
  featureStory,
  hideStory,
  listUsers,
  restoreUser,
  suspendUser,
  unfeatureStory,
  unhideStory,
} from "../services/moderation.service";
import { userIdParamSchema } from "../validators/admin.validator";
import { storyIdParamSchema } from "../validators/story.validator";
import {
  adminListReportsQuerySchema,
  adminUsersQuerySchema,
  reasonSchema,
  reportIdParamSchema,
  resolveReportSchema,
  suspendUserSchema,
} from "../validators/moderation.validator";
import { AppError } from "../utils/errors";
import { asyncHandler } from "../utils/asyncHandler";

export const adminModerationRouter = Router();

adminModerationRouter.use(authenticate, requireAdmin);

// Lets a person through if they have AT LEAST ONE of the listed abilities.
function requireAnyPermission(permissions: Permission[]): RequestHandler {
  return asyncHandler(async (_req, res, next) => {
    const user = getAuthUser(res);
    for (const permission of permissions) {
      if (await userHasPermission(user.id, user.adminRank, permission)) {
        next();
        return;
      }
    }
    throw new AppError("You do not have permission to do this", 403);
  });
}

// ---- Reports ----

adminModerationRouter.get(
  "/reports",
  requirePermission("VIEW_REPORTS"),
  asyncHandler(async (req, res) => {
    const query = adminListReportsQuerySchema.parse(req.query);
    res.json(await listReports(query));
  })
);

adminModerationRouter.post(
  "/reports/:reportId/resolve",
  requirePermission("RESOLVE_REPORTS"),
  asyncHandler(async (req, res) => {
    const { reportId } = reportIdParamSchema.parse(req.params);
    const input = resolveReportSchema.parse(req.body);
    res.json(await resolveReport(getAuthUser(res), reportId, input));
  })
);

// ---- Stories ----

adminModerationRouter.post(
  "/stories/:storyId/hide",
  requirePermission("HIDE_STORIES"),
  asyncHandler(async (req, res) => {
    const { storyId } = storyIdParamSchema.parse(req.params);
    const { reason } = reasonSchema.parse(req.body);
    res.json(await hideStory(getAuthUser(res), storyId, reason));
  })
);

adminModerationRouter.post(
  "/stories/:storyId/unhide",
  requirePermission("HIDE_STORIES"),
  asyncHandler(async (req, res) => {
    const { storyId } = storyIdParamSchema.parse(req.params);
    res.json(await unhideStory(getAuthUser(res), storyId));
  })
);

adminModerationRouter.post(
  "/stories/:storyId/feature",
  requirePermission("FEATURE_STORIES"),
  asyncHandler(async (req, res) => {
    const { storyId } = storyIdParamSchema.parse(req.params);
    res.json(await featureStory(getAuthUser(res), storyId));
  })
);

adminModerationRouter.post(
  "/stories/:storyId/unfeature",
  requirePermission("FEATURE_STORIES"),
  asyncHandler(async (req, res) => {
    const { storyId } = storyIdParamSchema.parse(req.params);
    res.json(await unfeatureStory(getAuthUser(res), storyId));
  })
);

// ---- Users ----

adminModerationRouter.get(
  "/users",
  requireAnyPermission(["SUSPEND_USERS", "BAN_USERS"]),
  asyncHandler(async (req, res) => {
    const query = adminUsersQuerySchema.parse(req.query);
    res.json(await listUsers(query));
  })
);

adminModerationRouter.post(
  "/users/:userId/suspend",
  requirePermission("SUSPEND_USERS"),
  asyncHandler(async (req, res) => {
    const { userId } = userIdParamSchema.parse(req.params);
    const input = suspendUserSchema.parse(req.body);
    res.json(await suspendUser(getAuthUser(res), userId, input));
  })
);

adminModerationRouter.post(
  "/users/:userId/ban",
  requirePermission("BAN_USERS"),
  asyncHandler(async (req, res) => {
    const { userId } = userIdParamSchema.parse(req.params);
    const { reason } = reasonSchema.parse(req.body);
    res.json(await banUser(getAuthUser(res), userId, reason));
  })
);

adminModerationRouter.post(
  "/users/:userId/restore",
  asyncHandler(async (req, res) => {
    const { userId } = userIdParamSchema.parse(req.params);
    res.json(await restoreUser(getAuthUser(res), userId));
  })
);

// Location: backend/routes/adminModeration.routes.ts
// End of file: adminModeration.routes.ts