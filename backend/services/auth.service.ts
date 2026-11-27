// Project: Inkwell
// Location: backend/services/auth.service.ts
// Purpose: The real work of registering and logging in. Passwords are scrambled
// with bcrypt before saving. The person whose email matches SUPER_ADMIN_EMAIL
// becomes the Super Admin, but only if no Super Admin exists yet. A new account
// is sent a verification email. The login token carries the account's token
// version, so "log out everywhere" can cancel old logins.

import bcrypt from "bcryptjs";
import type { AdminRank } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { selfUserSelect } from "../utils/selects";
import { AppError } from "../utils/errors";
import type {
  LoginInput,
  RegisterInput,
} from "../validators/auth.validator";
import { startEmailVerification } from "./account.service";
import { isAccountBlocked } from "./session.service";
import { signToken } from "./token.service";

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: input.email }, { username: input.username }],
    },
    select: { email: true },
  });

  if (existing) {
    throw new AppError(
      existing.email === input.email
        ? "That email is already registered"
        : "That username is already taken",
      409
    );
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  let adminRank: AdminRank | null = null;
  if (input.email === env.SUPER_ADMIN_EMAIL) {
    const existingSuperAdmins = await prisma.user.count({
      where: { adminRank: "SUPER_ADMIN" },
    });
    if (existingSuperAdmins === 0) {
      adminRank = "SUPER_ADMIN";
    }
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      username: input.username,
      displayName: input.displayName,
      passwordHash,
      adminRank,
    },
    select: selfUserSelect,
  });

  // Registration must work even if the email cannot be sent, so a problem here
  // is only logged.
  startEmailVerification(user.id, user.email).catch((error: unknown) => {
    console.error("Could not start email verification", error);
  });

  // A brand new account always starts at token version 0.
  const token = signToken(user.id, 0);
  return { user, token };
}

export async function loginUser(input: LoginInput) {
  const account = await prisma.user.findUnique({
    where: { email: input.email },
  });

  // The same message for "no such email" and "wrong password", so attackers
  // cannot discover which emails are registered.
  if (!account) {
    throw new AppError("Incorrect email or password", 401);
  }

  const passwordMatches = await bcrypt.compare(
    input.password,
    account.passwordHash
  );
  if (!passwordMatches) {
    throw new AppError("Incorrect email or password", 401);
  }

  if (isAccountBlocked(account)) {
    throw new AppError("This account is banned or suspended", 403);
  }

  const user = await prisma.user.findUnique({
    where: { id: account.id },
    select: selfUserSelect,
  });
  if (!user) {
    throw new AppError("Incorrect email or password", 401);
  }

  const token = signToken(user.id, account.tokenVersion);
  return { user, token };
}

// Location: backend/services/auth.service.ts
// End of file: auth.service.ts