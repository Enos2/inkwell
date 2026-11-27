// Project: Inkwell
// Location: backend/routes/adminDashboard.routes.ts
// Purpose: The address GET /api/admin/dashboard. Any admin who can open the
// admin panel sees the site numbers. The money section inside is only included
// for the Super Admin.

import { Router } from "express";
import {
  authenticate,
  getAuthUser,
  requireAdmin,
  requirePermission,
} from "../middleware/auth";
import { getDashboard } from "../services/adminDashboard.service";
import { asyncHandler } from "../utils/asyncHandler";

export const adminDashboardRouter = Router();

adminDashboardRouter.use(
  authenticate,
  requireAdmin,
  requirePermission("VIEW_ADMIN_PANEL")
);

adminDashboardRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await getDashboard(getAuthUser(res)));
  })
);

// Location: backend/routes/adminDashboard.routes.ts
// End of file: adminDashboard.routes.ts