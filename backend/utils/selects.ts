// Project: Inkwell
// Location: backend/utils/selects.ts
// Purpose: Lists which user fields are safe to send back to the person
// themselves. The password hash is deliberately NOT in this list, so it can
// never leak by accident. AuthUser is the type of the logged-in user.

import type { Prisma } from "@prisma/client";

export const selfUserSelect = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  bio: true,
  avatarUrl: true,
  country: true,
  writerStatus: true,
  adminRank: true,
  status: true,
  bannedUntil: true,
  premiumUntil: true,
  emailVerifiedAt: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

export type AuthUser = Prisma.UserGetPayload<{ select: typeof selfUserSelect }>;

// Location: backend/utils/selects.ts
// End of file: selects.ts