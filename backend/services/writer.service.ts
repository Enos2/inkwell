// Location: backend/services/writer.service.ts
// Purpose: The writer application process. A user applies, and an admin with
// the APPROVE_WRITERS ability approves or rejects. A rejected user goes back to
// "no application" and may apply again. Every decision is written to the admin
// activity log.

import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import type { AuthUser } from "../utils/selects";

export async function applyToBeWriter(user: AuthUser) {
  if (user.writerStatus === "APPROVED") {
    throw new AppError("You are already an approved writer", 409);
  }
  if (user.writerStatus === "PENDING") {
    throw new AppError("Your application is already waiting for approval", 409);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { writerStatus: "PENDING" },
  });

  return {
    writerStatus: "PENDING",
    message: "Application sent. An admin will review it.",
  };
}

export async function listApplications(page: number, limit: number) {
  const where = { writerStatus: "PENDING" as const };

  const [applications, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        country: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return { applications, page, limit, total };
}

export async function reviewApplication(
  actorId: string,
  userId: string,
  decision: "APPROVE" | "REJECT"
) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, writerStatus: true },
  });
  if (!target) throw new AppError("User not found", 404);
  if (target.writerStatus !== "PENDING") {
    throw new AppError("This user has no pending application", 400);
  }

  const approved = decision === "APPROVE";

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { writerStatus: approved ? "APPROVED" : "NONE" },
    }),
    prisma.adminActionLog.create({
      data: {
        actorId,
        targetUserId: userId,
        action: approved ? "WRITER_APPROVED" : "WRITER_REJECTED",
      },
    }),
  ]);

  return { userId, writerStatus: approved ? "APPROVED" : "NONE" };
}

// Location: backend/services/writer.service.ts
// End of file: writer.service.ts