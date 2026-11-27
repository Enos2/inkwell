// Project: Inkwell
// Location: backend/routes/account.routes.ts
// Purpose: The account-safety addresses under /api/account. Anyone can ask for a
// password reset link, use it, and verify an email with a code. A logged-in
// person can ask for a new verification email, change their password, log out of
// every other device, and delete their account. Changing the password or using
// "log out everywhere" returns a fresh token so the current device stays logged
// in.

import { Router } from "express";
import { authenticate, getAuthUser } from "../middleware/auth";
import {
  changePassword,
  deleteAccount,
  logoutEverywhere,
  requestEmailVerification,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from "../services/account.service";
import {
  clearAuthCookie,
  setAuthCookie,
} from "../services/session.service";
import {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../validators/account.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const accountRouter = Router();

accountRouter.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    res.json(await requestPasswordReset(email));
  })
);

accountRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const { token, password } = resetPasswordSchema.parse(req.body);
    res.json(await resetPassword(token, password));
  })
);

accountRouter.post(
  "/verify-email",
  asyncHandler(async (req, res) => {
    const { token } = verifyEmailSchema.parse(req.body);
    res.json(await verifyEmail(token));
  })
);

accountRouter.post(
  "/resend-verification",
  authenticate,
  asyncHandler(async (_req, res) => {
    res.json(await requestEmailVerification(getAuthUser(res)));
  })
);

accountRouter.post(
  "/change-password",
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(
      req.body
    );
    const result = await changePassword(
      getAuthUser(res),
      currentPassword,
      newPassword
    );
    setAuthCookie(res, result.token);
    res.json(result);
  })
);

accountRouter.post(
  "/logout-everywhere",
  authenticate,
  asyncHandler(async (_req, res) => {
    const result = await logoutEverywhere(getAuthUser(res));
    setAuthCookie(res, result.token);
    res.json(result);
  })
);

accountRouter.post(
  "/delete",
  authenticate,
  asyncHandler(async (req, res) => {
    const { password } = deleteAccountSchema.parse(req.body);
    const result = await deleteAccount(getAuthUser(res), password);
    clearAuthCookie(res);
    res.json(result);
  })
);

// Location: backend/routes/account.routes.ts
// End of file: account.routes.ts