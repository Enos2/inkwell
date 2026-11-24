// Location: backend/validators/profile.validator.ts
// Purpose: Checks everything sent to the profile addresses: edits to your own
// profile (name, bio, avatar link, country) and your list of social links. A
// social link must start with https:// and must really belong to its platform
// (an "instagram" link has to be on instagram.com). Never trust what users send.

import { z } from "zod";

export const SOCIAL_PLATFORMS = [
  "instagram",
  "x",
  "youtube",
  "tiktok",
  "facebook",
  "threads",
  "github",
  "linkedin",
  "website",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

// null means "any website is fine".
const PLATFORM_HOSTS: Record<SocialPlatform, string[] | null> = {
  instagram: ["instagram.com"],
  x: ["x.com", "twitter.com"],
  youtube: ["youtube.com", "youtu.be"],
  tiktok: ["tiktok.com"],
  facebook: ["facebook.com", "fb.com"],
  threads: ["threads.net", "threads.com"],
  github: ["github.com"],
  linkedin: ["linkedin.com"],
  website: null,
};

function hostMatches(hostname: string, allowed: string[]): boolean {
  const host = hostname.toLowerCase();
  return allowed.some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );
}

const httpsUrl = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine(
    (value) => value.startsWith("https://"),
    "Link must start with https://"
  );

export const socialLinkSchema = z
  .object({
    platform: z.enum(SOCIAL_PLATFORMS),
    url: z.string().trim().max(300),
  })
  .superRefine((link, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(link.url);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "This is not a valid link",
        path: ["url"],
      });
      return;
    }

    if (parsed.protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        message: "Link must start with https://",
        path: ["url"],
      });
      return;
    }

    const allowed = PLATFORM_HOSTS[link.platform];
    if (allowed && !hostMatches(parsed.hostname, allowed)) {
      ctx.addIssue({
        code: "custom",
        message: `This link must be on ${allowed[0]}`,
        path: ["url"],
      });
    }
  });

export const setSocialLinksSchema = z
  .object({
    links: z.array(socialLinkSchema).max(SOCIAL_PLATFORMS.length),
  })
  .refine(
    (value) =>
      new Set(value.links.map((link) => link.platform)).size ===
      value.links.length,
    "Each platform can only be used once"
  );

// Only the fields that are sent get changed.
export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(50).optional(),
    bio: z.string().trim().max(500).nullable().optional(),
    avatarUrl: httpsUrl.nullable().optional(),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Use a 2-letter country code, for example KE")
      .nullable()
      .optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Send at least one field to change"
  );

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type SetSocialLinksInput = z.infer<typeof setSocialLinksSchema>;

// Location: backend/validators/profile.validator.ts
// End of file: profile.validator.ts