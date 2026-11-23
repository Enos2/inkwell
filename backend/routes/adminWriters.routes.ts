// Location: backend/routes/adminWriters.routes.ts
// Purpose: The admin addresses for writer applications under
// /api/admin/writers. An admin needs the APPROVE_WRITERS ability, which the
// Super Admin can switch off for one specific person.

import { Router } from "express";
import { logQuerySchema, userIdParamSchema } from "../validators/admin.validator";
import {
  authenticate,
  getAuthUser,
  requireAdmin,
  requirePermission,
} from "../middleware/auth";
import {
  listApplications,
  reviewApplication,
} from "../services/writer.service";
import { asyncHandler } from "../utils/asyncHandler";

export const adminWritersRouter = Router();

adminWritersRouter.use(
  authenticate,
  requireAdmin,
  requirePermission("APPROVE_WRITERS")
);

adminWritersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit } = logQuerySchema.parse(req.query);
    res.json(await listApplications(page, limit));
  })
);

adminWritersRouter.post(
  "/:userId/approve",
  asyncHandler(async (req, res) => {
    const { userId } = userIdParamSchema.parse(req.params);
    res.json(await reviewApplication(getAuthUser(res).id, userId, "APPROVE"));
  })
);

adminWritersRouter.post(
  "/:userId/reject",
  asyncHandler(async (req, res) => {
    const { userId } = userIdParamSchema.parse(req.params);
    res.json(await reviewApplication(getAuthUser(res).id, userId, "REJECT"));
  })
);

// Location: backend/routes/adminWriters.routes.ts
// End of file: adminWriters.routes.ts