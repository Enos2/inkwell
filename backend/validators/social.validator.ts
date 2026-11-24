// Location: backend/validators/social.validator.ts
// Purpose: Checks everything sent to the social addresses: comments (new,
// edited, listed), reading progress, notification lists, and the id, username
// and page options used in addresses. Never trust what users send.

import { z } from "zod";

const idField = z.string().min(1).max(40);

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const commentIdParamSchema = z.object({ commentId: idField });

export const notificationIdParamSchema = z.object({
  notificationId: idField,
});

export const usernameParamSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(20),
});

export const createCommentSchema = z.object({
  storyId: idField,
  chapterId: idField.optional(),
  parentId: idField.optional(),
  paragraphIndex: z.number().int().min(0).max(5000).optional(),
  body: z.string().trim().min(1).max(2000),
});

export const updateCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

// If chapterId is left out, only the story-level comments are listed.
export const listCommentsQuerySchema = z.object({
  storyId: idField,
  chapterId: idField.optional(),
  paragraphIndex: z.coerce.number().int().min(0).max(5000).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// position is how far down the chapter the reader is: 0 = top, 1 = the end.
export const saveProgressSchema = z.object({
  storyId: idField,
  chapterId: idField,
  position: z.number().min(0).max(1).default(0),
});

export const continueReadingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export const notificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unread: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;
export type SaveProgressInput = z.infer<typeof saveProgressSchema>;

// Location: backend/validators/social.validator.ts
// End of file: social.validator.ts