// Location: backend/services/moderation.service.ts
// Purpose: The real work of moderating stories and users. Stories: hide (with a
// reason), restore as a draft, feature and unfeature, plus the public list of
// featured stories. Users: search, suspend for a number of days, ban, and
// restore. Rules: nobody can moderate themselves or the Super Admin, and only
// the Super Admin can suspend or ban another admin. Every action is written to
// the activity log. Expired suspensions are lifted by liftExpiredSuspensions.

import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import type { AuthUser } from "../utils/selects";
import type {
  AdminUsersQuery,
  FeaturedQuery,
} from "../validators/moderation.validator";
import { createNotification } from "./notification.service";
import { userHasPermission } from "./permission.service";
import { isAccountBlocked } from "./session.service";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- STORIES

export async function hideStory(
  actor: AuthUser,
  storyId: string,
  reason: string
) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, title: true, authorId: true, status: true },
  });
  if (!story) throw new AppError("Story not found", 404);
  if (story.status === "HIDDEN") {
    throw new AppError("This story is already hidden", 409);
  }
  if (story.status !== "PUBLISHED") {
    throw new AppError("Only published stories can be hidden", 400);
  }

  await prisma.$transaction([
    prisma.story.update({
      where: { id: storyId },
      data: { status: "HIDDEN", isFeatured: false },
    }),
    prisma.adminActionLog.create({
      data: {
        actorId: actor.id,
        targetUserId: story.authorId,
        action: "STORY_HIDDEN",
        details: { storyId, title: story.title, reason },
      },
    }),
  ]);

  await createNotification(
    story.authorId,
    "SYSTEM",
    `Your story "${story.title}" was hidden by a moderator. Reason: ${reason}`
  );

  return { storyId, status: "HIDDEN" };
}

// A restored story goes back as a DRAFT. Its author can publish it again.
export async function unhideStory(actor: AuthUser, storyId: string) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, title: true, authorId: true, status: true },
  });
  if (!story) throw new AppError("Story not found", 404);
  if (story.status !== "HIDDEN") {
    throw new AppError("This story is not hidden", 400);
  }

  await prisma.$transaction([
    prisma.story.update({
      where: { id: storyId },
      data: { status: "DRAFT" },
    }),
    prisma.adminActionLog.create({
      data: {
        actorId: actor.id,
        targetUserId: story.authorId,
        action: "STORY_UNHIDDEN",
        details: { storyId, title: story.title },
      },
    }),
  ]);

  await createNotification(
    story.authorId,
    "SYSTEM",
    `Your story "${story.title}" was restored as a draft. You can publish it again.`
  );

  return { storyId, status: "DRAFT" };
}

export async function featureStory(actor: AuthUser, storyId: string) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: {
      id: true,
      title: true,
      authorId: true,
      status: true,
      isFeatured: true,
      author: { select: { status: true } },
    },
  });
  if (!story) throw new AppError("Story not found", 404);
  if (story.status !== "PUBLISHED") {
    throw new AppError("Only published stories can be featured", 400);
  }
  if (story.author.status !== "ACTIVE") {
    throw new AppError("This writer's account is not active", 400);
  }
  if (story.isFeatured) return { storyId, isFeatured: true };

  await prisma.$transaction([
    prisma.story.update({
      where: { id: storyId },
      data: { isFeatured: true },
    }),
    prisma.adminActionLog.create({
      data: {
        actorId: actor.id,
        targetUserId: story.authorId,
        action: "STORY_FEATURED",
        details: { storyId, title: story.title },
      },
    }),
  ]);

  return { storyId, isFeatured: true };
}

export async function unfeatureStory(actor: AuthUser, storyId: string) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, title: true, authorId: true, isFeatured: true },
  });
  if (!story) throw new AppError("Story not found", 404);
  if (!story.isFeatured) return { storyId, isFeatured: false };

  await prisma.$transaction([
    prisma.story.update({
      where: { id: storyId },
      data: { isFeatured: false },
    }),
    prisma.adminActionLog.create({
      data: {
        actorId: actor.id,
        targetUserId: story.authorId,
        action: "STORY_UNFEATURED",
        details: { storyId, title: story.title },
      },
    }),
  ]);

  return { storyId, isFeatured: false };
}

// The public list of featured stories for the home page.
export async function listFeatured(query: FeaturedQuery) {
  const stories = await prisma.story.findMany({
    where: {
      status: "PUBLISHED",
      isFeatured: true,
      author: { status: "ACTIVE" },
      ...(query.mature ? {} : { isMature: false }),
    },
    orderBy: { publishedAt: "desc" },
    take: query.limit,
    select: {
      id: true,
      kind: true,
      title: true,
      slug: true,
      synopsis: true,
      coverUrl: true,
      language: true,
      isMature: true,
      viewCount: true,
      publishedAt: true,
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      tags: { select: { name: true, slug: true } },
      _count: {
        select: { likes: true, chapters: { where: { status: "PUBLISHED" } } },
      },
    },
  });

  return {
    stories: stories.map((story) => {
      const { _count, ...rest } = story;
      return {
        ...rest,
        likeCount: _count.likes,
        chapterCount: _count.chapters,
      };
    }),
  };
}

// ---------------------------------------------------------------- USERS

// Finds the person an admin wants to moderate and applies the protection rules.
async function loadModerationTarget(actor: AuthUser, userId: string) {
  if (userId === actor.id) {
    throw new AppError("You cannot moderate yourself", 400);
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      status: true,
      bannedUntil: true,
      adminRank: true,
    },
  });
  if (!target) throw new AppError("User not found", 404);

  if (target.adminRank === "SUPER_ADMIN") {
    throw new AppError("The Super Admin cannot be suspended or banned", 403);
  }
  if (target.adminRank && actor.adminRank !== "SUPER_ADMIN") {
    throw new AppError(
      "Only the Super Admin can suspend or ban another admin",
      403
    );
  }

  return target;
}

const moderatedUserSelect = {
  id: true,
  username: true,
  displayName: true,
  writerStatus: true,
  adminRank: true,
  status: true,
  statusReason: true,
  bannedUntil: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

export async function listUsers(query: AdminUsersQuery) {
  const where: Prisma.UserWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.q
      ? {
          OR: [
            {
              username: { contains: query.q, mode: "insensitive" as const },
            },
            {
              displayName: { contains: query.q, mode: "insensitive" as const },
            },
          ],
        }
      : {}),
  };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: moderatedUserSelect,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map((user) => ({ ...user, blockedNow: isAccountBlocked(user) })),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function suspendUser(
  actor: AuthUser,
  userId: string,
  input: { reason: string; days: number }
) {
  const target = await loadModerationTarget(actor, userId);
  if (target.status === "BANNED") {
    throw new AppError("This user is already banned", 409);
  }

  const until = new Date(Date.now() + input.days * DAY_IN_MS);

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        status: "SUSPENDED",
        bannedUntil: until,
        statusReason: input.reason,
      },
      select: moderatedUserSelect,
    }),
    prisma.adminActionLog.create({
      data: {
        actorId: actor.id,
        targetUserId: userId,
        action: "USER_SUSPENDED",
        details: {
          reason: input.reason,
          days: input.days,
          until: until.toISOString(),
        },
      },
    }),
  ]);

  return { user };
}

export async function banUser(
  actor: AuthUser,
  userId: string,
  reason: string
) {
  const target = await loadModerationTarget(actor, userId);
  if (target.status === "BANNED") {
    throw new AppError("This user is already banned", 409);
  }

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { status: "BANNED", bannedUntil: null, statusReason: reason },
      select: moderatedUserSelect,
    }),
    prisma.adminActionLog.create({
      data: {
        actorId: actor.id,
        targetUserId: userId,
        action: "USER_BANNED",
        details: { reason, previousStatus: target.status },
      },
    }),
  ]);

  return { user };
}

// Undoes a suspension or a ban. Undoing a ban needs BAN_USERS and undoing a
// suspension needs SUSPEND_USERS, so a person whose ban power was switched off
// cannot undo bans.
export async function restoreUser(actor: AuthUser, userId: string) {
  const target = await loadModerationTarget(actor, userId);
  if (target.status === "ACTIVE") {
    throw new AppError("This user is already active", 409);
  }

  const needed = target.status === "BANNED" ? "BAN_USERS" : "SUSPEND_USERS";
  const allowed = await userHasPermission(actor.id, actor.adminRank, needed);
  if (!allowed) {
    throw new AppError("You do not have permission to do this", 403);
  }

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { status: "ACTIVE", bannedUntil: null, statusReason: null },
      select: moderatedUserSelect,
    }),
    prisma.adminActionLog.create({
      data: {
        actorId: actor.id,
        targetUserId: userId,
        action: "USER_RESTORED",
        details: { previousStatus: target.status },
      },
    }),
  ]);

  return { user };
}

// A suspension whose time has run out is switched back to ACTIVE, so the
// person's stories and profile show again. Returns how many were lifted.
export async function liftExpiredSuspensions(): Promise<number> {
  const result = await prisma.user.updateMany({
    where: { status: "SUSPENDED", bannedUntil: { lte: new Date() } },
    data: { status: "ACTIVE", bannedUntil: null, statusReason: null },
  });
  return result.count;
}

// Location: backend/services/moderation.service.ts
// End of file: moderation.service.ts