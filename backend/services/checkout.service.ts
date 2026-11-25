// Location: backend/services/checkout.service.ts
// Purpose: Starts a payment for a tip, a gift, a membership or Premium. It
// checks everything (the writer can receive money, nobody is blocked, the
// price is worked out HERE and never trusted from the user), saves a PENDING
// payment with the details to deliver later, and returns the Paystack checkout
// link. In sandbox mode no link is made. The product is delivered only after
// the payment is confirmed (see fulfillment.service.ts).

import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import {
  chargeToUsd,
  formatUsd,
  MAX_TIP_USD_CENTS,
  MIN_TIP_USD_CENTS,
  splitAmount,
  usdToCharge,
  type ChargeCurrency,
} from "../utils/money";
import type { AuthUser } from "../utils/selects";
import type {
  GiftCheckoutInput,
  MembershipCheckoutInput,
  PremiumCheckoutInput,
  TipCheckoutInput,
} from "../validators/payment.validator";
import { canReceiveSupport, listGiftTypes } from "./catalog.service";
import { getPaymentSettings } from "./paymentSettings.service";
import {
  assertPaymentsConfigured,
  initializeTransaction,
} from "./paystack.service";
import { isAccountBlocked } from "./session.service";

type Purpose = "TIP" | "GIFT" | "MEMBERSHIP" | "PREMIUM";

// ---------------------------------------------------------------- HELPERS

async function loadReceiver(
  sender: AuthUser,
  where: Prisma.UserWhereUniqueInput
) {
  const receiver = await prisma.user.findUnique({
    where,
    select: {
      id: true,
      username: true,
      displayName: true,
      status: true,
      bannedUntil: true,
      writerStatus: true,
      adminRank: true,
    },
  });
  if (!receiver || isAccountBlocked(receiver) || !canReceiveSupport(receiver)) {
    throw new AppError("This writer cannot receive support right now", 404);
  }
  if (receiver.id === sender.id) {
    throw new AppError("You cannot send support to yourself", 400);
  }

  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: sender.id, blockedId: receiver.id },
        { blockerId: receiver.id, blockedId: sender.id },
      ],
    },
    select: { id: true },
  });
  if (block) {
    throw new AppError("You cannot send support to this writer", 403);
  }

  return receiver;
}

type StartPaymentParams = {
  user: AuthUser;
  purpose: Purpose;
  amountCents: number;
  usdCents: number;
  currency: ChargeCurrency;
  description: string;
  metadata: Prisma.InputJsonObject;
};

async function startPayment(params: StartPaymentParams) {
  const reference = `ink-${randomBytes(12).toString("hex")}`;

  await prisma.payment.create({
    data: {
      userId: params.user.id,
      provider: env.PAYMENTS_SANDBOX ? "sandbox" : "paystack",
      providerRef: reference,
      amountCents: params.amountCents,
      currency: params.currency,
      usdCents: params.usdCents,
      purpose: params.purpose,
      metadata: params.metadata,
      status: "PENDING",
    },
  });

  let checkoutUrl: string | null = null;

  if (!env.PAYMENTS_SANDBOX) {
    try {
      const initialized = await initializeTransaction({
        email: params.user.email,
        amountCents: params.amountCents,
        currency: params.currency,
        reference,
        callbackUrl: `${env.FRONTEND_URL}/payments/complete`,
        metadata: { purpose: params.purpose, description: params.description },
      });
      checkoutUrl = initialized.authorizationUrl;
    } catch (error) {
      await prisma.payment.updateMany({
        where: { providerRef: reference, status: "PENDING" },
        data: {
          status: "FAILED",
          failureNote: "Could not start the payment with the provider",
        },
      });
      throw error;
    }
  }

  return {
    payment: {
      reference,
      purpose: params.purpose,
      amountCents: params.amountCents,
      currency: params.currency,
      usdCents: params.usdCents,
    },
    checkoutUrl,
    sandbox: env.PAYMENTS_SANDBOX,
  };
}

// ---------------------------------------------------------------- CHECKOUTS

export async function startTipCheckout(
  user: AuthUser,
  input: TipCheckoutInput
) {
  assertPaymentsConfigured();
  const settings = await getPaymentSettings();
  const receiver = await loadReceiver(user, { username: input.username });

  const usdCents = chargeToUsd(
    input.amountCents,
    input.currency,
    settings.kesPerUsd
  );
  if (usdCents < MIN_TIP_USD_CENTS || usdCents > MAX_TIP_USD_CENTS) {
    throw new AppError(
      `A tip must be between ${formatUsd(MIN_TIP_USD_CENTS)} and ${formatUsd(MAX_TIP_USD_CENTS)} (or the same value in shillings)`,
      400
    );
  }

  const { feeCents, shareCents } = splitAmount(
    usdCents,
    settings.platformFeePercent
  );

  return startPayment({
    user,
    purpose: "TIP",
    amountCents: input.amountCents,
    usdCents,
    currency: input.currency,
    description: `Tip for ${receiver.displayName}`,
    metadata: {
      receiverId: receiver.id,
      message: input.message ?? null,
      usdCents,
      feeCents,
      shareCents,
    },
  });
}

export async function startGiftCheckout(
  user: AuthUser,
  input: GiftCheckoutInput
) {
  assertPaymentsConfigured();
  const settings = await getPaymentSettings();
  const receiver = await loadReceiver(user, { username: input.username });

  const giftType = await prisma.giftType.findUnique({
    where: { id: input.giftTypeId },
    select: { id: true, name: true, emoji: true, priceCents: true, isActive: true },
  });
  if (!giftType || !giftType.isActive) {
    throw new AppError("Gift not found", 404);
  }

  if (input.storyId) {
    const story = await prisma.story.findUnique({
      where: { id: input.storyId },
      select: { authorId: true, status: true },
    });
    if (!story || story.status !== "PUBLISHED" || story.authorId !== receiver.id) {
      throw new AppError("That story does not belong to this writer", 400);
    }
  }

  const usdCents = giftType.priceCents * input.quantity;
  const amountCents = usdToCharge(usdCents, input.currency, settings.kesPerUsd);
  const { feeCents, shareCents } = splitAmount(
    usdCents,
    settings.platformFeePercent
  );

  return startPayment({
    user,
    purpose: "GIFT",
    amountCents,
    usdCents,
    currency: input.currency,
    description: `${input.quantity} x ${giftType.name} for ${receiver.displayName}`,
    metadata: {
      receiverId: receiver.id,
      giftTypeId: giftType.id,
      giftLabel: `${giftType.emoji} ${giftType.name}`,
      storyId: input.storyId ?? null,
      quantity: input.quantity,
      usdCents,
      feeCents,
      shareCents,
    },
  });
}

export async function startMembershipCheckout(
  user: AuthUser,
  input: MembershipCheckoutInput
) {
  assertPaymentsConfigured();
  const settings = await getPaymentSettings();

  const tier = await prisma.membershipTier.findUnique({
    where: { id: input.tierId },
    select: {
      id: true,
      name: true,
      priceCents: true,
      isActive: true,
      writerId: true,
    },
  });
  if (!tier || !tier.isActive) {
    throw new AppError("Membership tier not found", 404);
  }

  const writer = await loadReceiver(user, { id: tier.writerId });

  const usdCents = tier.priceCents;
  const amountCents = usdToCharge(usdCents, input.currency, settings.kesPerUsd);
  const { feeCents, shareCents } = splitAmount(
    usdCents,
    settings.platformFeePercent
  );

  return startPayment({
    user,
    purpose: "MEMBERSHIP",
    amountCents,
    usdCents,
    currency: input.currency,
    description: `${tier.name} membership with ${writer.displayName}`,
    metadata: {
      writerId: writer.id,
      tierId: tier.id,
      tierName: tier.name,
      usdCents,
      feeCents,
      shareCents,
    },
  });
}

export async function startPremiumCheckout(
  user: AuthUser,
  input: PremiumCheckoutInput
) {
  assertPaymentsConfigured();
  const settings = await getPaymentSettings();

  const usdCents = settings.premiumPriceCents;
  const amountCents = usdToCharge(usdCents, input.currency, settings.kesPerUsd);

  return startPayment({
    user,
    purpose: "PREMIUM",
    amountCents,
    usdCents,
    currency: input.currency,
    description: "Inkwell Premium (30 days)",
    metadata: { usdCents },
  });
}

// ---------------------------------------------------------------- PUBLIC INFO

// Everything the website needs to draw its payment screens.
export async function getPaymentConfig() {
  const settings = await getPaymentSettings();
  const { giftTypes } = await listGiftTypes();

  return {
    paymentsEnabled: env.PAYMENTS_SANDBOX || env.PAYSTACK_SECRET_KEY !== null,
    sandbox: env.PAYMENTS_SANDBOX,
    currencies: [
      { code: "USD", available: true },
      { code: "KES", available: settings.kesPerUsd !== null },
    ],
    kesPerUsd: settings.kesPerUsd,
    tips: { minUsdCents: MIN_TIP_USD_CENTS, maxUsdCents: MAX_TIP_USD_CENTS },
    premium: { priceCents: settings.premiumPriceCents, days: 30 },
    membershipDays: 30,
    writerSharePercent: 100 - settings.platformFeePercent,
    giftTypes,
  };
}

export async function listMyPayments(
  user: AuthUser,
  page: number,
  limit: number
) {
  const where = { userId: user.id };

  const [payments, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        providerRef: true,
        purpose: true,
        amountCents: true,
        currency: true,
        usdCents: true,
        status: true,
        createdAt: true,
        completedAt: true,
      },
    }),
    prisma.payment.count({ where }),
  ]);

  return { payments, page, limit, total };
}

// Location: backend/services/checkout.service.ts
// End of file: checkout.service.ts