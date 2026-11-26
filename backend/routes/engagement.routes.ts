// Project: Inkwell
// Location: backend/routes/engagement.routes.ts
// Purpose: The streak and badge addresses under /api/engagement. GET /me (needs
// a login) gives your reading streak and every badge, earned or locked. GET
// /users/:username/badges (anyone) lists the badges a person has earned.

import { Router } from "express";
import { authenticate, getAuthUser } from "../middleware/auth";
import {
  getMyEngagement,
  getUserBadges,
} from "../services/engagement.service";
import { usernameParamSchema } from "../validators/social.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const engagementRouter = Router();

engagementRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (_req, res) => {
    res.json(await getMyEngagement(getAuthUser(res)));
  })
);

engagementRouter.get(
  "/users/:username/badges",
  asyncHandler(async (req, res) => {
    const { username } = usernameParamSchema.parse(req.params);
    res.json(await getUserBadges(username));
  })
);

// Location: backend/routes/engagement.routes.ts
// End of file: engagement.routes.ts