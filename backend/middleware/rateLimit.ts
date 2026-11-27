// Project: Inkwell
// Location: backend/middleware/rateLimit.ts
// Purpose: Protects the Inkwell backend from people (or programs) that send far
// too many requests. There are four limits, each counted per internet address
// (IP): a general limit for the whole API, a strict limit on login attempts
// (only failed attempts count), a limit on creating accounts, and a limit on
// password reset requests. When a limit is passed, the person gets a 429 "too
// many requests" reply. The numbers are starting values and are easy to change
// here. Note: on mobile networks many people can share one IP address, so do
// not make these numbers too small.

import { rateLimit } from "express-rate-limit";

const MINUTE = 60 * 1000;

type LimiterOptions = {
  windowMs: number;
  limit: number;
  message: string;
  countOnlyFailures?: boolean;
};

function createLimiter(options: LimiterOptions) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: options.countOnlyFailures ?? false,
    message: { error: options.message },
  });
}

// For the whole API.
export const apiLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 1000,
  message: "Too many requests. Please slow down and try again in a few minutes",
});

// For POST /api/auth/login. Only failed logins count.
export const loginLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: 20,
  countOnlyFailures: true,
  message: "Too many failed login attempts. Please try again in 15 minutes",
});

// For POST /api/auth/register.
export const registerLimiter = createLimiter({
  windowMs: 60 * MINUTE,
  limit: 10,
  message:
    "Too many accounts were created from this connection. Please try again later",
});

// For asking for a password reset link and for using one.
export const passwordResetLimiter = createLimiter({
  windowMs: 60 * MINUTE,
  limit: 10,
  message: "Too many password reset attempts. Please try again later",
});

// Location: backend/middleware/rateLimit.ts
// End of file: rateLimit.ts