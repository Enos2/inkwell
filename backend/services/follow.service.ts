// Location: backend/services/follow.service.ts
// Purpose: Following writers. Follow and unfollow, lists of a person's
// followers and the people they follow (with a "followedByMe" flag for the
// viewer), and the feed: the newest published chapters from the writers you
// follow. The writer gets a notification on a new follower.

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import type { AuthUser } from "../utils/selects";
import { createNotification } from "./notification.service";
import { publishDueChapters } from "./storyAccess.service";

const personSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
} as const satisfies Prisma.UserSelect;

export async function followUser(user: AuthUser, targetId: string) {
  if (targetId === user.id) {
    throw new AppError("You cannot follow yourself", 400);
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, status: true },
  });
  if (!target || target.status !== "ACTIVE") {
    throw new AppError("User not found", 404);
  }

  const existing = await prisma.follow.findUnique({
    where: {
      followerId_followingId: { followerId: user.id, followingId: targetId },
    },
  });

  if (!existing) {
    try {
      await prisma.follow.create({
        data: { followerId: user.id, followingId: targetId },
      });
    } catch (error) {
      const alreadyFollowing =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002";
      if (!alreadyFollowing) throw error;
      return { following: true, userId: targetId };
    }

    await createNotification(
      targetId,
      "NEW_FOLLOWER",
      `${user.displayName} started following you`,
      `/users/${user.username}`
    );
  }

  return { following: true, userId: targetId };
}

export async function unfollowUser(user: AuthUser, targetId: string) {
  await prisma.follow.deleteMany({
    where: { followerId: user.id, followingId: targetId },
  });
  return { following: false, userId: targetId };
}

async function listPeople(
  username: string,
  direction: "followers" | "following",
  viewer: AuthUser | null,
  page: number,
  limit: number
) {
  const owner = await prisma.user.findUnique({
    where: { username },
    select: { id: true, status: true },
  });
  if (!owner || owner.status !== "ACTIVE") {
    throw new AppError("User not found", 404);
  }

  const where: Prisma.FollowWhereInput =
    direction === "followers"
      ? { followingId: owner.id, follower: { status: "ACTIVE" } }
      : { followerId: owner.id, following: { status: "ACTIVE" } };

  const [rows, total] = await prisma.$transaction([
    prisma.follow.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        follower: { select: personSelect },
        following: { select: personSelect },
      },
    }),
    prisma.follow.count({ where }),
  ]);

  const people = rows.map((row) =>
    direction === "followers" ? row.follower : row.following
  );

  let followedIds = new Set<string>();
  if (viewer && people.length > 0) {
    const mine = await prisma.follow.findMany({
      where: {
        followerId: viewer.id,
        followingId: { in: people.map((person) => person.id) },
      },
      select: { followingId: true },
    });
    followedIds = new Set(mine.map((row) => row.followingId));
  }

  return {
    users: people.map((person) => ({
      ...person,
      followedByMe: followedIds.has(person.id),
    })),
    page,
    limit,
    total,
  };
}

export function listFollowers(
  username: string,
  viewer: AuthUser | null,
  page: number,
  limit: number
) {
  return listPeople(username, "followers", viewer, page, limit);
}

export function listFollowing(
  username: string,
  viewer: AuthUser | null,
  page: number,
  limit: number
) {
  return listPeople(username, "following", viewer, page, limit);
}

// The newest published chapters from writers the user follows.
export async function getFeed(user: AuthUser, page: number, limit: number) {
  await publishDueChapters();

  const following = await prisma.follow.findMany({
    where: { followerId: user.id },
    select: { followingId: true },
  });
  const authorIds = following.map((row) => row.followingId);

  if (authorIds.length === 0) {
    return { items: [], page, limit, total: 0, followingCount: 0 };
  }

  const where: Prisma.ChapterWhereInput = {
    status: "PUBLISHED",
    story: {
      status: "PUBLISHED",
      authorId: { in: authorIds },
      author: { status: "ACTIVE" },
    },
  };

  const [items, total] = await prisma.$transaction([
    prisma.chapter.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        number: true,
        title: true,
        publishedAt: true,
        wordCount: true,
        isMembersOnly: true,
        story: {
          select: {
            id: true,
            title: true,
            slug: true,
            coverUrl: true,
            isMature: true,
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    }),
    prisma.chapter.count({ where }),
  ]);

  return { items, page, limit, total, followingCount: authorIds.length };
}

// Location: backend/services/follow.service.ts
// End of file: follow.service.ts