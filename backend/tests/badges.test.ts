// Project: Inkwell
// Location: backend/tests/badges.test.ts
// Purpose: Tests for the badge rules in utils/badges.ts.

import { describe, expect, it } from "vitest";
import { BADGES, earnedBadgeCodes, findBadge, type BadgeStats } from "../utils/badges";

const empty: BadgeStats = {
  readingDays: 0,
  longestStreak: 0,
  commentCount: 0,
  publishedStories: 0,
  followerCount: 0,
  maxStoryViews: 0,
  supportsSent: 0,
  accountAgeDays: 0,
};

describe("badges", () => {
  it("awards nothing to a brand new account", () => {
    expect(earnedBadgeCodes(empty)).toEqual([]);
  });

  it("awards streak badges in steps", () => {
    const codes = earnedBadgeCodes({ ...empty, readingDays: 7, longestStreak: 7 });
    expect(codes).toContain("FIRST_READ");
    expect(codes).toContain("STREAK_3");
    expect(codes).toContain("STREAK_7");
    expect(codes).not.toContain("STREAK_30");
  });

  it("awards writer badges", () => {
    const codes = earnedBadgeCodes({ ...empty, publishedStories: 5, followerCount: 100, maxStoryViews: 1000 });
    expect(codes).toEqual(
      expect.arrayContaining(["FIRST_STORY", "AUTHOR_5", "FOLLOWERS_10", "FOLLOWERS_100", "POPULAR_1K"])
    );
    expect(codes).not.toContain("FOLLOWERS_1000");
  });

  it("awards supporter and veteran badges", () => {
    const codes = earnedBadgeCodes({ ...empty, supportsSent: 1, accountAgeDays: 400 });
    expect(codes).toEqual(expect.arrayContaining(["SUPPORTER", "VETERAN"]));
  });

  it("has unique codes and can find a badge by code", () => {
    const codes = BADGES.map((badge) => badge.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(findBadge("STREAK_7")?.name).toBe("Week Warrior");
    expect(findBadge("NOPE")).toBeUndefined();
  });
});

// Location: backend/tests/badges.test.ts
// End of file: badges.test.ts