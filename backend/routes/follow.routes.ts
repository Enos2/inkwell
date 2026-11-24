// Location: backend/routes/follow.routes.ts
// Purpose: The follow addresses under /api/follows, and the feed at /api/feed.
// PUT /api/follows/:userId follows a person and DELETE unfollows. Anyone can
// see the followers and following lists of a user. The feed needs a login.

import { Router } from "express";
import { authenticate, getAuthUser } from "../middleware/auth";
import {
  getOptionalUser,
  optionalAuthenticate,
} from "../middleware/optionalAuth";
import {
  followUser,
  getFeed,
  listFollowers,
  listFollowing,
  unfollowUser,
} from "../services/follow.service";
import { userIdParamSchema } from "../validators/admin.validator";
import {
  pageQuerySchema,
  usernameParamSchema,
} from "../validators/social.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const followRouter = Router();
export const feedRouter = Router();

followRouter.get(
  "/:username/followers",
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const { username } = usernameParamSchema.parse(req.params);
    const { page, limit } = pageQuerySchema.parse(req.query);
    res.json(await listFollowers(username, getOptionalUser(res), page, limit));
  })
);

followRouter.get(
  "/:username/following",
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const { username } = usernameParamSchema.parse(req.params);
    const { page, limit } = pageQuerySchema.parse(req.query);
    res.json(await listFollowing(username, getOptionalUser(res), page, limit));
  })
);

followRouter.put(
  "/:userId",
  authenticate,
  asyncHandler(async (req, res) => {
    const { userId } = userIdParamSchema.parse(req.params);
    res.json(await followUser(getAuthUser(res), userId));
  })
);

followRouter.delete(
  "/:userId",
  authenticate,
  asyncHandler(async (req, res) => {
    const { userId } = userIdParamSchema.parse(req.params);
    res.json(await unfollowUser(getAuthUser(res), userId));
  })
);

feedRouter.get(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const { page, limit } = pageQuerySchema.parse(req.query);
    res.json(await getFeed(getAuthUser(res), page, limit));
  })
);

// Location: backend/routes/follow.routes.ts
// End of file: follow.routes.ts