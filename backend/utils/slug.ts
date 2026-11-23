// Location: backend/utils/slug.ts
// Purpose: Turns text into web-address-friendly pieces. A story title like
// "The Lion's Return!" becomes the slug "the-lion-s-return". Also cleans up the
// list of tags a writer sends, removing blanks and duplicates.

import { randomBytes } from "crypto";

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

// A short random piece added to a slug when the plain slug is already used.
export function randomSuffix(): string {
  return randomBytes(3).toString("hex");
}

export function normalizeTags(
  names: string[]
): { name: string; slug: string }[] {
  const result = new Map<string, { name: string; slug: string }>();
  for (const raw of names) {
    const name = raw.trim().toLowerCase();
    const slug = slugify(name);
    if (!slug || result.has(slug)) continue;
    result.set(slug, { name, slug });
  }
  return [...result.values()];
}

// Location: backend/utils/slug.ts
// End of file: slug.ts