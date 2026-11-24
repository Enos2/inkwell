// Location: backend/validators/moderation.validator.ts
// Purpose: Checks everything sent to the moderation addresses: a user's report
// (what is reported, the category, optional details), the admin report list
// filters, how an admin resolves a report, the reasons needed to hide a story
// or suspend or ban a user, the user search, and the featured stories list.
// Never trust what users send.

import { z } from "zod";

export const REPORT_CATEGORIES = [
  "SPAM",
  "HARASSMENT",
  "HATE",
  "SEXUAL_CONTENT",
  "VIOLENCE",
  "COPYRIGHT",
  "SCAM",
  "OTHER",
] as const;

export const REPORT_TARGET_TYPES = [
  "STORY",
  "CHAPTER",
  "COMMENT",
  "USER",
] as const;

const idField = z.string().min(1).max(40);

export const createReportSchema = z
  .object({
    targetType: z.enum(REPORT_TARGET_TYPES),
    targetId: idField,
    category: z.enum(REPORT_CATEGORIES),
    details: z.string().trim().max(1000).optional(),
  })
  .refine(
    (value) =>
      value.category !== "OTHER" || (value.details ?? "").length >= 10,
    {
      message: "Please describe the problem (at least 10 characters)",
      path: ["details"],
    }
  );

export const adminListReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["OPEN", "RESOLVED", "DISMISSED", "all"]).default("OPEN"),
  targetType: z.enum(REPORT_TARGET_TYPES).optional(),
});

export const reportIdParamSchema = z.object({ reportId: idField });

export const resolveReportSchema = z.object({
  decision: z.enum(["RESOLVED", "DISMISSED"]),
  note: z.string().trim().max(500).optional(),
  closeSimilar: z.boolean().default(false),
});

export const reasonSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});

export const suspendUserSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  days: z.number().int().min(1).max(365),
});

export const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().toLowerCase().max(30).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]).optional(),
});

export const featuredQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
  mature: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type AdminListReportsQuery = z.infer<typeof adminListReportsQuerySchema>;
export type ResolveReportInput = z.infer<typeof resolveReportSchema>;
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type FeaturedQuery = z.infer<typeof featuredQuerySchema>;

// Location: backend/validators/moderation.validator.ts
// End of file: moderation.validator.ts