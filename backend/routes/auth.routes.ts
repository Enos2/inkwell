// Location: backend/routes/auth.routes.ts
// Purpose: The account addresses: POST /api/auth/register, POST
// /api/auth/login, GET /api/auth/me and POST /api/auth/logout. The token is
// returned in the reply (for a mobile app) and also stored in a cookie (for the
// website).

import { Router } from "express";
import {
  loginSchema,
  registerSchema,
} from "../validators/auth.validator";
import { loginUser, registerUser } from "../services/auth.service";
import {
  clearAuthCookie,
  setAuthCookie,
} from "../services/session.service";
import { getEffectivePermissions } from "../services/permission.service";
import { authenticate, getAuthUser } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const authRouter = Router();

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const { user, token } = await registerUser(input);
    setAuthCookie(res, token);
    res.status(201).json({ user, token });
  })
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const { user, token } = await loginUser(input);
    setAuthCookie(res, token);
    res.json({ user, token });
  })
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (_req, res) => {
    const user = getAuthUser(res);
    const permissions = await getEffectivePermissions(user.id, user.adminRank);
    res.json({ user, permissions });
  })
);

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ message: "Logged out" });
});

// Location: backend/routes/auth.routes.ts
// End of file: auth.routes.ts