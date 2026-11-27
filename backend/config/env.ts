// Project: Inkwell
// Location: backend/config/env.ts
// Purpose: Reads the settings from the .env file in one place and checks that
// the important ones are filled in. If one is missing, the server refuses to
// start and tells you which one. Payment and email settings are optional:
// without a Paystack key, payments say "not set up yet", and without a Resend
// key, emails are only printed in the terminal while you develop.
// PAYMENTS_SANDBOX lets you test payments locally with no payment account, and
// it is ALWAYS switched off when NODE_ENV is "production".

import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "" || value.startsWith("PASTE_")) {
    throw new Error(
      `The setting ${name} is missing. Open backend/.env and fill it in.`
    );
  }
  return value.trim();
}

function optional(name: string): string | null {
  const value = process.env[name];
  if (!value || value.trim() === "" || value.startsWith("PASTE_")) {
    return null;
  }
  return value.trim();
}

const jwtSecret = required("JWT_SECRET");
if (jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long.");
}

const nodeEnv = process.env.NODE_ENV ?? "development";

export const env = {
  NODE_ENV: nodeEnv,
  PORT: Number(process.env.PORT ?? 4000),
  FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:3000",
  DATABASE_URL: required("DATABASE_URL"),
  JWT_SECRET: jwtSecret,
  SUPER_ADMIN_EMAIL: required("SUPER_ADMIN_EMAIL").toLowerCase(),
  PAYSTACK_SECRET_KEY: optional("PAYSTACK_SECRET_KEY"),
  PAYMENTS_SANDBOX:
    optional("PAYMENTS_SANDBOX") === "true" && nodeEnv !== "production",
  RESEND_API_KEY: optional("RESEND_API_KEY"),
  MAIL_FROM: optional("MAIL_FROM") ?? "Inkwell <onboarding@resend.dev>",
};

// Location: backend/config/env.ts
// End of file: env.ts