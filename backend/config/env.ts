// Location: backend/config/env.ts
// Purpose: Reads the settings from the .env file in one place, so the rest of
// the backend can import them from here instead of reading them directly.

import dotenv from "dotenv";

dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 4000),
  FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:3000",
};

// Location: backend/config/env.ts
// End of file: env.ts