// Project: Inkwell
// Location: backend/routes/adminChallenges.routes.ts
// Purpose: The admin challenge addresses under /api/admin/challenges. They need
// the MANAGE_CHALLENGES ability, which the Super Admin can switch off for one
// specific admin. Create, edit and delete a challenge, and mark or unmark a
// winning entry.

import { Router } from "express";
import {
  authenticate,
  getAuthUser,
  requireAdmin,
  requirePermission,
} from "../middleware/auth";
import {
  createChallenge,
  deleteChallenge,
  setEntryWinner,
  updateChallenge,
} from "../services/challenge.service";
import {
  adminEntryParamsSchema,
  challengeIdParamSchema,
  createChallengeSchema,
  setWinnerSchema,
  updateChallengeSchema,
} from "../validators/challenge.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const adminChallengesRouter = Router();

adminChallengesRouter.use(
  authenticate,
  requireAdmin,
  requirePermission("MANAGE_CHALLENGES")
);

adminChallengesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createChallengeSchema.parse(req.body);
    res.status(201).json(await createChallenge(getAuthUser(res), input));
  })
);

adminChallengesRouter.patch(
  "/:challengeId",
  asyncHandler(async (req, res) => {
    const { challengeId } = challengeIdParamSchema.parse(req.params);
    const input = updateChallengeSchema.parse(req.body);
    res.json(await updateChallenge(getAuthUser(res), challengeId, input));
  })
);

adminChallengesRouter.delete(
  "/:challengeId",
  asyncHandler(async (req, res) => {
    const { challengeId } = challengeIdParamSchema.parse(req.params);
    res.json(await deleteChallenge(getAuthUser(res), challengeId));
  })
);

adminChallengesRouter.put(
  "/:challengeId/entries/:storyId/winner",
  asyncHandler(async (req, res) => {
    const { challengeId, storyId } = adminEntryParamsSchema.parse(req.params);
    const { isWinner } = setWinnerSchema.parse(req.body);
    res.json(
      await setEntryWinner(getAuthUser(res), challengeId, storyId, isWinner)
    );
  })
);

// Location: backend/routes/adminChallenges.routes.ts
// End of file: adminChallenges.routes.ts