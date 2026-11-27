// Project: Inkwell
// Location: backend/services/account.service.ts
// Purpose: Keeping an account safe. Password reset by email (a one-time link
// that works once and expires in 1 hour), email verification (link valid for 48
// hours), changing your password, "log out everywhere" (raises the token version
// so every older login stops working) and deleting your account. Deleting
// anonymizes the account instead of erasing rows, so payment records and other
// people's conversations stay consistent. Asking for a reset never reveals
// whether an email is registered.

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import type { EmailTokenType } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import type { AuthUser } from "../utils/selects";
import { createRawToken, hashToken } from "../utils/tokens";
import { sendEmail } from "./email.service";
import { isAccountBlocked } from "./session.service";
import { signToken } from "./token.service";

const RESET_TTL_MS = 60 * 60 * 1000;
const VERIFY_TTL_MS = 48 * 60 * 60 * 1000;
const THROTTLE_MS = 60 * 1000;
const BAD_LINK = "This link is invalid or has expired";

// Makes a fresh code. Older unused codes of the same kind stop working.
async function createEmailToken(
  userId: string,
  type: EmailTokenType,
  ttlMs: number
): Promise<string> {
  const raw = createRawToken();
  await prisma.$transaction([
    prisma.emailToken.deleteMany({ where: { userId, type, usedAt: null } }),
    prisma.emailToken.create({
      data: {
        userId,
        type,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    }),
  ]);
  return raw;
}

// True if a code of this kind was made in the last minute (stops people from
// using Inkwell to flood someone's inbox).
async function hasRecentToken(
  userId: string,
  type: EmailTokenType
): Promise<boolean> {
  const count = await prisma.emailToken.count({
    where: {
      userId,
      type,
      createdAt: { gt: new Date(Date.now() - THROTTLE_MS) },
    },
  });
  return count > 0;
}

// ---------------------------------------------------------------- RESET

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      displayName: true,
      status: true,
      bannedUntil: true,
    },
  });

  if (
    user &&
    !isAccountBlocked(user) &&
    !(await hasRecentToken(user.id, "RESET_PASSWORD"))
  ) {
    const token = await createEmailToken(user.id, "RESET_PASSWORD", RESET_TTL_MS);
    await sendEmail({
      to: user.email,
      subject: "Reset your Inkwell password",
      text:
        `Hello ${user.displayName},\n\n` +
        `Someone asked to reset the password of your Inkwell account. To choose a new password, open this link within 1 hour:\n\n` +
        `${env.FRONTEND_URL}/reset-password?token=${token}\n\n` +
        `If you did not ask for this, you can ignore this email. Your password will not change.\n\n` +
        `The Inkwell team`,
    });
  }

  // The same answer whether or not the email is registered.
  return { message: "If that email is registered, a reset link has been sent" };
}

export async function resetPassword(token: string, password: string) {
  const record = await prisma.emailToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, type: true, expiresAt: true, usedAt: true },
  });
  if (
    !record ||
    record.type !== "RESET_PASSWORD" ||
    record.usedAt !== null ||
    record.expiresAt.getTime() < Date.now()
  ) {
    throw new AppError(BAD_LINK, 400);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction(async (tx) => {
    // The "usedAt is empty" check makes sure a link works only once, even if it
    // is opened twice at the same moment.
    const claimed = await tx.emailToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) throw new AppError(BAD_LINK, 400);

    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    // Opening the link from their inbox also proves the email address is theirs.
    await tx.user.updateMany({
      where: { id: record.userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
    await tx.emailToken.deleteMany({
      where: { userId: record.userId, type: "RESET_PASSWORD", usedAt: null },
    });
  });

  return {
    message: "Your password was changed. Please log in with your new password",
  };
}

// ---------------------------------------------------------------- VERIFY

async function sendVerificationEmail(userId: string, email: string) {
  const token = await createEmailToken(userId, "VERIFY_EMAIL", VERIFY_TTL_MS);
  await sendEmail({
    to: email,
    subject: "Verify your Inkwell email address",
    text:
      `Welcome to Inkwell!\n\n` +
      `Please confirm your email address by opening this link within 48 hours:\n\n` +
      `${env.FRONTEND_URL}/verify-email?token=${token}\n\n` +
      `If you did not create an Inkwell account, you can ignore this email.\n\n` +
      `The Inkwell team`,
  });
}

// Used right after someone registers.
export async function startEmailVerification(userId: string, email: string) {
  await sendVerificationEmail(userId, email);
}

export async function requestEmailVerification(user: AuthUser) {
  if (user.emailVerifiedAt) {
    throw new AppError("Your email address is already verified", 409);
  }
  if (await hasRecentToken(user.id, "VERIFY_EMAIL")) {
    throw new AppError(
      "A verification email was just sent. Please wait a minute before asking again",
      429
    );
  }

  await sendVerificationEmail(user.id, user.email);
  return { message: "A verification link has been sent to your email" };
}

export async function verifyEmail(token: string) {
  const record = await prisma.emailToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, type: true, expiresAt: true, usedAt: true },
  });
  if (
    !record ||
    record.type !== "VERIFY_EMAIL" ||
    record.usedAt !== null ||
    record.expiresAt.getTime() < Date.now()
  ) {
    throw new AppError(BAD_LINK, 400);
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.emailToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) throw new AppError(BAD_LINK, 400);

    await tx.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    });
  });

  return { message: "Your email address is verified" };
}

// ---------------------------------------------------------------- PASSWORD

// Changing the password logs out every other device. The reply holds a fresh
// token so the device that made the change stays logged in.
export async function changePassword(
  user: AuthUser,
  currentPassword: string,
  newPassword: string
) {
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!account || !(await bcrypt.compare(currentPassword, account.passwordHash))) {
    throw new AppError("Your current password is not correct", 400);
  }
  if (currentPassword === newPassword) {
    throw new AppError("The new password must be different from the old one", 400);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 12),
      tokenVersion: { increment: 1 },
    },
    select: { id: true, tokenVersion: true },
  });

  return {
    token: signToken(updated.id, updated.tokenVersion),
    message: "Your password was changed. Your other devices were logged out",
  };
}

// Logs out every device except the one that asked.
export async function logoutEverywhere(user: AuthUser) {
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { tokenVersion: { increment: 1 } },
    select: { id: true, tokenVersion: true },
  });

  return {
    token: signToken(updated.id, updated.tokenVersion),
    message: "Every other device was logged out",
  };
}

// ---------------------------------------------------------------- DELETE

// Anonymizes the account: the name, email and profile are wiped, the login stops
// working, and the person's stories disappear from the site. Their comments stay
// but show as "Deleted user". Admins cannot delete themselves, and a writer must
// withdraw their wallet money first.
export async function deleteAccount(user: AuthUser, password: string) {
  if (user.adminRank === "SUPER_ADMIN") {
    throw new AppError("The Super Admin account cannot be deleted", 403);
  }
  if (user.adminRank) {
    throw new AppError(
      "An admin must be removed from the admin team first. Ask the Super Admin",
      403
    );
  }

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!account || !(await bcrypt.compare(password, account.passwordHash))) {
    throw new AppError("Your password is not correct", 400);
  }

  const [balance, pendingPayouts] = await Promise.all([
    prisma.ledgerEntry.aggregate({
      where: { userId: user.id },
      _sum: { amountCents: true },
    }),
    prisma.payoutRequest.count({
      where: { userId: user.id, status: "PENDING" },
    }),
  ]);
  if ((balance._sum.amountCents ?? 0) > 0 || pendingPayouts > 0) {
    throw new AppError(
      "You still have money in your wallet or a payout waiting. Withdraw it and wait for it to be paid before deleting your account",
      409
    );
  }

  const scrambledPassword = await bcrypt.hash(createRawToken(), 4);
  const id = user.id;

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        email: `deleted-${id}@deleted.invalid`,
        username: `deleted_${id}`,
        displayName: "Deleted user",
        bio: null,
        avatarUrl: null,
        country: null,
        passwordHash: scrambledPassword,
        writerStatus: "NONE",
        status: "BANNED",
        statusReason: "ACCOUNT_DELETED",
        bannedUntil: null,
        premiumUntil: null,
        emailVerifiedAt: null,
        readerPrefs: Prisma.DbNull,
        tokenVersion: { increment: 1 },
      },
    }),
    prisma.socialLink.deleteMany({ where: { userId: id } }),
    prisma.follow.deleteMany({
      where: { OR: [{ followerId: id }, { followingId: id }] },
    }),
    prisma.userBlock.deleteMany({
      where: { OR: [{ blockerId: id }, { blockedId: id }] },
    }),
    prisma.libraryEntry.deleteMany({ where: { userId: id } }),
    prisma.readingProgress.deleteMany({ where: { userId: id } }),
    prisma.readingDay.deleteMany({ where: { userId: id } }),
    prisma.userBadge.deleteMany({ where: { userId: id } }),
    prisma.notification.deleteMany({ where: { userId: id } }),
    prisma.emailToken.deleteMany({ where: { userId: id } }),
    prisma.membershipTier.updateMany({
      where: { writerId: id },
      data: { isActive: false },
    }),
    prisma.membership.updateMany({
      where: { subscriberId: id },
      data: { status: "CANCELLED" },
    }),
  ]);

  return { message: "Your account was deleted" };
}

// Location: backend/services/account.service.ts
// End of file: account.service.ts