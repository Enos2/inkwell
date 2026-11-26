// Project: Inkwell
// Location: backend/utils/ranking.ts
// Purpose: The small scoring rules behind search and discovery, kept free of
// the database so they are easy to test. It cleans a search text, splits it
// into search words, scores how well a story matches a search, scores how
// "hot" a story is right now (trending), and works out which tags a reader
// likes most.

export function sanitizeSearchText(raw: string): string {
  return raw.replace(/[%_\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

// Up to 4 different lowercase words of at least 2 letters.
export function searchTerms(raw: string, max = 4): string[] {
  const clean = sanitizeSearchText(raw).toLowerCase();
  if (!clean) return [];
  const unique = [...new Set(clean.split(" ").filter((word) => word.length >= 2))];
  return unique.slice(0, max);
}

export type SearchableStory = {
  title: string;
  synopsis: string | null;
  tagNames: string[];
  viewCount: number;
};

// A higher score means a better match. Title matches count most, then tags,
// then the synopsis. Popularity only breaks ties.
export function scoreSearchHit(story: SearchableStory, terms: string[]): number {
  const title = story.title.toLowerCase();
  const synopsis = (story.synopsis ?? "").toLowerCase();
  const tags = story.tagNames.map((tag) => tag.toLowerCase());

  let score = 0;
  for (const term of terms) {
    if (title === term) score += 10;
    else if (title.startsWith(term)) score += 6;
    else if (title.includes(term)) score += 4;

    if (tags.some((tag) => tag === term)) score += 3;
    else if (tags.some((tag) => tag.includes(term))) score += 1.5;

    if (synopsis.includes(term)) score += 1;
  }

  return score + Math.log10(1 + Math.max(0, story.viewCount)) * 0.5;
}

export type TrendingInput = {
  likes: number;
  comments: number;
  viewCount: number;
  publishedAt: Date | null;
};

// Recent likes and comments matter most. Total views and freshness help a
// little, so a brand new story with some activity can rise.
export function trendingScore(input: TrendingInput, now: Date = new Date()): number {
  const engagement = input.likes * 3 + input.comments * 2;
  const popularity = Math.log10(1 + Math.max(0, input.viewCount));

  let freshness = 0;
  if (input.publishedAt) {
    const ageDays = (now.getTime() - input.publishedAt.getTime()) / 86_400_000;
    if (ageDays <= 7) freshness = 2;
    else if (ageDays <= 30) freshness = 1;
  }

  return engagement + popularity + freshness;
}

// The most common tags in a list, most common first (ties go alphabetically).
export function topTags(slugs: string[], count = 5): string[] {
  const frequency = new Map<string, number>();
  for (const slug of slugs) {
    frequency.set(slug, (frequency.get(slug) ?? 0) + 1);
  }
  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([slug]) => slug);
}

// How many of a story's tags are in the wanted list.
export function tagOverlap(storyTags: string[], wanted: string[]): number {
  const wantedSet = new Set(wanted);
  return storyTags.filter((tag) => wantedSet.has(tag)).length;
}

// Location: backend/utils/ranking.ts
// End of file: ranking.ts