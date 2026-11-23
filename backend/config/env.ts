// Location: backend/config/env.ts
// Purpose: Reads the settings from the .env file in one place and checks that
// the important ones are filled in. If one is missing, the server refuses to
// start and tells you which one.

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

const jwtSecret = required("JWT_SECRET");
if (jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long.");
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 4000),
  FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:3000",
  DATABASE_URL: required("DATABASE_URL"),
  JWT_SECRET: jwtSecret,
  SUPER_ADMIN_EMAIL: required("SUPER_ADMIN_EMAIL").toLowerCase(),
};

// Location: backend/config/env.ts
// End of file: env.ts