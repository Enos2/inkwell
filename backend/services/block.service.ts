// Location: backend/services/block.service.ts
// Purpose: Blocking people. Blocking stops messages in both directions and
// removes any follows between the two people. You can unblock at any time, and
// see the list of people you blocked.

import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import type { AuthUser } from "../utils/selects";

export async function blockUser(user: AuthUser, targetId: string) {
  if (targetId === user.id) {
    throw new AppError("You cannot block yourself", 400);
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true },
  });
  if (!target) throw new AppError("User not found", 404);

  await prisma.$transaction([
    prisma.userBlock.upsert({
      where: {
        blockerId_blockedId: { blockerId: user.id, blockedId: targetId },
      },
      create: { blockerId: user.id, blockedId: targetId },
      update: {},
    }),
    prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: user.id, followingId: targetId },
          { followerId: targetId, followingId: user.id },
        ],
      },
    }),
  ]);

  return { blocked: true, userId: targetId };
}

export async function unblockUser(user: AuthUser, targetId: string) {
  await prisma.userBlock.deleteMany({
    where: { blockerId: user.id, blockedId: targetId },
  });
  return { blocked: false, userId: targetId };
}

export async function listBlocks(user: AuthUser, page: number, limit: number) {
  const where = { blockerId: user.id };

  const [rows, total] = await prisma.$transaction([
    prisma.userBlock.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        createdAt: true,
        blocked: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    }),
    prisma.userBlock.count({ where }),
  ]);

  return {
    blocked: rows.map((row) => ({ ...row.blocked, blockedAt: row.createdAt })),
    page,
    limit,
    total,
  };
}

// Location: backend/services/block.service.ts
// End of file: block.service.ts