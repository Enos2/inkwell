// Location: backend/validators/ad.validator.ts
// Purpose: Checks everything sent to the ad addresses: creating and editing an
// ad (title, image, text, link, spot, dates, country and tag targets), the
// AdSense settings, the options when the website asks for ads to show, and the
// filters of the admin ad list. Links must start with https://. Never trust what
// users send.

import { z } from "zod";

export const AD_PLACEMENTS = [
  "TOP_BANNER",
  "SIDEBAR",
  "BETWEEN_CHAPTERS",
  "UNDER_POST",
] as const;

const httpsUrl = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine(
    (value) => value.startsWith("https://"),
    "Link must start with https://"
  );

const countryList = z
  .array(
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Use 2-letter country codes, for example KE")
  )
  .max(60);

const tagList = z.array(z.string().trim().toLowerCase().min(2).max(30)).max(20);

export const createAdSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    imageUrl: httpsUrl.optional(),
    bodyText: z.string().trim().max(300).optional(),
    linkUrl: httpsUrl,
    placement: z.enum(AD_PLACEMENTS),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    isActive: z.boolean().default(true),
    targetCountries: countryList.default([]),
    targetTags: tagList.default([]),
  })
  .refine((value) => value.imageUrl || value.bodyText, {
    message: "An ad needs an image link or some text",
    path: ["imageUrl"],
  })
  .refine((value) => value.endsAt.getTime() > value.startsAt.getTime(), {
    message: "The end date must be after the start date",
    path: ["endsAt"],
  });

// No defaults here on purpose: only the fields that are sent get changed.
export const updateAdSchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    imageUrl: httpsUrl.nullable().optional(),
    bodyText: z.string().trim().max(300).nullable().optional(),
    linkUrl: httpsUrl.optional(),
    placement: z.enum(AD_PLACEMENTS).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    isActive: z.boolean().optional(),
    targetCountries: countryList.optional(),
    targetTags: tagList.optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Send at least one field to change"
  );

export const adIdParamSchema = z.object({
  adId: z.string().min(1).max(40),
});

// What the website sends when it asks "which ad should I show here?".
export const serveAdsQuerySchema = z.object({
  placement: z.enum(AD_PLACEMENTS),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a 2-letter country code, for example KE")
    .optional(),
  tags: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 10)
        : []
    ),
  limit: z.coerce.number().int().min(1).max(5).default(1),
});

export const adminListAdsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z
    .enum(["all", "live", "scheduled", "expired", "paused"])
    .default("all"),
  placement: z.enum(AD_PLACEMENTS).optional(),
});

export const adsenseSettingsSchema = z.object({
  enabled: z.boolean(),
  clientId: z
    .string()
    .trim()
    .regex(
      /^ca-pub-\d{10,20}$/,
      "The AdSense publisher id looks like ca-pub-1234567890123456"
    )
    .optional(),
});

export type CreateAdInput = z.infer<typeof createAdSchema>;
export type UpdateAdInput = z.infer<typeof updateAdSchema>;
export type ServeAdsQuery = z.infer<typeof serveAdsQuerySchema>;
export type AdminListAdsQuery = z.infer<typeof adminListAdsQuerySchema>;
export type AdsenseSettingsInput = z.infer<typeof adsenseSettingsSchema>;

// Location: backend/validators/ad.validator.ts
// End of file: ad.validator.ts