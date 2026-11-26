// Project: Inkwell
// Location: backend/utils/badges.ts
// Purpose: The list of badges people can earn on Inkwell and the rule for each
// one. A rule looks only at a person's numbers (BadgeStats), so it is easy to
// test and to change. To add a badge, add one line to BADGES.

export type BadgeStats = {
  readingDays: number;
  longestStreak: number;
  commentCount: number;
  publishedStories: number;
  followerCount: number;
  maxStoryViews: number;
  supportsSent: number;
  accountAgeDays: number;
};

export type BadgeDefinition = {
  code: string;
  name: string;
  description: string;
  emoji: string;
  earnedWhen: (stats: BadgeStats) => boolean;
};

export const BADGES: readonly BadgeDefinition[] = [
  { code: "FIRST_READ", name: "First Page", emoji: "📖", description: "Read your first story on Inkwell", earnedWhen: (s) => s.readingDays >= 1 },
  { code: "READER_10", name: "Regular Reader", emoji: "🔖", description: "Read on 10 different days", earnedWhen: (s) => s.readingDays >= 10 },
  { code: "STREAK_3", name: "On a Roll", emoji: "🔥", description: "Read 3 days in a row", earnedWhen: (s) => s.longestStreak >= 3 },
  { code: "STREAK_7", name: "Week Warrior", emoji: "⚡", description: "Read 7 days in a row", earnedWhen: (s) => s.longestStreak >= 7 },
  { code: "STREAK_30", name: "Monthly Marathon", emoji: "🏃", description: "Read 30 days in a row", earnedWhen: (s) => s.longestStreak >= 30 },
  { code: "COMMENTER_10", name: "Conversation Starter", emoji: "💬", description: "Write 10 comments", earnedWhen: (s) => s.commentCount >= 10 },
  { code: "FIRST_STORY", name: "Storyteller", emoji: "✍️", description: "Publish your first story", earnedWhen: (s) => s.publishedStories >= 1 },
  { code: "AUTHOR_5", name: "Prolific Author", emoji: "📚", description: "Publish 5 stories", earnedWhen: (s) => s.publishedStories >= 5 },
  { code: "FOLLOWERS_10", name: "Growing Audience", emoji: "🌱", description: "Get 10 followers", earnedWhen: (s) => s.followerCount >= 10 },
  { code: "FOLLOWERS_100", name: "Rising Star", emoji: "🌟", description: "Get 100 followers", earnedWhen: (s) => s.followerCount >= 100 },
  { code: "FOLLOWERS_1000", name: "Fan Favourite", emoji: "👑", description: "Get 1000 followers", earnedWhen: (s) => s.followerCount >= 1000 },
  { code: "POPULAR_1K", name: "Thousand Views", emoji: "🚀", description: "Have a story read 1000 times", earnedWhen: (s) => s.maxStoryViews >= 1000 },
  { code: "SUPPORTER", name: "Supporter", emoji: "🎁", description: "Send a tip or a gift to a writer", earnedWhen: (s) => s.supportsSent >= 1 },
  { code: "VETERAN", name: "One Year In", emoji: "🎂", description: "Be on Inkwell for a full year", earnedWhen: (s) => s.accountAgeDays >= 365 },
];

export function earnedBadgeCodes(stats: BadgeStats): string[] {
  return BADGES.filter((badge) => badge.earnedWhen(stats)).map((badge) => badge.code);
}

export function findBadge(code: string): BadgeDefinition | undefined {
  return BADGES.find((badge) => badge.code === code);
}

// Location: backend/utils/badges.ts
// End of file: badges.ts