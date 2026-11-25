// Project: Inkwell
// Location: backend/routes/comment.routes.ts
// Purpose: The comment addresses under /api/comments. Anyone can read comments
// of stories they can see (comments on stories of banned or suspended writers
// look "not found"). Logged-in users can write, edit and delete their own
// comments. Admins with the HIDE_COMMENTS ability can hide or restore a comment.

import { Router } from "express";
import {
  authenticate,
  getAuthUser,
  requireAdmin,
  requirePermission,
} from "../middleware/auth";
import {
  getOptionalUser,
  optionalAuthenticate,
} from "../middleware/optionalAuth";
import {
  hideIfAuthorBlockedByCommentId,
  hideIfAuthorBlockedByStoryQuery,
} from "../middleware/storyVisibility";
import {
  createComment,
  deleteComment,
  listComments,
  listReplies,
  setCommentHidden,
  updateComment,
} from "../services/comment.service";
import {
  commentIdParamSchema,
  createCommentSchema,
  listCommentsQuerySchema,
  pageQuerySchema,
  updateCommentSchema,
} from "../validators/social.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const commentRouter = Router();

// List the comments of a chapter (or of a story, when no chapterId is given).
commentRouter.get(
  "/",
  optionalAuthenticate,
  hideIfAuthorBlockedByStoryQuery,
  asyncHandler(async (req, res) => {
    const query = listCommentsQuerySchema.parse(req.query);
    res.json(await listComments(query, getOptionalUser(res)));
  })
);

// More replies under one top-level comment.
commentRouter.get(
  "/:commentId/replies",
  optionalAuthenticate,
  hideIfAuthorBlockedByCommentId,
  asyncHandler(async (req, res) => {
    const { commentId } = commentIdParamSchema.parse(req.params);
    const { page, limit } = pageQuerySchema.parse(req.query);
    res.json(await listReplies(commentId, page, limit, getOptionalUser(res)));
  })
);

commentRouter.post(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const input = createCommentSchema.parse(req.body);
    res.status(201).json(await createComment(getAuthUser(res), input));
  })
);

commentRouter.patch(
  "/:commentId",
  authenticate,
  asyncHandler(async (req, res) => {
    const { commentId } = commentIdParamSchema.parse(req.params);
    const { body } = updateCommentSchema.parse(req.body);
    res.json(await updateComment(getAuthUser(res), commentId, body));
  })
);

commentRouter.delete(
  "/:commentId",
  authenticate,
  asyncHandler(async (req, res) => {
    const { commentId } = commentIdParamSchema.parse(req.params);
    res.json(await deleteComment(getAuthUser(res), commentId));
  })
);

// ---- Admin moderation (needs the HIDE_COMMENTS ability) ----

commentRouter.post(
  "/:commentId/hide",
  authenticate,
  requireAdmin,
  requirePermission("HIDE_COMMENTS"),
  asyncHandler(async (req, res) => {
    const { commentId } = commentIdParamSchema.parse(req.params);
    res.json(await setCommentHidden(getAuthUser(res).id, commentId, true));
  })
);

commentRouter.post(
  "/:commentId/unhide",
  authenticate,
  requireAdmin,
  requirePermission("HIDE_COMMENTS"),
  asyncHandler(async (req, res) => {
    const { commentId } = commentIdParamSchema.parse(req.params);
    res.json(await setCommentHidden(getAuthUser(res).id, commentId, false));
  })
);

// Location: backend/routes/comment.routes.ts
// End of file: comment.routes.ts