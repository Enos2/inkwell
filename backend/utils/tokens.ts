// Project: Inkwell
// Location: backend/utils/tokens.ts
// Purpose: Makes the one-time secret codes used in password reset and email
// verification links. The raw code is only ever sent to the person by email;
// the database keeps just a hash (a one-way scramble) of it, so a leaked
// database cannot be used to reset anyone's password.

import { createHash, randomBytes } from "crypto";

// 64 random letters and numbers.
export function createRawToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Location: backend/utils/tokens.ts
// End of file: tokens.ts