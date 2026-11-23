// Location: backend/config/prisma.ts
// Purpose: Creates ONE shared connection to the database that the whole backend
// uses. In development it is reused so the server does not open a new
// connection every time you save a file.

import "./env";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Location: backend/config/prisma.ts
// End of file: prisma.ts