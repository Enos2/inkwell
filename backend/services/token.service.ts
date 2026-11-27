// Project: Inkwell
// Location: backend/services/token.service.ts
// Purpose: Creates and checks login tokens. A token is a signed piece of text
// that proves who a person is. It holds the user's id and a "token version"
// number, never their rank, so when an admin is demoted it takes effect
// immediately. When someone changes their password or chooses "log out
// everywhere", their token version goes up and every older token stops working.

import jwt from "jsonwebtoken";
import { env } from "../config/env";

export function signToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ tv: tokenVersion }, env.JWT_SECRET, {
    subject: userId,
    expiresIn: "30d",
  });
}

export type VerifiedToken = { userId: string; tokenVersion: number };

// Returns who the token belongs to, or null if the token is not valid. Tokens
// made before token versions existed count as version 0.
export function verifyToken(token: string): VerifiedToken | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    if (typeof payload === "string" || !payload.sub) return null;
    const version = typeof payload.tv === "number" ? payload.tv : 0;
    return { userId: payload.sub, tokenVersion: version };
  } catch {
    return null;
  }
}

// Location: backend/services/token.service.ts
// End of file: token.service.ts