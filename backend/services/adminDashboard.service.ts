// Project: Inkwell
// Location: backend/services/adminDashboard.service.ts
// Purpose: The numbers shown on the admin dashboard: people, writers, stories,
// chapters, comments, reports waiting, memberships, Premium readers, live ads,
// running challenges and sign-ups for the last 14 days. The money section is
// only included for the Super Admin.

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import type { AuthUser } from "../utils/selects";
import { toDayString } from "../utils/streak";

const DAY_MS = 86_400_000;

export async function getDashboard(actor: AuthUser) {
  const now = new Date();
  const days7 = new Date(now.getTime() - 7 * DAY_MS);
  const days14 = new Date(now.getTime() - 14 * DAY_MS);
  const days30 = new Date(now.getTime() - 30 * DAY_MS);

  const [
    totalUsers,
    deletedUsers,
    newUsers7,
    newUsers30,
    writers,
    pendingWriters,
    publishedStories,
    draftStories,
    hiddenStories,
    publishedChapters,
    comments,
    openReports,
    activeMembers,
    premiumReaders,
    liveAds,
    activeChallenges,
    signupRows,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { statusReason: "ACCOUNT_DELETED" } }),
    prisma.user.count({ where: { createdAt: { gte: days7 } } }),
    prisma.user.count({ where: { createdAt: { gte: days30 } } }),
    prisma.user.count({ where: { writerStatus: "APPROVED" } }),
    prisma.user.count({ where: { writerStatus: "PENDING" } }),
    prisma.story.count({ where: { status: "PUBLISHED" } }),
    prisma.story.count({ where: { status: "DRAFT" } }),
    prisma.story.count({ where: { status: "HIDDEN" } }),
    prisma.chapter.count({ where: { status: "PUBLISHED" } }),
    prisma.comment.count({ where: { status: "VISIBLE" } }),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.membership.count({
      where: {
        status: "ACTIVE",
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
    }),
    prisma.user.count({ where: { premiumUntil: { gt: now } } }),
    prisma.ad.count({
      where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
    }),
    prisma.challenge.count({
      where: { startsAt: { lte: now }, endsAt: { gte: now } },
    }),
    prisma.$queryRaw<{ day: string; count: number }[]>(
      Prisma.sql`SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count FROM "User" WHERE "createdAt" >= ${days14} GROUP BY 1 ORDER BY 1`
    ),
  ]);

  // One entry for each of the last 14 days, even days with no sign-ups.
  const signupsByDay = new Map(signupRows.map((row) => [row.day, row.count]));
  const signups = [];
  for (let back = 13; back >= 0; back -= 1) {
    const day = toDayString(new Date(now.getTime() - back * DAY_MS));
    signups.push({ day, count: signupsByDay.get(day) ?? 0 });
  }

  let money: {
    currency: string;
    grossLast30DaysCents: number;
    paymentsLast30Days: number;
    pendingPayouts: { count: number; amountCents: number };
  } | null = null;

  if (actor.adminRank === "SUPER_ADMIN") {
    const [gross, payouts] = await Promise.all([
      prisma.payment.aggregate({
        where: { status: "SUCCESS", completedAt: { gte: days30 } },
        _sum: { usdCents: true },
        _count: { _all: true },
      }),
      prisma.payoutRequest.aggregate({
        where: { status: "PENDING" },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
    ]);
    money = {
      currency: "USD",
      grossLast30DaysCents: gross._sum.usdCents ?? 0,
      paymentsLast30Days: gross._count._all,
      pendingPayouts: {
        count: payouts._count._all,
        amountCents: payouts._sum.amountCents ?? 0,
      },
    };
  }

  return {
    generatedAt: now,
    people: {
      totalUsers: totalUsers - deletedUsers,
      newLast7Days: newUsers7,
      newLast30Days: newUsers30,
      writers,
      pendingWriterApplications: pendingWriters,
      premiumReaders,
      activeMembers,
    },
    content: {
      publishedStories,
      draftStories,
      hiddenStories,
      publishedChapters,
      comments,
    },
    attention: {
      openReports,
      pendingWriterApplications: pendingWriters,
    },
    running: { liveAds, activeChallenges },
    signupsLast14Days: signups,
    money,
  };
}

// Location: backend/services/adminDashboard.service.ts
// End of file: adminDashboard.service.ts