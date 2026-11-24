// Location: backend/services/comment.service.ts
// Purpose: Comments. List the comments of a chapter or story (top-level
// comments with their first replies), list more replies, add a comment or a
// reply, edit and delete your own, and let an admin hide or restore a comment.
// Replies are one level deep: a reply to a reply is attached to the same
// top-level comment. People can only comment where they are allowed to read.

import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import type { AuthUser } from "../utils/selects";
import type {
  CreateCommentInput,
  ListCommentsQuery,
} from "../validators/social.validator";
import { createNotification } from "./notification.service";
import { assertCanAccessChapter, assertCanView } from "./storyAccess.service";

const commentSelect = {
  id: true,
  storyId: true,
  chapterId: true,
  parentId: true,
  paragraphIndex: true,
  body: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  },
  _count: {
    select: { likes: true, replies: { where: { status: "VISIBLE" } } },
  },
} satisfies Prisma.CommentSelect;

type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

function formatComment(comment: CommentRow, liked: Set<string>) {
  const { _count, ...rest } = comment;
  return {
    ...rest,
    likeCount: _count.likes,
    replyCount: _count.replies,
    likedByMe: liked.has(comment.id),
  };
}

// Which of these comments has the viewer already liked?
async function likedSet(
  viewer: AuthUser | null,
  commentIds: string[]
): Promise<Set<string>> {
  if (!viewer || commentIds.length === 0) return new Set();
  const rows = await prisma.like.findMany({
    where: { userId: viewer.id, commentId: { in: commentIds } },
    select: { commentId: true },
  });
  return new Set(rows.flatMap((row) => (row.commentId ? [row.commentId] : [])));
}

async function loadViewableStory(storyId: string, viewer: AuthUser | null) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, title: true, slug: true, status: true, authorId: true },
  });
  if (!story) throw new AppError("Story not found", 404);
  assertCanView(story, viewer);
  return story;
}

async function loadAccessibleChapter(
  chapterId: string,
  story: { id: string; authorId: string },
  viewer: AuthUser | null
) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      id: true,
      number: true,
      storyId: true,
      status: true,
      isMembersOnly: true,
    },
  });
  if (!chapter || chapter.storyId !== story.id) {
    throw new AppError("Chapter not found", 404);
  }
  await assertCanAccessChapter(chapter, story, viewer);
  return chapter;
}

export async function listComments(
  query: ListCommentsQuery,
  viewer: AuthUser | null
) {
  const story = await loadViewableStory(query.storyId, viewer);
  if (query.chapterId) {
    await loadAccessibleChapter(query.chapterId, story, viewer);
  }

  const where: Prisma.CommentWhereInput = {
    storyId: story.id,
    parentId: null,
    status: "VISIBLE",
    chapterId: query.chapterId ?? null,
    ...(query.paragraphIndex !== undefined
      ? { paragraphIndex: query.paragraphIndex }
      : {}),
  };

  const [topLevel, total] = await prisma.$transaction([
    prisma.comment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: commentSelect,
    }),
    prisma.comment.count({ where }),
  ]);

  const topIds = topLevel.map((comment) => comment.id);
  const replyRows =
    topIds.length === 0
      ? []
      : await prisma.comment.findMany({
          where: { parentId: { in: topIds }, status: "VISIBLE" },
          orderBy: { createdAt: "asc" },
          take: 300,
          select: commentSelect,
        });

  const liked = await likedSet(viewer, [
    ...topIds,
    ...replyRows.map((reply) => reply.id),
  ]);

  // Show only the first 5 replies under each comment. More are available from
  // the replies address.
  const repliesByParent = new Map<string, ReturnType<typeof formatComment>[]>();
  for (const reply of replyRows) {
    if (!reply.parentId) continue;
    const list = repliesByParent.get(reply.parentId) ?? [];
    if (list.length < 5) list.push(formatComment(reply, liked));
    repliesByParent.set(reply.parentId, list);
  }

  const comments = topLevel.map((comment) => ({
    ...formatComment(comment, liked),
    replies: repliesByParent.get(comment.id) ?? [],
  }));

  return {
    comments,
    page: query.page,
    limit: query.limit,
    total,
    hasMore: query.page * query.limit < total,
  };
}

export async function listReplies(
  commentId: string,
  page: number,
  limit: number,
  viewer: AuthUser | null
) {
  const parent = await prisma.comment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      status: true,
      story: { select: { status: true, authorId: true } },
    },
  });
  if (!parent || parent.status !== "VISIBLE") {
    throw new AppError("Comment not found", 404);
  }
  assertCanView(parent.story, viewer);

  const where = { parentId: commentId, status: "VISIBLE" as const };
  const [rows, total] = await prisma.$transaction([
    prisma.comment.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      select: commentSelect,
    }),
    prisma.comment.count({ where }),
  ]);

  const liked = await likedSet(
    viewer,
    rows.map((row) => row.id)
  );

  return {
    replies: rows.map((row) => formatComment(row, liked)),
    page,
    limit,
    total,
  };
}

export async function createComment(
  user: AuthUser,
  input: CreateCommentInput
) {
  const story = await loadViewableStory(input.storyId, user);

  let chapterNumber: number | null = null;
  if (input.chapterId) {
    const chapter = await loadAccessibleChapter(input.chapterId, story, user);
    chapterNumber = chapter.number;
  }

  if (input.paragraphIndex !== undefined && !input.chapterId) {
    throw new AppError("Paragraph comments need a chapter", 400);
  }

  let parent: {
    id: string;
    parentId: string | null;
    authorId: string;
  } | null = null;

  if (input.parentId) {
    const found = await prisma.comment.findUnique({
      where: { id: input.parentId },
      select: {
        id: true,
        storyId: true,
        chapterId: true,
        parentId: true,
        authorId: true,
        status: true,
      },
    });
    if (!found || found.status !== "VISIBLE") {
      throw new AppError("The comment you are replying to was not found", 404);
    }
    if (
      found.storyId !== story.id ||
      found.chapterId !== (input.chapterId ?? null)
    ) {
      throw new AppError(
        "A reply must be in the same story and chapter as the comment",
        400
      );
    }
    parent = found;
  }

  const created = await prisma.comment.create({
    data: {
      authorId: user.id,
      storyId: story.id,
      chapterId: input.chapterId ?? null,
      // A reply to a reply is attached to the same top-level comment.
      parentId: parent ? (parent.parentId ?? parent.id) : null,
      paragraphIndex: parent ? null : (input.paragraphIndex ?? null),
      body: input.body,
    },
    select: commentSelect,
  });

  const link =
    chapterNumber !== null
      ? `/stories/${story.slug}/chapters/${chapterNumber}`
      : `/stories/${story.slug}`;

  if (parent) {
    if (parent.authorId !== user.id) {
      await createNotification(
        parent.authorId,
        "COMMENT_REPLY",
        `${user.displayName} replied to your comment`,
        link
      );
    }
  } else if (story.authorId !== user.id) {
    await createNotification(
      story.authorId,
      "COMMENT_REPLY",
      `${user.displayName} commented on "${story.title}"`,
      link
    );
  }

  return { comment: formatComment(created, new Set()) };
}

export async function updateComment(
  user: AuthUser,
  commentId: string,
  body: string
) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, authorId: true, status: true },
  });
  if (!comment) throw new AppError("Comment not found", 404);
  if (comment.authorId !== user.id) {
    throw new AppError("You can only edit your own comments", 403);
  }
  if (comment.status !== "VISIBLE") {
    throw new AppError("This comment was hidden by a moderator", 403);
  }

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { body },
    select: commentSelect,
  });

  return {
    comment: formatComment(updated, await likedSet(user, [commentId])),
  };
}

export async function deleteComment(user: AuthUser, commentId: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, authorId: true },
  });
  if (!comment) throw new AppError("Comment not found", 404);
  if (comment.authorId !== user.id) {
    throw new AppError(
      "You can only delete your own comments. Admins can hide comments instead",
      403
    );
  }

  await prisma.comment.delete({ where: { id: commentId } });
  return { message: "Comment deleted", commentId };
}

// Hides (or restores) a comment. Needs the HIDE_COMMENTS ability, which is
// checked by the route. Every use is written to the activity log.
export async function setCommentHidden(
  actorId: string,
  commentId: string,
  hidden: boolean
) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, authorId: true, storyId: true },
  });
  if (!comment) throw new AppError("Comment not found", 404);

  await prisma.$transaction([
    prisma.comment.update({
      where: { id: commentId },
      data: { status: hidden ? "HIDDEN" : "VISIBLE" },
    }),
    prisma.adminActionLog.create({
      data: {
        actorId,
        targetUserId: comment.authorId,
        action: hidden ? "COMMENT_HIDDEN" : "COMMENT_RESTORED",
        details: { commentId, storyId: comment.storyId },
      },
    }),
  ]);

  return { commentId, status: hidden ? "HIDDEN" : "VISIBLE" };
}

// Location: backend/services/comment.service.ts
// End of file: comment.service.ts