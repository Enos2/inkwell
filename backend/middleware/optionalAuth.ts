// Location: backend/middleware/optionalAuth.ts
// Purpose: A gatekeeper for pages that anyone can open, but that show more to
// people who are logged in (for example an author seeing their own draft
// story). If nobody is logged in the request simply continues without a user.

import type { RequestHandler, Response } from "express";
import { getCurrentUser } from "../services/session.service";
import { asyncHandler } from "../utils/asyncHandler";
import type { AuthUser } from "../utils/selects";

export const optionalAuthenticate: RequestHandler = asyncHandler(
  async (req, res, next) => {
    const user = await getCurrentUser(req);
    res.locals.user = user ?? undefined;
    next();
  }
);

// Gets the logged-in user for this request, or null if nobody is logged in.
export function getOptionalUser(res: Response): AuthUser | null {
  return (res.locals.user as AuthUser | undefined) ?? null;
}

// Location: backend/middleware/optionalAuth.ts
// End of file: optionalAuth.ts