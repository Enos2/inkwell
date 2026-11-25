// Project: Inkwell
// Location: backend/middleware/storyVisibility.ts
// Purpose: Gatekeepers for public reading addresses. If the writer of a story
// is banned or suspended, their story (and its chapters, comments and replies)
// must look "not found" to everyone except admins. Each gatekeeper finds the
// story's writer in a different way: from the story's web address (slug), from
// a storyId in the address, or from a comment id. They must run AFTER
// optionalAuthenticate, so we know whether the visitor is an admin. If the story
// or comment does not exist at all, the gatekeeper steps aside and lets the
// route report that itself.

import type { RequestHandler, Response } from "express";
import { prisma } from "../config/prisma";
import { isAccountBlocked } from "../services/session.service";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/errors";
import { getOptionalUser } from "./optionalAuth";

const authorSelect = { status: true, bannedUntil: true } as const;

type Author = { status: string; bannedUntil: Date | null };

function viewerIsAdmin(res: Response): boolean {
  const viewer = getOptionalUser(res);
  return !!viewer && viewer.adminRank !== null;
}

function denyIfBlocked(
  author: Author | undefined,
  res: Response,
  message: string
): void {
  if (!author) return;
  if (viewerIsAdmin(res)) return;
  if (isAccountBlocked(author)) {
    throw new AppError(message, 404);
  }
}

// For addresses like /api/stories/:slug and /api/stories/:slug/chapters/:number
export const hideIfAuthorBlockedBySlug: RequestHandler = asyncHandler(
  async (req, res, next) => {
    const slug = req.params.slug;
    if (typeof slug === "string") {
      const story = await prisma.story.findUnique({
        where: { slug },
        select: { author: { select: authorSelect } },
      });
      denyIfBlocked(story?.author, res, "Story not found");
    }
    next();
  }
);

// For addresses like /api/comments?storyId=...
export const hideIfAuthorBlockedByStoryQuery: RequestHandler = asyncHandler(
  async (req, res, next) => {
    const storyId = req.query.storyId;
    if (typeof storyId === "string") {
      const story = await prisma.story.findUnique({
        where: { id: storyId },
        select: { author: { select: authorSelect } },
      });
      denyIfBlocked(story?.author, res, "Story not found");
    }
    next();
  }
);

// For addresses like /api/comments/:commentId/replies
export const hideIfAuthorBlockedByCommentId: RequestHandler = asyncHandler(
  async (req, res, next) => {
    const commentId = req.params.commentId;
    if (typeof commentId === "string") {
      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
        select: { story: { select: { author: { select: authorSelect } } } },
      });
      denyIfBlocked(comment?.story.author, res, "Comment not found");
    }
    next();
  }
);

// Location: backend/middleware/storyVisibility.ts
// End of file: storyVisibility.ts