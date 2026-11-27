// Project: Inkwell
// Location: backend/routes/challenge.routes.ts
// Purpose: The writing challenge addresses under /api/challenges. Anyone can
// list challenges and see one with its entries. An approved writer can enter
// one of their own stories in a running challenge and withdraw it again.

import { Router } from "express";
import { authenticate, getAuthUser } from "../middleware/auth";
import {
  enterChallenge,
  getChallengeBySlug,
  listChallenges,
  withdrawEntry,
} from "../services/challenge.service";
import {
  challengeEntryParamsSchema,
  challengeSlugParamSchema,
  enterChallengeSchema,
  listChallengesQuerySchema,
} from "../validators/challenge.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const challengeRouter = Router();

challengeRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listChallengesQuerySchema.parse(req.query);
    res.json(await listChallenges(query));
  })
);

challengeRouter.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const { slug } = challengeSlugParamSchema.parse(req.params);
    res.json(await getChallengeBySlug(slug));
  })
);

challengeRouter.post(
  "/:slug/entries",
  authenticate,
  asyncHandler(async (req, res) => {
    const { slug } = challengeSlugParamSchema.parse(req.params);
    const { storyId } = enterChallengeSchema.parse(req.body);
    res
      .status(201)
      .json(await enterChallenge(getAuthUser(res), slug, storyId));
  })
);

challengeRouter.delete(
  "/:slug/entries/:storyId",
  authenticate,
  asyncHandler(async (req, res) => {
    const { slug, storyId } = challengeEntryParamsSchema.parse(req.params);
    res.json(await withdrawEntry(getAuthUser(res), slug, storyId));
  })
);

// Location: backend/routes/challenge.routes.ts
// End of file: challenge.routes.ts