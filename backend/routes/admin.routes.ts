// Location: backend/routes/admin.routes.ts
// Purpose: The admin addresses under /api/admin. Anyone who is an admin can see
// the ability list and (with permission) the activity log. Only the Super Admin
// can list, promote, demote and remove admins, or switch a single ability on or
// off for one admin.

import { Router } from "express";
import {
  PERMISSION_DESCRIPTIONS,
  PERMISSION_LIST,
  RANK_DEFAULTS,
} from "../config/permissions";
import {
  changeRankSchema,
  logQuerySchema,
  overrideBodySchema,
  permissionParamSchema,
  promoteSchema,
  userIdParamSchema,
} from "../validators/admin.validator";
import {
  changeRank,
  clearPermissionOverride,
  listAdmins,
  listLogs,
  promoteUser,
  removeAdmin,
  setPermissionOverride,
} from "../services/admin.service";
import {
  authenticate,
  getAuthUser,
  requireAdmin,
  requirePermission,
  requireSuperAdmin,
} from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const adminRouter = Router();

// Every address in this file needs a logged-in admin.
adminRouter.use(authenticate, requireAdmin);

// The list of all abilities and what each rank gets by default.
adminRouter.get("/permissions", (_req, res) => {
  res.json({
    permissions: PERMISSION_LIST.map((name) => ({
      name,
      description: PERMISSION_DESCRIPTIONS[name],
    })),
    rankDefaults: RANK_DEFAULTS,
  });
});

adminRouter.get(
  "/logs",
  requirePermission("VIEW_ACTIVITY_LOG"),
  asyncHandler(async (req, res) => {
    const { page, limit } = logQuerySchema.parse(req.query);
    res.json(await listLogs(page, limit));
  })
);

// ---- Super Admin only below this line ----

adminRouter.get(
  "/admins",
  requireSuperAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ admins: await listAdmins() });
  })
);

adminRouter.post(
  "/admins",
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const input = promoteSchema.parse(req.body);
    const admin = await promoteUser(getAuthUser(res).id, input);
    res.status(201).json({ admin });
  })
);

adminRouter.patch(
  "/admins/:userId/rank",
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { userId } = userIdParamSchema.parse(req.params);
    const { rank } = changeRankSchema.parse(req.body);
    const admin = await changeRank(getAuthUser(res).id, userId, rank);
    res.json({ admin });
  })
);

adminRouter.delete(
  "/admins/:userId",
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { userId } = userIdParamSchema.parse(req.params);
    res.json(await removeAdmin(getAuthUser(res).id, userId));
  })
);

adminRouter.put(
  "/admins/:userId/permissions/:permission",
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { userId, permission } = permissionParamSchema.parse(req.params);
    const { allowed } = overrideBodySchema.parse(req.body);
    const admin = await setPermissionOverride(
      getAuthUser(res).id,
      userId,
      permission,
      allowed
    );
    res.json({ admin });
  })
);

adminRouter.delete(
  "/admins/:userId/permissions/:permission",
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { userId, permission } = permissionParamSchema.parse(req.params);
    const admin = await clearPermissionOverride(
      getAuthUser(res).id,
      userId,
      permission
    );
    res.json({ admin });
  })
);

// Location: backend/routes/admin.routes.ts
// End of file: admin.routes.ts