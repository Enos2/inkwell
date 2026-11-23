// Location: backend/services/admin.service.ts
// Purpose: Everything the Super Admin can do to other admins: list them,
// promote a user to a rank, change a rank (promote or demote), remove admin
// status, and switch single abilities on or off for one person. Every action is
// written to the activity log in the same step.

import type { AdminRank, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import type { Permission } from "../config/permissions";
import { AppError } from "../utils/errors";
import { computeEffectivePermissions } from "./permission.service";

const adminSelect = {
  id: true,
  username: true,
  displayName: true,
  email: true,
  adminRank: true,
  status: true,
  createdAt: true,
  permissionOverrides: {
    select: { permission: true, allowed: true },
  },
} as const satisfies Prisma.UserSelect;

type AdminRecord = Prisma.UserGetPayload<{ select: typeof adminSelect }>;

function formatAdmin(user: AdminRecord) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    adminRank: user.adminRank,
    status: user.status,
    createdAt: user.createdAt,
    overrides: user.permissionOverrides,
    effectivePermissions: computeEffectivePermissions(
      user.adminRank,
      user.permissionOverrides
    ),
  };
}

async function getAdminDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: adminSelect,
  });
  if (!user) throw new AppError("User not found", 404);
  return formatAdmin(user);
}

// Finds a user who is an admin and is not the Super Admin, or throws.
async function findEditableAdmin(userId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new AppError("User not found", 404);
  if (target.adminRank === "SUPER_ADMIN") {
    throw new AppError("The Super Admin cannot be changed", 403);
  }
  if (!target.adminRank) {
    throw new AppError("This user is not an admin", 400);
  }
  return target;
}

export async function listAdmins() {
  const admins = await prisma.user.findMany({
    where: { adminRank: { not: null } },
    select: adminSelect,
    orderBy: { createdAt: "asc" },
  });
  return admins.map(formatAdmin);
}

export async function promoteUser(
  actorId: string,
  input: { username: string; rank: AdminRank }
) {
  const target = await prisma.user.findUnique({
    where: { username: input.username },
  });
  if (!target) throw new AppError("No user has that username", 404);
  if (target.adminRank) {
    throw new AppError(
      "This user is already an admin. Use the change-rank option instead",
      409
    );
  }
  if (target.status === "BANNED") {
    throw new AppError("A banned user cannot be made an admin", 400);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      data: { adminRank: input.rank },
    }),
    prisma.adminActionLog.create({
      data: {
        actorId,
        targetUserId: target.id,
        action: "ADMIN_PROMOTED",
        details: { rank: input.rank },
      },
    }),
  ]);

  return getAdminDetail(target.id);
}

// Changing a rank moves the person up or down. Their personal switches are
// cleared, so the new rank starts fresh with its default abilities.
export async function changeRank(
  actorId: string,
  userId: string,
  rank: AdminRank
) {
  const target = await findEditableAdmin(userId);
  if (target.adminRank === rank) {
    throw new AppError("This admin already has that rank", 400);
  }

  await prisma.$transaction([
    prisma.adminPermissionOverride.deleteMany({ where: { userId } }),
    prisma.user.update({ where: { id: userId }, data: { adminRank: rank } }),
    prisma.adminActionLog.create({
      data: {
        actorId,
        targetUserId: userId,
        action: "ADMIN_RANK_CHANGED",
        details: { from: target.adminRank, to: rank },
      },
    }),
  ]);

  return getAdminDetail(userId);
}

export async function removeAdmin(actorId: string, userId: string) {
  const target = await findEditableAdmin(userId);

  await prisma.$transaction([
    prisma.adminPermissionOverride.deleteMany({ where: { userId } }),
    prisma.user.update({ where: { id: userId }, data: { adminRank: null } }),
    prisma.adminActionLog.create({
      data: {
        actorId,
        targetUserId: userId,
        action: "ADMIN_REMOVED",
        details: { previousRank: target.adminRank },
      },
    }),
  ]);

  return { message: "Admin status removed", userId };
}

// Blocks (allowed: false) or grants (allowed: true) ONE ability for ONE admin.
export async function setPermissionOverride(
  actorId: string,
  userId: string,
  permission: Permission,
  allowed: boolean
) {
  await findEditableAdmin(userId);

  await prisma.$transaction([
    prisma.adminPermissionOverride.upsert({
      where: { userId_permission: { userId, permission } },
      create: { userId, permission, allowed, setById: actorId },
      update: { allowed, setById: actorId },
    }),
    prisma.adminActionLog.create({
      data: {
        actorId,
        targetUserId: userId,
        action: "PERMISSION_OVERRIDE_SET",
        details: { permission, allowed },
      },
    }),
  ]);

  return getAdminDetail(userId);
}

// Removes the personal switch, so the admin goes back to their rank default.
export async function clearPermissionOverride(
  actorId: string,
  userId: string,
  permission: Permission
) {
  await findEditableAdmin(userId);

  await prisma.$transaction([
    prisma.adminPermissionOverride.deleteMany({
      where: { userId, permission },
    }),
    prisma.adminActionLog.create({
      data: {
        actorId,
        targetUserId: userId,
        action: "PERMISSION_OVERRIDE_CLEARED",
        details: { permission },
      },
    }),
  ]);

  return getAdminDetail(userId);
}

export async function listLogs(page: number, limit: number) {
  const [logs, total] = await prisma.$transaction([
    prisma.adminActionLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        actor: { select: { id: true, username: true, adminRank: true } },
        targetUser: { select: { id: true, username: true } },
      },
    }),
    prisma.adminActionLog.count(),
  ]);

  return { logs, page, limit, total };
}

// Location: backend/services/admin.service.ts
// End of file: admin.service.ts