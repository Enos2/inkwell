// Project: Inkwell
// Location: backend/services/engagement.service.ts
// Purpose: Reading streaks and badges. Every day a logged-in reader saves
// reading progress counts as a reading day (in UTC time). From the days we work
// out the current and longest streak. Badges are checked whenever a new reading
// day is recorded and whenever someone opens their own badge page, so writer
// badges (stories, followers, views) appear the next time the writer looks. A
// new badge sends the person a notification.

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import {
  BADGES,
  earnedBadgeCodes,
  findBadge,
  type BadgeStats,
} from "../utils/badges";
import { computeStreaks, toDayString, type StreakInfo } from "../utils/streak";
import type { AuthUser } from "../utils/selects";
import { createNotification } from "./notification.service";

const DAY_MS = 86_400_000;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

const noStreak: StreakInfo = {
  current: 0,
  longest: 0,
  lastReadDay: null,
  readToday: false,
};

// Collects every number the badge rules need. Returns null for accounts that
// are not active (banned or suspended people earn nothing).
async function loadStats(
  userId: string
): Promise<{ stats: BadgeStats; streak: StreakInfo } | null> {
  const [
    user,
    days,
    commentCount,
    publishedStories,
    followerCount,
    viewAggregate,
    tipCount,
    giftCount,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, status: true },
    }),
    prisma.readingDay.findMany({
      where: { userId },
      orderBy: { day: "desc" },
      take: 1000,
      select: { day: true },
    }),
    prisma.comment.count({ where: { authorId: userId, status: "VISIBLE" } }),
    prisma.story.count({ where: { authorId: userId, status: "PUBLISHED" } }),
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.story.aggregate({
      where: { authorId: userId, status: "PUBLISHED" },
      _max: { viewCount: true },
    }),
    prisma.tip.count({ where: { senderId: userId } }),
    prisma.giftTransaction.count({ where: { senderId: userId } }),
  ]);

  if (!user || user.status !== "ACTIVE") return null;

  const dayStrings = days.map((row) => toDayString(row.day));
  const streak = computeStreaks(dayStrings, toDayString(new Date()));

  const stats: BadgeStats = {
    readingDays: dayStrings.length,
    longestStreak: streak.longest,
    commentCount,
    publishedStories,
    followerCount,
    maxStoryViews: viewAggregate._max.viewCount ?? 0,
    supportsSent: tipCount + giftCount,
    accountAgeDays: Math.floor((Date.now() - user.createdAt.getTime()) / DAY_MS),
  };

  return { stats, streak };
}

// Gives the person every badge they have earned but do not have yet. Returns
// the codes of the newly awarded badges.
export async function evaluateBadges(userId: string): Promise<string[]> {
  const loaded = await loadStats(userId);
  if (!loaded) return [];

  const earned = earnedBadgeCodes(loaded.stats);
  const existing = await prisma.userBadge.findMany({
    where: { userId },
    select: { code: true },
  });
  const have = new Set(existing.map((row) => row.code));

  const awarded: string[] = [];
  for (const code of earned) {
    if (have.has(code)) continue;

    try {
      await prisma.userBadge.create({ data: { userId, code } });
    } catch (error) {
      // Two checks at the same moment: the other one already gave it.
      if (isUniqueViolation(error)) continue;
      throw error;
    }

    awarded.push(code);
    const badge = findBadge(code);
    if (badge) {
      await createNotification(
        userId,
        "SYSTEM",
        `You earned the ${badge.emoji} ${badge.name} badge: ${badge.description}`,
        "/profile"
      );
    }
  }

  return awarded;
}

// Marks today as a reading day. Badges are only checked when it is a NEW day.
export async function recordReadingActivity(userId: string): Promise<void> {
  const today = new Date(`${toDayString(new Date())}T00:00:00.000Z`);

  const created = await prisma.readingDay.createMany({
    data: [{ userId, day: today }],
    skipDuplicates: true,
  });

  if (created.count > 0) {
    await evaluateBadges(userId);
  }
}

// The reader's own streak and the full badge list (earned and still locked).
export async function getMyEngagement(user: AuthUser) {
  await evaluateBadges(user.id);

  const [loaded, owned] = await Promise.all([
    loadStats(user.id),
    prisma.userBadge.findMany({
      where: { userId: user.id },
      select: { code: true, awardedAt: true },
    }),
  ]);
  const awardedAt = new Map(owned.map((row) => [row.code, row.awardedAt] as const));

  return {
    streak: loaded ? loaded.streak : noStreak,
    badges: BADGES.map((badge) => ({
      code: badge.code,
      name: badge.name,
      description: badge.description,
      emoji: badge.emoji,
      earned: awardedAt.has(badge.code),
      awardedAt: awardedAt.get(badge.code) ?? null,
    })),
  };
}

// Anyone can see the badges a person has earned.
export async function getUserBadges(username: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") {
    throw new AppError("User not found", 404);
  }

  const rows = await prisma.userBadge.findMany({
    where: { userId: user.id },
    orderBy: { awardedAt: "desc" },
    select: { code: true, awardedAt: true },
  });

  return {
    badges: rows.flatMap((row) => {
      const badge = findBadge(row.code);
      if (!badge) return [];
      return [
        {
          code: badge.code,
          name: badge.name,
          description: badge.description,
          emoji: badge.emoji,
          awardedAt: row.awardedAt,
        },
      ];
    }),
  };
}

// Location: backend/services/engagement.service.ts
// End of file: engagement.service.ts