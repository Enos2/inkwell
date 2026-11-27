// Project: Inkwell
// Location: backend/validators/account.validator.ts
// Purpose: Checks everything sent to the account-safety addresses: asking for a
// password reset, setting a new password with a reset code, verifying an email,
// changing a password, and deleting an account. Never trust what users send.

import { z } from "zod";

const emailField = z.string().trim().toLowerCase().email().max(254);

const newPasswordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(100);

const tokenField = z.string().trim().min(20).max(200);

export const forgotPasswordSchema = z.object({ email: emailField });

export const resetPasswordSchema = z.object({
  token: tokenField,
  password: newPasswordField,
});

export const verifyEmailSchema = z.object({ token: tokenField });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(100),
  newPassword: newPasswordField,
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(100),
});

// Location: backend/validators/account.validator.ts
// End of file: account.validator.ts