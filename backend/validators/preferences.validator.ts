// Project: Inkwell
// Location: backend/validators/preferences.validator.ts
// Purpose: Reader settings: how a person likes to read (colour theme, text size,
// font, line spacing, text alignment, page width, whether to show mature
// stories, and reading language). Settings are checked here, and
// resolveReaderPrefs fills in the defaults for anything not saved yet. Never
// trust what users send.

import { z } from "zod";

const fields = {
  theme: z.enum(["light", "dark", "sepia", "system"]),
  fontSize: z.number().int().min(12).max(32),
  fontFamily: z.enum(["serif", "sans", "mono", "dyslexia"]),
  lineHeight: z.number().min(1.2).max(2.4),
  textAlign: z.enum(["left", "justify"]),
  pageWidth: z.enum(["narrow", "medium", "wide"]),
  showMature: z.boolean(),
  language: z.string().trim().toLowerCase().min(2).max(10),
};

const readerPrefsSchema = z.object(fields);

export type ReaderPrefs = z.infer<typeof readerPrefsSchema>;

export const DEFAULT_READER_PREFS: ReaderPrefs = {
  theme: "system",
  fontSize: 18,
  fontFamily: "serif",
  lineHeight: 1.7,
  textAlign: "left",
  pageWidth: "medium",
  showMature: false,
  language: "en",
};

// Only the settings that are sent get changed.
export const updateReaderPrefsSchema = readerPrefsSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Send at least one setting to change"
  );

export type UpdateReaderPrefsInput = z.infer<typeof updateReaderPrefsSchema>;

// Whatever is saved (even damaged or old data) combined with the defaults.
export function resolveReaderPrefs(stored: unknown): ReaderPrefs {
  const parsed = readerPrefsSchema.partial().safeParse(stored);
  return { ...DEFAULT_READER_PREFS, ...(parsed.success ? parsed.data : {}) };
}

// Location: backend/validators/preferences.validator.ts
// End of file: preferences.validator.ts