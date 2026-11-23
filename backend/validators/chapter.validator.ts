// Location: backend/validators/chapter.validator.ts
// Purpose: Checks everything sent when a writer creates or edits a chapter:
// title, text, optional YouTube or Vimeo link, members-only switch, and the
// status (draft, published or scheduled for a future time).

import { z } from "zod";
import { parseVideoUrl } from "../utils/video";

const videoUrlField = z
  .string()
  .trim()
  .max(300)
  .refine(
    (value) => parseVideoUrl(value) !== null,
    "Use a YouTube or Vimeo link that starts with https://"
  );

const statusField = z.enum(["DRAFT", "PUBLISHED", "SCHEDULED"]);

export const createChapterSchema = z.object({
  title: z.string().trim().min(1).max(150),
  content: z.string().min(1).max(100000),
  videoUrl: videoUrlField.optional(),
  isMembersOnly: z.boolean().default(false),
  status: statusField.default("DRAFT"),
  scheduledAt: z.coerce.date().nullable().optional(),
});

// No defaults here on purpose: only the fields that are sent get changed.
export const updateChapterSchema = z
  .object({
    title: z.string().trim().min(1).max(150).optional(),
    content: z.string().min(1).max(100000).optional(),
    videoUrl: videoUrlField.nullable().optional(),
    isMembersOnly: z.boolean().optional(),
    status: statusField.optional(),
    scheduledAt: z.coerce.date().nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Send at least one field to change"
  );

export const chapterIdParamSchema = z.object({
  chapterId: z.string().min(1).max(40),
});

export type CreateChapterInput = z.infer<typeof createChapterSchema>;
export type UpdateChapterInput = z.infer<typeof updateChapterSchema>;

// Location: backend/validators/chapter.validator.ts
// End of file: chapter.validator.ts