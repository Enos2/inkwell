// Location: backend/services/paymentAdmin.service.ts
// Purpose: The Super Admin's money tools: a summary (what came in, what is owed
// to writers, what the platform keeps before the payment provider's own fees),
// a list of payments (including ones that need review), and the payout queue
// where payouts are marked paid or rejected. A rejected payout returns the
// money to the writer's balance. Every decision is written to the activity log.

import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import { formatUsd } from "../utils/money";
import type { AuthUser } from "../utils/selects";
import type {
  AdminPaymentsQuery,
  AdminPayoutsQuery,
  HandlePayoutInput,
} from "../validators/payment.validator";
import { createNotification } from "./notification.service";

export async function getPaymentsSummary() {
  const [byPurpose, earned, owed, pending] = await Promise.all([
    prisma.payment.groupBy({
      by: ["purpose"],
      where: { status: "SUCCESS" },
      _sum: { usdCents: true },
      _count: { _all: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { type: { in: ["TIP", "GIFT", "MEMBERSHIP"] } },
      _sum: { amountCents: true },
    }),
    prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } }),
    prisma.payoutRequest.aggregate({
      where: { status: "PENDING" },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
  ]);

  const grossCents = byPurpose.reduce(
    (total, row) => total + (row._sum.usdCents ?? 0),
    0
  );
  const writerEarnedCents = earned._sum.amountCents ?? 0;

  return {
    currency: "USD",
    grossCents,
    byPurpose: byPurpose.map((row) => ({
      purpose: row.purpose,
      payments: row._count._all,
      grossCents: row._sum.usdCents ?? 0,
    })),
    writerEarnedCents,
    // What stays with the platform, BEFORE the payment provider's own fees.
    platformRevenueCents: grossCents - writerEarnedCents,
    // Money currently held for writers (earned minus everything paid out).
    owedToWritersCents: owed._sum.amountCents ?? 0,
    pendingPayouts: {
      count: pending._count._all,
      amountCents: pending._sum.amountCents ?? 0,
    },
  };
}

export async function listPayments(query: AdminPaymentsQuery) {
  const where: Prisma.PaymentWhereInput =
    query.status === "all" ? {} : { status: query.status };

  const [payments, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        providerRef: true,
        provider: true,
        purpose: true,
        amountCents: true,
        currency: true,
        usdCents: true,
        status: true,
        failureNote: true,
        createdAt: true,
        completedAt: true,
        user: { select: { id: true, username: true } },
      },
    }),
    prisma.payment.count({ where }),
  ]);

  return { payments, page: query.page, limit: query.limit, total };
}

export async function listPayoutRequests(query: AdminPayoutsQuery) {
  const where: Prisma.PayoutRequestWhereInput =
    query.status === "all" ? {} : { status: query.status };

  const [payouts, total] = await prisma.$transaction([
    prisma.payoutRequest.findMany({
      where,
      orderBy: { createdAt: query.status === "PENDING" ? "asc" : "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        amountCents: true,
        method: true,
        details: true,
        status: true,
        handledNote: true,
        createdAt: true,
        handledAt: true,
        user: {
          select: { id: true, username: true, displayName: true, email: true },
        },
        handledBy: { select: { id: true, username: true } },
      },
    }),
    prisma.payoutRequest.count({ where }),
  ]);

  return {
    payouts,
    page: query.page,
    limit: query.limit,
    total,
    currency: "USD",
  };
}

// PAID means you really sent the money (for example through Paystack to the
// writer's M-Pesa). REJECTED returns the money to the writer's balance.
export async function handlePayout(
  actor: AuthUser,
  payoutId: string,
  input: HandlePayoutInput
) {
  const request = await prisma.payoutRequest.findUnique({
    where: { id: payoutId },
    select: { id: true, userId: true, amountCents: true, method: true, status: true },
  });
  if (!request) throw new AppError("Payout not found", 404);
  if (request.status !== "PENDING") {
    throw new AppError("This payout was already handled", 409);
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.payoutRequest.updateMany({
      where: { id: payoutId, status: "PENDING" },
      data: {
        status: input.decision,
        handledById: actor.id,
        handledNote: input.note ?? null,
        handledAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new AppError("This payout was already handled", 409);
    }

    if (input.decision === "REJECTED") {
      await tx.ledgerEntry.create({
        data: {
          userId: request.userId,
          type: "PAYOUT_REVERSAL",
          amountCents: request.amountCents,
          payoutId,
          note: "Payout rejected: returned to your balance",
        },
      });
    }

    await tx.adminActionLog.create({
      data: {
        actorId: actor.id,
        targetUserId: request.userId,
        action: input.decision === "PAID" ? "PAYOUT_PAID" : "PAYOUT_REJECTED",
        details: {
          payoutId,
          amountCents: request.amountCents,
          method: request.method,
        },
      },
    });
  });

  await createNotification(
    request.userId,
    "SYSTEM",
    input.decision === "PAID"
      ? `Your payout of ${formatUsd(request.amountCents)} has been sent`
      : `Your payout of ${formatUsd(request.amountCents)} was not approved and is back in your balance. Reason: ${input.note ?? ""}`,
    "/wallet"
  );

  return { payoutId, status: input.decision };
}

// Location: backend/services/paymentAdmin.service.ts
// End of file: paymentAdmin.service.ts