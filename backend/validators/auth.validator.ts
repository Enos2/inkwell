// Location: backend/validators/auth.validator.ts
// Purpose: Checks that registration and login information is valid BEFORE the
// backend uses it (email looks like an email, password is long enough, and so
// on). Never trust what users send.

import { z } from "zod";

const emailField = z.string().trim().toLowerCase().email().max(254);

export const registerSchema = z.object({
  email: emailField,
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(
      /^[a-z0-9_]+$/,
      "Username can only use letters, numbers and underscores"
    ),
  displayName: z.string().trim().min(1).max(50),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100),
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(100),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

// Location: backend/validators/auth.validator.ts
// End of file: auth.validator.ts