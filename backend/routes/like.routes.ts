// Location: backend/routes/like.routes.ts
// Purpose: The like addresses under /api/likes. PUT likes and DELETE unlikes,
// for a story (/stories/:storyId) or a comment (/comments/:commentId). All need
// a logged-in user.

import { Router } from "express";
import { authenticate, getAuthUser } from "../middleware/auth";
import {
  likeComment,
  likeStory,
  unlikeComment,
  unlikeStory,
} from "../services/like.service";
import { commentIdParamSchema } from "../validators/social.validator";
import { storyIdParamSchema } from "../validators/story.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const likeRouter = Router();

likeRouter.use(authenticate);

likeRouter.put(
  "/stories/:storyId",
  asyncHandler(async (req, res) => {
    const { storyId } = storyIdParamSchema.parse(req.params);
    res.json(await likeStory(getAuthUser(res), storyId));
  })
);

likeRouter.delete(
  "/stories/:storyId",
  asyncHandler(async (req, res) => {
    const { storyId } = storyIdParamSchema.parse(req.params);
    res.json(await unlikeStory(getAuthUser(res), storyId));
  })
);

likeRouter.put(
  "/comments/:commentId",
  asyncHandler(async (req, res) => {
    const { commentId } = commentIdParamSchema.parse(req.params);
    res.json(await likeComment(getAuthUser(res), commentId));
  })
);

likeRouter.delete(
  "/comments/:commentId",
  asyncHandler(async (req, res) => {
    const { commentId } = commentIdParamSchema.parse(req.params);
    res.json(await unlikeComment(getAuthUser(res), commentId));
  })
);

// Location: backend/routes/like.routes.ts
// End of file: like.routes.ts