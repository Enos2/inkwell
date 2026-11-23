// Location: backend/services/token.service.ts
// Purpose: Creates and checks login tokens. A token is a signed piece of text
// that proves who a person is. It holds only the user's id, never their rank,
// so when an admin is demoted it takes effect immediately.

import jwt from "jsonwebtoken";
import { env } from "../config/env";

export function signToken(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    expiresIn: "30d",
  });
}

// Returns the user id if the token is valid, or null if it is not.
export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    if (typeof payload === "string") return null;
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

// Location: backend/services/token.service.ts
// End of file: token.service.ts