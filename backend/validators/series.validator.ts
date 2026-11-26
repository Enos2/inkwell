// Project: Inkwell
// Location: backend/validators/series.validator.ts
// Purpose: Checks everything sent to the series addresses: creating and editing
// a series (title, description, cover link), the ids and web address pieces in
// the address, and the position when a story is added to a series. Links must
// start with https://. Never trust what users send.

import { z } from "zod";

const httpsUrl = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine(
    (value) => value.startsWith("https://"),
    "Link must start with https://"
  );

export const createSeriesSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  coverUrl: httpsUrl.optional(),
});

// No defaults on purpose: only the fields that are sent get changed.
export const updateSeriesSchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    coverUrl: httpsUrl.nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Send at least one field to change"
  );

export const seriesIdParamSchema = z.object({
  seriesId: z.string().min(1).max(40),
});

export const seriesSlugParamSchema = z.object({
  slug: z.string().min(1).max(100),
});

export const seriesStoryParamsSchema = z.object({
  seriesId: z.string().min(1).max(40),
  storyId: z.string().min(1).max(40),
});

export const addStoryBodySchema = z.object({
  order: z.number().int().min(1).max(1000).optional(),
});

export type CreateSeriesInput = z.infer<typeof createSeriesSchema>;
export type UpdateSeriesInput = z.infer<typeof updateSeriesSchema>;

// Location: backend/validators/series.validator.ts
// End of file: series.validator.ts