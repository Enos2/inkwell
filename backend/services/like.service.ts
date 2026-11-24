// Location: backend/services/like.service.ts
// Purpose: Likes for stories and for comments. Liking twice has no extra
// effect, and unliking something not liked is harmless. The author gets a
// notification the first time someone likes their work (never for liking your
// own).

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import type { AuthUser } from "../utils/selects";
import { createNotification } from "./notification.service";
import { findPublishedStory } from "./storyAccess.service";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function likeStory(user: AuthUser, storyId: string) {
  const story = await findPublishedStory(storyId);

  const existing = await prisma.like.findUnique({
    where: { userId_storyId: { userId: user.id, storyId } },
  });

  if (!existing) {
    try {
      await prisma.like.create({ data: { userId: user.id, storyId } });
      if (story.authorId !== user.id) {
        await createNotification(
          story.authorId,
          "LIKE",
          `${user.displayName} liked your story "${story.title}"`,
          `/stories/${story.slug}`
        );
      }
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  const likeCount = await prisma.like.count({ where: { storyId } });
  return { liked: true, likeCount };
}

export async function unlikeStory(user: AuthUser, storyId: string) {
  await prisma.like.deleteMany({ where: { userId: user.id, storyId } });
  const likeCount = await prisma.like.count({ where: { storyId } });
  return { liked: false, likeCount };
}

export async function likeComment(user: AuthUser, commentId: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      status: true,
      authorId: true,
      story: { select: { status: true, slug: true } },
    },
  });
  if (
    !comment ||
    comment.status !== "VISIBLE" ||
    comment.story.status !== "PUBLISHED"
  ) {
    throw new AppError("Comment not found", 404);
  }

  const existing = await prisma.like.findUnique({
    where: { userId_commentId: { userId: user.id, commentId } },
  });

  if (!existing) {
    try {
      await prisma.like.create({ data: { userId: user.id, commentId } });
      if (comment.authorId !== user.id) {
        await createNotification(
          comment.authorId,
          "LIKE",
          `${user.displayName} liked your comment`,
          `/stories/${comment.story.slug}`
        );
      }
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  const likeCount = await prisma.like.count({ where: { commentId } });
  return { liked: true, likeCount };
}

export async function unlikeComment(user: AuthUser, commentId: string) {
  await prisma.like.deleteMany({ where: { userId: user.id, commentId } });
  const likeCount = await prisma.like.count({ where: { commentId } });
  return { liked: false, likeCount };
}

// Location: backend/services/like.service.ts
// End of file: like.service.ts