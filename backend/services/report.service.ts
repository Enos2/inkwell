// Location: backend/services/report.service.ts
// Purpose: The real work for reports. Users can report a story, chapter,
// comment or another user (not their own content, not twice while a report is
// still open, and no more than 10 an hour). They can see the status of their own
// reports. Admins can list the queue with a preview of what was reported, and
// resolve or dismiss a report. Every admin decision goes in the activity log.

import type { Prisma, ReportTargetType } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import type { AuthUser } from "../utils/selects";
import type {
  AdminListReportsQuery,
  CreateReportInput,
  ResolveReportInput,
} from "../validators/moderation.validator";
import { createNotification } from "./notification.service";
import { assertCanAccessChapter } from "./storyAccess.service";

const MAX_REPORTS_PER_HOUR = 10;
const HOUR_IN_MS = 60 * 60 * 1000;

// The report is stored as "CATEGORY" or "CATEGORY: details".
function buildReason(category: string, details?: string): string {
  return details ? `${category}: ${details}` : category;
}

function splitReason(reason: string): {
  category: string;
  details: string | null;
} {
  const index = reason.indexOf(":");
  if (index === -1) return { category: reason, details: null };
  return {
    category: reason.slice(0, index),
    details: reason.slice(index + 1).trim() || null,
  };
}

// Checks that the thing being reported exists, is public, can be seen by this
// reporter, and does not belong to the reporter. The same "not found" message
// is used for everything hidden, so nobody can probe for private content.
async function assertReportable(
  user: AuthUser,
  targetType: ReportTargetType,
  targetId: string
): Promise<void> {
  const notFound = new AppError("Content not found", 404);
  const own = new AppError("You cannot report your own content", 400);

  if (targetType === "STORY") {
    const story = await prisma.story.findUnique({
      where: { id: targetId },
      select: { authorId: true, status: true },
    });
    if (!story || story.status !== "PUBLISHED") throw notFound;
    if (story.authorId === user.id) throw own;
    return;
  }

  if (targetType === "CHAPTER") {
    const chapter = await prisma.chapter.findUnique({
      where: { id: targetId },
      select: {
        status: true,
        isMembersOnly: true,
        story: { select: { authorId: true, status: true } },
      },
    });
    if (
      !chapter ||
      chapter.status !== "PUBLISHED" ||
      chapter.story.status !== "PUBLISHED"
    ) {
      throw notFound;
    }
    if (chapter.story.authorId === user.id) throw own;
    await assertCanAccessChapter(chapter, chapter.story, user);
    return;
  }

  if (targetType === "COMMENT") {
    const comment = await prisma.comment.findUnique({
      where: { id: targetId },
      select: {
        authorId: true,
        status: true,
        story: { select: { status: true } },
      },
    });
    if (
      !comment ||
      comment.status !== "VISIBLE" ||
      comment.story.status !== "PUBLISHED"
    ) {
      throw notFound;
    }
    if (comment.authorId === user.id) throw own;
    return;
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true },
  });
  if (!target) throw notFound;
  if (target.id === user.id) {
    throw new AppError("You cannot report yourself", 400);
  }
}

export async function createReport(user: AuthUser, input: CreateReportInput) {
  const recent = await prisma.report.count({
    where: {
      reporterId: user.id,
      createdAt: { gt: new Date(Date.now() - HOUR_IN_MS) },
    },
  });
  if (recent >= MAX_REPORTS_PER_HOUR) {
    throw new AppError(
      "You have sent many reports in a short time. Please try again later",
      429
    );
  }

  await assertReportable(user, input.targetType, input.targetId);

  const duplicate = await prisma.report.findFirst({
    where: {
      reporterId: user.id,
      targetType: input.targetType,
      targetId: input.targetId,
      status: "OPEN",
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new AppError(
      "You have already reported this. An admin will review it",
      409
    );
  }

  const report = await prisma.report.create({
    data: {
      reporterId: user.id,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: buildReason(input.category, input.details),
    },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      status: true,
      createdAt: true,
    },
  });

  return { report, message: "Thank you. An admin will review your report." };
}

// A reporter sees the status of their own reports, but never the admins'
// private notes.
export async function listMyReports(
  user: AuthUser,
  page: number,
  limit: number
) {
  const where = { reporterId: user.id };

  const [rows, total] = await prisma.$transaction([
    prisma.report.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        targetType: true,
        targetId: true,
        reason: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
      },
    }),
    prisma.report.count({ where }),
  ]);

  const reports = rows.map((row) => {
    const { category, details } = splitReason(row.reason);
    return {
      id: row.id,
      targetType: row.targetType,
      targetId: row.targetId,
      category,
      details,
      status: row.status,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
    };
  });

  return { reports, page, limit, total };
}

// ---------------------------------------------------------------- ADMIN

const reportSelect = {
  id: true,
  targetType: true,
  targetId: true,
  reason: true,
  status: true,
  handledNote: true,
  createdAt: true,
  resolvedAt: true,
  reporter: { select: { id: true, username: true, displayName: true } },
  handledBy: { select: { id: true, username: true } },
} satisfies Prisma.ReportSelect;

// Fetches a short preview of everything the listed reports point at, in four
// queries instead of one per report. A deleted target shows as null.
async function loadTargets(
  rows: { targetType: ReportTargetType; targetId: string }[]
): Promise<Map<string, unknown>> {
  const idsFor = (type: ReportTargetType): string[] =>
    rows.filter((row) => row.targetType === type).map((row) => row.targetId);

  const [stories, chapters, comments, users] = await Promise.all([
    prisma.story.findMany({
      where: { id: { in: idsFor("STORY") } },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        author: { select: { id: true, username: true } },
      },
    }),
    prisma.chapter.findMany({
      where: { id: { in: idsFor("CHAPTER") } },
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        story: {
          select: {
            title: true,
            slug: true,
            author: { select: { id: true, username: true } },
          },
        },
      },
    }),
    prisma.comment.findMany({
      where: { id: { in: idsFor("COMMENT") } },
      select: {
        id: true,
        body: true,
        status: true,
        author: { select: { id: true, username: true } },
        story: { select: { title: true, slug: true } },
      },
    }),
    prisma.user.findMany({
      where: { id: { in: idsFor("USER") } },
      select: { id: true, username: true, displayName: true, status: true },
    }),
  ]);

  const previews = new Map<string, unknown>();
  for (const story of stories) previews.set(`STORY:${story.id}`, story);
  for (const chapter of chapters) {
    previews.set(`CHAPTER:${chapter.id}`, chapter);
  }
  for (const comment of comments) {
    previews.set(`COMMENT:${comment.id}`, {
      ...comment,
      body: comment.body.slice(0, 200),
    });
  }
  for (const user of users) previews.set(`USER:${user.id}`, user);

  return previews;
}

// The queue: open reports are listed oldest first so nothing waits forever.
export async function listReports(query: AdminListReportsQuery) {
  const where: Prisma.ReportWhereInput = {
    ...(query.status !== "all" ? { status: query.status } : {}),
    ...(query.targetType ? { targetType: query.targetType } : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.report.findMany({
      where,
      orderBy: { createdAt: query.status === "OPEN" ? "asc" : "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: reportSelect,
    }),
    prisma.report.count({ where }),
  ]);

  const previews = await loadTargets(rows);

  const reports = rows.map((row) => {
    const { category, details } = splitReason(row.reason);
    return {
      id: row.id,
      targetType: row.targetType,
      targetId: row.targetId,
      category,
      details,
      status: row.status,
      handledNote: row.handledNote,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
      reporter: row.reporter,
      handledBy: row.handledBy,
      target: previews.get(`${row.targetType}:${row.targetId}`) ?? null,
    };
  });

  return { reports, page: query.page, limit: query.limit, total };
}

export async function resolveReport(
  actor: AuthUser,
  reportId: string,
  input: ResolveReportInput
) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      reporterId: true,
      targetType: true,
      targetId: true,
      status: true,
    },
  });
  if (!report) throw new AppError("Report not found", 404);
  if (report.status !== "OPEN") {
    throw new AppError("This report was already handled", 409);
  }

  const now = new Date();
  const decisionData = {
    status: input.decision,
    handledById: actor.id,
    handledNote: input.note ?? null,
    resolvedAt: now,
  };

  const closedSimilar = await prisma.$transaction(async (tx) => {
    // The status check makes sure two admins cannot both handle the same report.
    const claimed = await tx.report.updateMany({
      where: { id: reportId, status: "OPEN" },
      data: decisionData,
    });
    if (claimed.count === 0) {
      throw new AppError("This report was already handled", 409);
    }

    let closed = 0;
    if (input.closeSimilar) {
      const others = await tx.report.updateMany({
        where: {
          targetType: report.targetType,
          targetId: report.targetId,
          status: "OPEN",
          id: { not: reportId },
        },
        data: decisionData,
      });
      closed = others.count;
    }

    await tx.adminActionLog.create({
      data: {
        actorId: actor.id,
        action:
          input.decision === "RESOLVED" ? "REPORT_RESOLVED" : "REPORT_DISMISSED",
        details: {
          reportId,
          targetType: report.targetType,
          targetId: report.targetId,
          closedSimilar: closed,
        },
      },
    });

    return closed;
  });

  await createNotification(
    report.reporterId,
    "SYSTEM",
    input.decision === "RESOLVED"
      ? "Thank you. We reviewed your report and took action where it was needed."
      : "We reviewed your report and did not find a rule violation."
  );

  return { reportId, status: input.decision, closedSimilar };
}

// Location: backend/services/report.service.ts
// End of file: report.service.ts