// Project: Inkwell
// Location: backend/validators/discovery.validator.ts
// Purpose: Checks everything sent to the search and discovery addresses: the
// search text and what to search (stories, writers, tags), how many results,
// and the options for trending, latest updates, recommended and similar
// stories. Never trust what users send.

import { z } from "zod";

const matureField = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  type: z.enum(["all", "stories", "writers", "tags"]).default("all"),
  limit: z.coerce.number().int().min(1).max(30).default(10),
  mature: matureField,
});

export const trendingQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
  limit: z.coerce.number().int().min(1).max(30).default(12),
  mature: matureField,
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(12),
  mature: matureField,
});

export const similarParamSchema = z.object({
  slug: z.string().min(1).max(100),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type TrendingQuery = z.infer<typeof trendingQuerySchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;

// Location: backend/validators/discovery.validator.ts
// End of file: discovery.validator.ts