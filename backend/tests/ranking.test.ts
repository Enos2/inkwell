// Project: Inkwell
// Location: backend/tests/ranking.test.ts
// Purpose: Tests for the search and trending scoring rules in utils/ranking.ts.

import { describe, expect, it } from "vitest";
import {
  sanitizeSearchText,
  scoreSearchHit,
  searchTerms,
  tagOverlap,
  topTags,
  trendingScore,
} from "../utils/ranking";

describe("search text", () => {
  it("removes characters that act as wildcards", () => {
    expect(sanitizeSearchText("50%_off\\now")).toBe("50 off now");
  });

  it("splits into lowercase words and drops tiny ones", () => {
    expect(searchTerms("  Lion   KING ")).toEqual(["lion", "king"]);
    expect(searchTerms("a lion")).toEqual(["lion"]);
  });

  it("keeps at most 4 different words", () => {
    expect(searchTerms("one two three four five two")).toEqual(["one", "two", "three", "four"]);
  });

  it("returns nothing for an empty search", () => {
    expect(searchTerms("   ")).toEqual([]);
    expect(searchTerms("%%")).toEqual([]);
  });
});

describe("scoreSearchHit", () => {
  const base = { synopsis: null, tagNames: [] as string[], viewCount: 0 };

  it("ranks exact title above starts-with above contains", () => {
    const exact = scoreSearchHit({ ...base, title: "Lion" }, ["lion"]);
    const starts = scoreSearchHit({ ...base, title: "Lion King" }, ["lion"]);
    const contains = scoreSearchHit({ ...base, title: "The Lion" }, ["lion"]);
    expect(exact).toBeGreaterThan(starts);
    expect(starts).toBeGreaterThan(contains);
  });

  it("adds points for a tag match and a synopsis match", () => {
    const plain = scoreSearchHit({ ...base, title: "Zebra" }, ["lion"]);
    const tagged = scoreSearchHit({ ...base, title: "Zebra", tagNames: ["Lion"] }, ["lion"]);
    const described = scoreSearchHit({ ...base, title: "Zebra", synopsis: "A lion appears" }, ["lion"]);
    expect(tagged).toBeGreaterThan(plain);
    expect(described).toBeGreaterThan(plain);
  });

  it("uses popularity only to break ties", () => {
    const quiet = scoreSearchHit({ ...base, title: "Lion", viewCount: 0 }, ["lion"]);
    const popular = scoreSearchHit({ ...base, title: "Lion", viewCount: 100000 }, ["lion"]);
    expect(popular).toBeGreaterThan(quiet);
    const betterTitle = scoreSearchHit({ ...base, title: "Lion", viewCount: 0 }, ["lion"]);
    const worseTitleVeryPopular = scoreSearchHit({ ...base, title: "The Lion", viewCount: 10_000_000 }, ["lion"]);
    expect(betterTitle).toBeGreaterThan(worseTitleVeryPopular);
  });
});

describe("trendingScore", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

  it("rewards likes and comments", () => {
    const quiet = trendingScore({ likes: 0, comments: 0, viewCount: 100, publishedAt: daysAgo(60) }, now);
    const busy = trendingScore({ likes: 10, comments: 5, viewCount: 100, publishedAt: daysAgo(60) }, now);
    expect(busy).toBeGreaterThan(quiet);
  });

  it("gives a small boost to fresh stories", () => {
    const fresh = trendingScore({ likes: 1, comments: 0, viewCount: 10, publishedAt: daysAgo(2) }, now);
    const month = trendingScore({ likes: 1, comments: 0, viewCount: 10, publishedAt: daysAgo(20) }, now);
    const old = trendingScore({ likes: 1, comments: 0, viewCount: 10, publishedAt: daysAgo(200) }, now);
    expect(fresh).toBeGreaterThan(month);
    expect(month).toBeGreaterThan(old);
  });

  it("handles a story with no publish date", () => {
    expect(trendingScore({ likes: 0, comments: 0, viewCount: 0, publishedAt: null }, now)).toBe(0);
  });
});

describe("tags", () => {
  it("finds the most common tags, ties alphabetical", () => {
    expect(topTags(["b", "a", "b", "c", "a", "d"], 3)).toEqual(["a", "b", "c"]);
  });

  it("counts overlapping tags", () => {
    expect(tagOverlap(["romance", "kenya", "drama"], ["kenya", "drama", "scifi"])).toBe(2);
    expect(tagOverlap([], ["kenya"])).toBe(0);
  });
});

// Location: backend/tests/ranking.test.ts
// End of file: ranking.test.ts