// Project: Inkwell
// Location: backend/validators/challenge.validator.ts
// Purpose: Checks everything sent to the writing challenge addresses: creating
// and editing a challenge (title, prompt, start and end time), entering a story,
// picking a winner, and the filters of the challenge list. Never trust what
// users send.

import { z } from "zod";

const idField = z.string().min(1).max(40);

export const createChallengeSchema = z
  .object({
    title: z.string().trim().min(3).max(100),
    prompt: z.string().trim().min(10).max(5000),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine((value) => value.endsAt.getTime() > value.startsAt.getTime(), {
    message: "The end time must be after the start time",
    path: ["endsAt"],
  });

// No defaults on purpose: only the fields that are sent get changed. The date
// order is checked again in the service against the saved dates.
export const updateChallengeSchema = z
  .object({
    title: z.string().trim().min(3).max(100).optional(),
    prompt: z.string().trim().min(10).max(5000).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Send at least one field to change"
  );

export const listChallengesQuerySchema = z.object({
  status: z.enum(["all", "active", "upcoming", "past"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const challengeSlugParamSchema = z.object({
  slug: z.string().min(1).max(100),
});

export const challengeEntryParamsSchema = z.object({
  slug: z.string().min(1).max(100),
  storyId: idField,
});

export const challengeIdParamSchema = z.object({ challengeId: idField });

export const adminEntryParamsSchema = z.object({
  challengeId: idField,
  storyId: idField,
});

export const enterChallengeSchema = z.object({ storyId: idField });

export const setWinnerSchema = z.object({ isWinner: z.boolean() });

export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;
export type UpdateChallengeInput = z.infer<typeof updateChallengeSchema>;
export type ListChallengesQuery = z.infer<typeof listChallengesQuerySchema>;

// Location: backend/validators/challenge.validator.ts
// End of file: challenge.validator.ts