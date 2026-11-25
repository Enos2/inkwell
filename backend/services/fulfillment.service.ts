// Location: backend/services/fulfillment.service.ts
// Purpose: Delivers what was paid for, exactly once. A payment is only
// delivered after Paystack confirms it (a signed webhook, or the "verify" check
// that asks Paystack directly), and only if the amount and currency match what
// we asked for. The payment is claimed first (PENDING to SUCCESS) in the same
// database step that delivers the product, so a repeated webhook can never
// deliver twice and a crash can never lose a payment. Tips, gifts and
// memberships credit the writer's wallet; Premium extends the reader's ad-free
// days.

import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import {
  addDays,
  formatUsd,
  MEMBERSHIP_DAYS,
  PREMIUM_DAYS,
} from "../utils/money";
import type { AuthUser } from "../utils/selects";
import { createNotification } from "./notification.service";
import { verifyTransaction } from "./paystack.service";

type Notice = {
  userId: string;
  type: "TIP" | "GIFT" | "SYSTEM";
  message: string;
  link?: string;
};

const tipMeta = z.object({
  receiverId: z.string(),
  message: z.string().nullable().optional(),
  usdCents: z.number(),
  feeCents: z.number(),
  shareCents: z.number(),
});

const giftMeta = z.object({
  receiverId: z.string(),
  giftTypeId: z.string(),
  giftLabel: z.string(),
  storyId: z.string().nullable().optional(),
  quantity: z.number(),
  usdCents: z.number(),
  feeCents: z.number(),
  shareCents: z.number(),
});

const membershipMeta = z.object({
  writerId: z.string(),
  tierId: z.string(),
  tierName: z.string(),
  usdCents: z.number(),
  feeCents: z.number(),
  shareCents: z.number(),
});

type PaymentToApply = {
  id: string;
  userId: string;
  purpose: string;
  metadata: Prisma.JsonValue | null;
};

// Runs INSIDE the database transaction. Returns the notifications to send
// after the transaction is saved.
async function applyPayment(
  tx: Prisma.TransactionClient,
  payment: PaymentToApply,
  now: Date
): Promise<Notice[]> {
  const sender = await tx.user.findUnique({
    where: { id: payment.userId },
    select: { displayName: true, premiumUntil: true },
  });
  const senderName = sender?.displayName ?? "A reader";

  switch (payment.purpose) {
    case "TIP": {
      const meta = tipMeta.parse(payment.metadata);
      await tx.tip.create({
        data: {
          senderId: payment.userId,
          receiverId: meta.receiverId,
          amountCents: meta.usdCents,
          platformFeeCents: meta.feeCents,
          currency: "USD",
          message: meta.message ?? null,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          userId: meta.receiverId,
          type: "TIP",
          amountCents: meta.shareCents,
          paymentId: payment.id,
          note: `Tip from ${senderName}`,
        },
      });
      return [
        {
          userId: meta.receiverId,
          type: "TIP",
          message: `${senderName} sent you a tip of ${formatUsd(meta.usdCents)}`,
          link: "/wallet",
        },
      ];
    }

    case "GIFT": {
      const meta = giftMeta.parse(payment.metadata);
      await tx.giftTransaction.create({
        data: {
          senderId: payment.userId,
          receiverId: meta.receiverId,
          giftTypeId: meta.giftTypeId,
          storyId: meta.storyId ?? null,
          quantity: meta.quantity,
          totalCents: meta.usdCents,
          platformFeeCents: meta.feeCents,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          userId: meta.receiverId,
          type: "GIFT",
          amountCents: meta.shareCents,
          paymentId: payment.id,
          note: `Gift from ${senderName}`,
        },
      });
      return [
        {
          userId: meta.receiverId,
          type: "GIFT",
          message: `${senderName} sent you ${meta.quantity} x ${meta.giftLabel}`,
          link: "/wallet",
        },
      ];
    }

    case "MEMBERSHIP": {
      const meta = membershipMeta.parse(payment.metadata);
      const existing = await tx.membership.findUnique({
        where: {
          subscriberId_tierId: {
            subscriberId: payment.userId,
            tierId: meta.tierId,
          },
        },
      });

      // Renewing early adds 30 days on top of the days that are left.
      const base =
        existing?.endsAt && existing.endsAt.getTime() > now.getTime()
          ? existing.endsAt
          : now;
      const endsAt = addDays(base, MEMBERSHIP_DAYS);

      if (existing) {
        await tx.membership.update({
          where: { id: existing.id },
          data: { status: "ACTIVE", endsAt },
        });
      } else {
        await tx.membership.create({
          data: {
            subscriberId: payment.userId,
            tierId: meta.tierId,
            status: "ACTIVE",
            endsAt,
          },
        });
      }

      await tx.ledgerEntry.create({
        data: {
          userId: meta.writerId,
          type: "MEMBERSHIP",
          amountCents: meta.shareCents,
          paymentId: payment.id,
          note: `${meta.tierName} membership from ${senderName}`,
        },
      });

      return [
        {
          userId: meta.writerId,
          type: "SYSTEM",
          message: `${senderName} is now a ${meta.tierName} member`,
          link: "/wallet",
        },
        {
          userId: payment.userId,
          type: "SYSTEM",
          message: `Your ${meta.tierName} membership is active until ${endsAt.toISOString().slice(0, 10)}`,
        },
      ];
    }

    case "PREMIUM": {
      const base =
        sender?.premiumUntil && sender.premiumUntil.getTime() > now.getTime()
          ? sender.premiumUntil
          : now;
      const until = addDays(base, PREMIUM_DAYS);

      await tx.user.update({
        where: { id: payment.userId },
        data: { premiumUntil: until },
      });

      return [
        {
          userId: payment.userId,
          type: "SYSTEM",
          message: `Thank you! Inkwell Premium is active until ${until.toISOString().slice(0, 10)}`,
        },
      ];
    }

    default:
      throw new Error(`Unknown payment purpose: ${payment.purpose}`);
  }
}

export type PaymentOutcome =
  | "fulfilled"
  | "already_done"
  | "not_found"
  | "ignored"
  | "mismatch";

// Delivers a payment that the provider says succeeded. "observed" is the amount
// and currency the provider reports, which must match what we asked for.
export async function confirmPayment(
  reference: string,
  observed: { amount: number; currency: string }
): Promise<{ outcome: PaymentOutcome; purpose?: string }> {
  const payment = await prisma.payment.findUnique({
    where: { providerRef: reference },
    select: {
      id: true,
      userId: true,
      purpose: true,
      metadata: true,
      amountCents: true,
      currency: true,
      status: true,
    },
  });

  if (!payment) return { outcome: "not_found" };
  if (payment.status === "SUCCESS") {
    return { outcome: "already_done", purpose: payment.purpose };
  }
  if (payment.status !== "PENDING") return { outcome: "ignored" };

  const sameAmount = observed.amount === payment.amountCents;
  const sameCurrency = observed.currency.toUpperCase() === payment.currency;
  if (!sameAmount || !sameCurrency) {
    // Left PENDING on purpose, with a note, so an admin can look into it.
    console.error("Payment mismatch", reference, observed, {
      amountCents: payment.amountCents,
      currency: payment.currency,
    });
    await prisma.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: {
        failureNote:
          "The amount or currency reported by the provider did not match the order. Needs review.",
      },
    });
    return { outcome: "mismatch" };
  }

  const now = new Date();
  const notices = await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: { status: "SUCCESS", completedAt: now, failureNote: null },
      });
      if (claimed.count === 0) return null;
      return applyPayment(tx, payment, now);
    },
    { maxWait: 10_000, timeout: 20_000 }
  );

  if (notices === null) {
    return { outcome: "already_done", purpose: payment.purpose };
  }

  for (const notice of notices) {
    await createNotification(
      notice.userId,
      notice.type,
      notice.message,
      notice.link
    );
  }

  return { outcome: "fulfilled", purpose: payment.purpose };
}

// ---------------------------------------------------------------- WEBHOOK

const webhookSchema = z.object({
  event: z.string(),
  data: z.object({
    reference: z.string(),
    status: z.string().optional(),
    amount: z.number(),
    currency: z.string(),
  }),
});

// The webhook route has already checked the signature. Only successful charges
// matter; every other event is politely ignored.
export async function handlePaystackEvent(body: unknown) {
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) return { handled: false };

  const { event, data } = parsed.data;
  if (event !== "charge.success" || data.status !== "success") {
    return { handled: false };
  }

  const result = await confirmPayment(data.reference, {
    amount: data.amount,
    currency: data.currency,
  });
  return { handled: true, outcome: result.outcome };
}

// ---------------------------------------------------------------- VERIFY

// The website calls this when the reader comes back from the payment page, in
// case the webhook has not arrived yet. It asks Paystack directly. A person can
// only check their OWN payments.
export async function confirmMyPayment(user: AuthUser, reference: string) {
  const payment = await prisma.payment.findFirst({
    where: { providerRef: reference, userId: user.id },
    select: { id: true, status: true },
  });
  if (!payment) throw new AppError("Payment not found", 404);

  if (payment.status === "PENDING" && !env.PAYMENTS_SANDBOX) {
    const verified = await verifyTransaction(reference);
    if (verified.status === "success") {
      await confirmPayment(reference, {
        amount: verified.amount,
        currency: verified.currency,
      });
    }
  }

  const latest = await prisma.payment.findUnique({
    where: { id: payment.id },
    select: {
      providerRef: true,
      purpose: true,
      amountCents: true,
      currency: true,
      status: true,
      completedAt: true,
    },
  });

  return { payment: latest };
}

// ---------------------------------------------------------------- SANDBOX

// Only works in sandbox mode (never in production): pretends the provider
// confirmed the reader's own pending payment, so the whole flow can be tested
// without a payment account.
export async function completeSandboxPayment(
  user: AuthUser,
  reference: string
) {
  if (!env.PAYMENTS_SANDBOX) {
    throw new AppError("Not found", 404);
  }

  const payment = await prisma.payment.findFirst({
    where: { providerRef: reference, userId: user.id },
    select: { amountCents: true, currency: true, status: true },
  });
  if (!payment) throw new AppError("Payment not found", 404);

  const result = await confirmPayment(reference, {
    amount: payment.amountCents,
    currency: payment.currency,
  });
  return { outcome: result.outcome };
}

// Location: backend/services/fulfillment.service.ts
// End of file: fulfillment.service.ts