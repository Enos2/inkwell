// Location: backend/services/catalog.service.ts
// Purpose: The things that can be bought. Gift types (admin manages them, anyone
// can see the active ones) and membership tiers (an approved writer makes up to
// 3 active tiers; readers see them). Also lists a reader's memberships and
// marks expired memberships. A membership is a 30-day pass that the reader
// renews. Also holds canReceiveSupport: who may receive tips, gifts and
// memberships.

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import { MEMBERSHIP_DAYS } from "../utils/money";
import type { AuthUser } from "../utils/selects";
import type {
  CreateGiftTypeInput,
  CreateTierInput,
  UpdateGiftTypeInput,
  UpdateTierInput,
} from "../validators/payment.validator";
import { isAccountBlocked } from "./session.service";
import { assertWriter } from "./storyAccess.service";

const MAX_ACTIVE_TIERS = 3;

// Approved writers (and the Super Admin) can receive money.
export function canReceiveSupport(user: {
  writerStatus: string;
  adminRank: string | null;
}): boolean {
  return user.writerStatus === "APPROVED" || user.adminRank === "SUPER_ADMIN";
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

// ---------------------------------------------------------------- GIFT TYPES

const giftTypeSelect = {
  id: true,
  name: true,
  emoji: true,
  priceCents: true,
  isActive: true,
} as const satisfies Prisma.GiftTypeSelect;

export async function listGiftTypes() {
  const giftTypes = await prisma.giftType.findMany({
    where: { isActive: true },
    orderBy: { priceCents: "asc" },
    select: giftTypeSelect,
  });
  return { giftTypes, currency: "USD" };
}

export async function listAllGiftTypes() {
  const giftTypes = await prisma.giftType.findMany({
    orderBy: { priceCents: "asc" },
    select: giftTypeSelect,
  });
  return { giftTypes, currency: "USD" };
}

// Creates Rose, Coffee, Crown and Trophy, but only if there are no gifts yet.
export async function seedDefaultGiftTypes(actor: AuthUser) {
  const existing = await prisma.giftType.count();
  if (existing > 0) {
    throw new AppError("Gift types already exist", 409);
  }

  await prisma.$transaction([
    prisma.giftType.createMany({
      data: [
        { name: "Rose", emoji: "🌹", priceCents: 100 },
        { name: "Coffee", emoji: "☕", priceCents: 200 },
        { name: "Crown", emoji: "👑", priceCents: 500 },
        { name: "Trophy", emoji: "🏆", priceCents: 1000 },
      ],
    }),
    prisma.adminActionLog.create({
      data: { actorId: actor.id, action: "GIFT_TYPES_SEEDED" },
    }),
  ]);

  return listAllGiftTypes();
}

export async function createGiftType(
  actor: AuthUser,
  input: CreateGiftTypeInput
) {
  try {
    const giftType = await prisma.$transaction(async (tx) => {
      const created = await tx.giftType.create({
        data: input,
        select: giftTypeSelect,
      });
      await tx.adminActionLog.create({
        data: {
          actorId: actor.id,
          action: "GIFT_TYPE_CREATED",
          details: { giftTypeId: created.id, name: created.name },
        },
      });
      return created;
    });
    return { giftType };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("A gift with that name already exists", 409);
    }
    throw error;
  }
}

export async function updateGiftType(
  actor: AuthUser,
  giftTypeId: string,
  input: UpdateGiftTypeInput
) {
  const existing = await prisma.giftType.findUnique({
    where: { id: giftTypeId },
    select: { id: true, name: true },
  });
  if (!existing) throw new AppError("Gift type not found", 404);

  const data: Prisma.GiftTypeUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.emoji !== undefined) data.emoji = input.emoji;
  if (input.priceCents !== undefined) data.priceCents = input.priceCents;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  try {
    const giftType = await prisma.$transaction(async (tx) => {
      const updated = await tx.giftType.update({
        where: { id: giftTypeId },
        data,
        select: giftTypeSelect,
      });
      await tx.adminActionLog.create({
        data: {
          actorId: actor.id,
          action: "GIFT_TYPE_UPDATED",
          details: { giftTypeId, name: existing.name },
        },
      });
      return updated;
    });
    return { giftType };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("A gift with that name already exists", 409);
    }
    throw error;
  }
}

// ---------------------------------------------------------------- TIERS

const tierSelect = {
  id: true,
  name: true,
  description: true,
  priceCents: true,
  currency: true,
  isActive: true,
} as const satisfies Prisma.MembershipTierSelect;

// The public list of a writer's membership tiers.
export async function listWriterTiers(username: string) {
  const writer = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      status: true,
      bannedUntil: true,
    },
  });
  if (!writer || isAccountBlocked(writer)) {
    throw new AppError("User not found", 404);
  }

  const tiers = await prisma.membershipTier.findMany({
    where: { writerId: writer.id, isActive: true },
    orderBy: { priceCents: "asc" },
    select: tierSelect,
  });

  return {
    writer: {
      id: writer.id,
      username: writer.username,
      displayName: writer.displayName,
      avatarUrl: writer.avatarUrl,
    },
    tiers,
    durationDays: MEMBERSHIP_DAYS,
  };
}

export async function listMyTiers(user: AuthUser) {
  const now = new Date();
  const tiers = await prisma.membershipTier.findMany({
    where: { writerId: user.id },
    orderBy: { priceCents: "asc" },
    select: {
      ...tierSelect,
      _count: {
        select: {
          memberships: {
            where: {
              status: "ACTIVE",
              OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            },
          },
        },
      },
    },
  });

  return {
    tiers: tiers.map(({ _count, ...tier }) => ({
      ...tier,
      activeMembers: _count.memberships,
    })),
    durationDays: MEMBERSHIP_DAYS,
  };
}

export async function createTier(user: AuthUser, input: CreateTierInput) {
  assertWriter(user);

  const active = await prisma.membershipTier.count({
    where: { writerId: user.id, isActive: true },
  });
  if (active >= MAX_ACTIVE_TIERS) {
    throw new AppError(
      `You can have up to ${MAX_ACTIVE_TIERS} active membership tiers`,
      400
    );
  }

  const tier = await prisma.membershipTier.create({
    data: {
      writerId: user.id,
      name: input.name,
      description: input.description ?? null,
      priceCents: input.priceCents,
    },
    select: tierSelect,
  });

  return { tier };
}

// A price change only affects new payments. People who already paid keep their
// days. Switching a tier off stops new sales, and current members keep access
// until their pass ends.
export async function updateTier(
  user: AuthUser,
  tierId: string,
  input: UpdateTierInput
) {
  const tier = await prisma.membershipTier.findUnique({
    where: { id: tierId },
    select: { id: true, writerId: true, isActive: true },
  });
  if (!tier) throw new AppError("Tier not found", 404);
  if (tier.writerId !== user.id) {
    throw new AppError("You can only change your own tiers", 403);
  }

  if (input.isActive === true && !tier.isActive) {
    const active = await prisma.membershipTier.count({
      where: { writerId: user.id, isActive: true },
    });
    if (active >= MAX_ACTIVE_TIERS) {
      throw new AppError(
        `You can have up to ${MAX_ACTIVE_TIERS} active membership tiers`,
        400
      );
    }
  }

  const data: Prisma.MembershipTierUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.priceCents !== undefined) data.priceCents = input.priceCents;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  const updated = await prisma.membershipTier.update({
    where: { id: tierId },
    data,
    select: tierSelect,
  });

  return { tier: updated };
}

// ---------------------------------------------------------------- MEMBERSHIPS

export async function listMyMemberships(user: AuthUser) {
  const now = new Date();
  const rows = await prisma.membership.findMany({
    where: { subscriberId: user.id },
    orderBy: { endsAt: "desc" },
    select: {
      id: true,
      status: true,
      startedAt: true,
      endsAt: true,
      tier: {
        select: {
          id: true,
          name: true,
          priceCents: true,
          currency: true,
          isActive: true,
          writer: {
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
  });

  return {
    memberships: rows.map((row) => ({
      ...row,
      isActive:
        row.status === "ACTIVE" && (row.endsAt === null || row.endsAt > now),
    })),
  };
}

// Marks memberships whose 30 days have passed as EXPIRED.
export async function expireMemberships(): Promise<number> {
  const result = await prisma.membership.updateMany({
    where: { status: "ACTIVE", endsAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

// Location: backend/services/catalog.service.ts
// End of file: catalog.service.ts