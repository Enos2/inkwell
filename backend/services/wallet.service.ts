// Location: backend/services/wallet.service.ts
// Purpose: The writer's wallet. Shows the balance (everything earned from tips,
// gifts and memberships, minus payouts), the history of every movement, and
// lets an approved writer request a payout. Asking for a payout takes the money
// out of the balance straight away, so it cannot be spent twice. If the Super
// Admin rejects it, the money goes back. A lock per writer stops two requests
// made at the same moment from overspending.

import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import { formatUsd, MIN_PAYOUT_USD_CENTS } from "../utils/money";
import type { AuthUser } from "../utils/selects";
import type { PayoutRequestInput } from "../validators/payment.validator";
import { canReceiveSupport } from "./catalog.service";

export async function getWallet(user: AuthUser) {
  const [balance, lifetime, pendingPayout] = await Promise.all([
    prisma.ledgerEntry.aggregate({
      where: { userId: user.id },
      _sum: { amountCents: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { userId: user.id, type: { in: ["TIP", "GIFT", "MEMBERSHIP"] } },
      _sum: { amountCents: true },
    }),
    prisma.payoutRequest.findFirst({
      where: { userId: user.id, status: "PENDING" },
      select: {
        id: true,
        amountCents: true,
        method: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    wallet: {
      currency: "USD",
      availableCents: balance._sum.amountCents ?? 0,
      lifetimeEarnedCents: lifetime._sum.amountCents ?? 0,
      minPayoutCents: MIN_PAYOUT_USD_CENTS,
      pendingPayout,
    },
  };
}

export async function listLedger(user: AuthUser, page: number, limit: number) {
  const where = { userId: user.id };

  const [entries, total] = await prisma.$transaction([
    prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        type: true,
        amountCents: true,
        note: true,
        createdAt: true,
      },
    }),
    prisma.ledgerEntry.count({ where }),
  ]);

  return { entries, page, limit, total, currency: "USD" };
}

export async function requestPayout(
  user: AuthUser,
  input: PayoutRequestInput
) {
  if (!canReceiveSupport(user)) {
    throw new AppError("Only approved writers can request a payout", 403);
  }
  if (input.amountCents < MIN_PAYOUT_USD_CENTS) {
    throw new AppError(
      `The smallest payout is ${formatUsd(MIN_PAYOUT_USD_CENTS)}`,
      400
    );
  }

  const payout = await prisma.$transaction(
    async (tx) => {
      // One writer at a time: a second request waits here until the first ends.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;

      const waiting = await tx.payoutRequest.count({
        where: { userId: user.id, status: "PENDING" },
      });
      if (waiting > 0) {
        throw new AppError(
          "You already have a payout waiting to be paid",
          409
        );
      }

      const balance = await tx.ledgerEntry.aggregate({
        where: { userId: user.id },
        _sum: { amountCents: true },
      });
      const available = balance._sum.amountCents ?? 0;
      if (input.amountCents > available) {
        throw new AppError("That is more than your available balance", 400);
      }

      const created = await tx.payoutRequest.create({
        data: {
          userId: user.id,
          amountCents: input.amountCents,
          method: input.method,
          details: input.details,
        },
        select: {
          id: true,
          amountCents: true,
          method: true,
          status: true,
          createdAt: true,
        },
      });

      await tx.ledgerEntry.create({
        data: {
          userId: user.id,
          type: "PAYOUT",
          amountCents: -input.amountCents,
          payoutId: created.id,
          note: "Payout requested",
        },
      });

      return created;
    },
    { maxWait: 10_000, timeout: 20_000 }
  );

  return { payout };
}

export async function listMyPayouts(
  user: AuthUser,
  page: number,
  limit: number
) {
  const where = { userId: user.id };

  const [payouts, total] = await prisma.$transaction([
    prisma.payoutRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        amountCents: true,
        method: true,
        status: true,
        handledNote: true,
        createdAt: true,
        handledAt: true,
      },
    }),
    prisma.payoutRequest.count({ where }),
  ]);

  return { payouts, page, limit, total, currency: "USD" };
}

// Location: backend/services/wallet.service.ts
// End of file: wallet.service.ts