// Location: backend/validators/admin.validator.ts
// Purpose: Checks the information sent to the admin-management addresses:
// which username to promote, which rank to give, which ability to switch, and
// the page numbers for the activity log.

import { z } from "zod";
import { ASSIGNABLE_RANKS, PERMISSION_LIST } from "../config/permissions";

export const promoteSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(20),
  rank: z.enum(ASSIGNABLE_RANKS),
});

export const changeRankSchema = z.object({
  rank: z.enum(ASSIGNABLE_RANKS),
});

export const userIdParamSchema = z.object({
  userId: z.string().min(1).max(40),
});

export const permissionParamSchema = z.object({
  userId: z.string().min(1).max(40),
  permission: z.enum(PERMISSION_LIST),
});

export const overrideBodySchema = z.object({
  allowed: z.boolean(),
});

export const logQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

// Location: backend/validators/admin.validator.ts
// End of file: admin.validator.ts