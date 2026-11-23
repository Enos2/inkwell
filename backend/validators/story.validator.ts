// Location: backend/validators/story.validator.ts
// Purpose: Checks everything sent to the story addresses: new story details,
// edits, the address pieces (slug, ids, chapter number) and the search and
// page options for story lists. Never trust what users send.

import { z } from "zod";

const tagList = z.array(z.string().trim().min(2).max(30)).max(10);

const httpsUrl = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine((value) => value.startsWith("https://"), "Link must start with https://");

export const createStorySchema = z.object({
  title: z.string().trim().min(1).max(120),
  synopsis: z.string().trim().max(2000).optional(),
  coverUrl: httpsUrl.optional(),
  language: z.string().trim().toLowerCase().min(2).max(10).default("en"),
  isMature: z.boolean().default(false),
  kind: z.enum(["STORY", "ARTICLE"]).default("STORY"),
  tags: tagList.default([]),
});

// No defaults here on purpose: only the fields that are sent get changed.
export const updateStorySchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    synopsis: z.string().trim().max(2000).nullable().optional(),
    coverUrl: httpsUrl.nullable().optional(),
    language: z.string().trim().toLowerCase().min(2).max(10).optional(),
    isMature: z.boolean().optional(),
    kind: z.enum(["STORY", "ARTICLE"]).optional(),
    tags: tagList.optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Send at least one field to change"
  );

export const storyIdParamSchema = z.object({
  storyId: z.string().min(1).max(40),
});

export const slugParamSchema = z.object({
  slug: z.string().min(1).max(80),
});

export const chapterReadParamsSchema = z.object({
  slug: z.string().min(1).max(80),
  number: z.coerce.number().int().min(1),
});

export const listStoriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  tag: z.string().trim().toLowerCase().max(40).optional(),
  language: z.string().trim().toLowerCase().max(10).optional(),
  author: z.string().trim().toLowerCase().max(20).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["new", "popular"]).default("new"),
  mature: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export type CreateStoryInput = z.infer<typeof createStorySchema>;
export type UpdateStoryInput = z.infer<typeof updateStorySchema>;
export type ListStoriesQuery = z.infer<typeof listStoriesQuerySchema>;

// Location: backend/validators/story.validator.ts
// End of file: story.validator.ts