// Location: backend/services/session.service.ts
// Purpose: Works out WHO is making a request. It accepts a token from the
// "Authorization: Bearer ..." header (used by a future mobile app) or from the
// browser cookie (used by the website). It also sets and clears the cookie and
// checks whether an account is banned or suspended.

import type { Request, Response } from "express";
import type { CookieOptions } from "express";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { selfUserSelect } from "../utils/selects";
import { verifyToken } from "./token.service";

export const AUTH_COOKIE_NAME = "inkwell_token";
const THIRTY_DAYS_IN_MS = 30 * 24 * 60 * 60 * 1000;

const isProduction = env.NODE_ENV === "production";

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
};

// True when the account may not use the site right now.
export function isAccountBlocked(user: {
  status: string;
  bannedUntil: Date | null;
}): boolean {
  if (user.status === "BANNED") return true;
  if (user.status === "SUSPENDED") {
    if (!user.bannedUntil) return true;
    return user.bannedUntil.getTime() > Date.now();
  }
  return false;
}

export function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  return typeof cookieToken === "string" ? cookieToken : null;
}

// Returns the logged-in user, or null if nobody valid is logged in.
export async function getCurrentUser(req: Request) {
  const token = readToken(req);
  if (!token) return null;

  const userId = verifyToken(token);
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: selfUserSelect,
  });
  if (!user) return null;
  if (isAccountBlocked(user)) return null;

  return user;
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    ...cookieOptions,
    maxAge: THIRTY_DAYS_IN_MS,
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, cookieOptions);
}

// Location: backend/services/session.service.ts
// End of file: session.service.ts