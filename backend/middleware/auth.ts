// Location: backend/middleware/auth.ts
// Purpose: Gatekeepers that run before a route. "authenticate" checks that
// someone is logged in. "requireAdmin" checks they are an admin.
// "requireSuperAdmin" checks they are the Super Admin. "requirePermission"
// checks one specific ability, including the personal switches.

import type { RequestHandler, Response } from "express";
import type { Permission } from "../config/permissions";
import { getCurrentUser } from "../services/session.service";
import { userHasPermission } from "../services/permission.service";
import { AppError } from "../utils/errors";
import { asyncHandler } from "../utils/asyncHandler";
import type { AuthUser } from "../utils/selects";

export const authenticate: RequestHandler = asyncHandler(
  async (req, res, next) => {
    const user = await getCurrentUser(req);
    if (!user) {
      throw new AppError("You must be logged in to do this", 401);
    }
    res.locals.user = user;
    next();
  }
);

// Gets the logged-in user that "authenticate" saved for this request.
export function getAuthUser(res: Response): AuthUser {
  return res.locals.user as AuthUser;
}

export const requireAdmin: RequestHandler = (_req, res, next) => {
  if (!getAuthUser(res).adminRank) {
    next(new AppError("Only admins can do this", 403));
    return;
  }
  next();
};

export const requireSuperAdmin: RequestHandler = (_req, res, next) => {
  if (getAuthUser(res).adminRank !== "SUPER_ADMIN") {
    next(new AppError("Only the Super Admin can do this", 403));
    return;
  }
  next();
};

export function requirePermission(permission: Permission): RequestHandler {
  return asyncHandler(async (_req, res, next) => {
    const user = getAuthUser(res);
    const allowed = await userHasPermission(user.id, user.adminRank, permission);
    if (!allowed) {
      throw new AppError("You do not have permission to do this", 403);
    }
    next();
  });
}

// Location: backend/middleware/auth.ts
// End of file: auth.ts