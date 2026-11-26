// Project: Inkwell
// Location: backend/services/storyCard.ts
// Purpose: One shared way to pick and shape the details of a story for lists
// and cards (search results, trending, recommended, series pages). It also holds
// the rule for "a story the public may see": published, and its writer is not
// banned or suspended. Mature stories are left out unless asked for.

import type { Prisma } from "@prisma/client";

export const storyCardSelect = {
  id: true,
  kind: true,
  title: true,
  slug: true,
  synopsis: true,
  coverUrl: true,
  language: true,
  isMature: true,
  viewCount: true,
  publishedAt: true,
  author: {
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  },
  tags: { select: { name: true, slug: true } },
  _count: {
    select: { likes: true, chapters: { where: { status: "PUBLISHED" } } },
  },
} satisfies Prisma.StorySelect;

type StoryCardRow = Prisma.StoryGetPayload<{ select: typeof storyCardSelect }>;

export function formatStoryCard(story: StoryCardRow) {
  const { _count, ...rest } = story;
  return { ...rest, likeCount: _count.likes, chapterCount: _count.chapters };
}

export type StoryCard = ReturnType<typeof formatStoryCard>;

export function liveStoryWhere(includeMature: boolean): Prisma.StoryWhereInput {
  return {
    status: "PUBLISHED",
    author: { status: "ACTIVE" },
    ...(includeMature ? {} : { isMature: false }),
  };
}

// Location: backend/services/storyCard.ts
// End of file: storyCard.ts