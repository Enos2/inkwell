// Project: Inkwell
// Location: backend/services/discovery.service.ts
// Purpose: Finding something good to read. Trending (recent likes and comments),
// latest updates (newest chapters), recommended for a logged-in reader (based on
// the tags of what they saved, liked or read) and "more like this" for one
// story. When there is not enough data, results are filled with popular
// stories. Stories of banned or suspended writers are never shown.

import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import { tagOverlap, topTags, trendingScore } from "../utils/ranking";
import type { AuthUser } from "../utils/selects";
import type { ListQuery, TrendingQuery } from "../validators/discovery.validator";
import { publishDueChapters } from "./storyAccess.service";
import {
  formatStoryCard,
  liveStoryWhere,
  storyCardSelect,
  type StoryCard,
} from "./storyCard";

const DAY_MS = 86_400_000;

// The shared engine behind trending: stories with the most recent likes and
// comments first, then filled up with popular stories if there are too few.
async function trendingCards(
  days: number,
  limit: number,
  mature: boolean,
  excludeIds: string[],
  excludeAuthorId: string | null
): Promise<StoryCard[]> {
  const since = new Date(Date.now() - days * DAY_MS);
  const notByAuthor = excludeAuthorId
    ? { authorId: { not: excludeAuthorId } }
    : {};

  const [likeGroups, commentGroups] = await Promise.all([
    prisma.like.groupBy({
      by: ["storyId"],
      where: { storyId: { not: null }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.comment.groupBy({
      by: ["storyId"],
      where: { status: "VISIBLE", createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const likes = new Map<string, number>();
  for (const group of likeGroups) {
    if (group.storyId) likes.set(group.storyId, group._count._all);
  }
  const comments = new Map<string, number>();
  for (const group of commentGroups) {
    comments.set(group.storyId, group._count._all);
  }

  const activity = (id: string) =>
    (likes.get(id) ?? 0) * 3 + (comments.get(id) ?? 0) * 2;

  const activeIds = [...new Set([...likes.keys(), ...comments.keys()])]
    .filter((id) => !excludeIds.includes(id))
    .sort((a, b) => activity(b) - activity(a))
    .slice(0, 200);

  const active =
    activeIds.length === 0
      ? []
      : await prisma.story.findMany({
          where: {
            ...liveStoryWhere(mature),
            ...notByAuthor,
            id: { in: activeIds },
          },
          select: storyCardSelect,
        });

  const now = new Date();
  const ranked = active
    .map((story) => ({
      story,
      score: trendingScore(
        {
          likes: likes.get(story.id) ?? 0,
          comments: comments.get(story.id) ?? 0,
          viewCount: story.viewCount,
          publishedAt: story.publishedAt,
        },
        now
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => formatStoryCard(entry.story));

  if (ranked.length >= limit) return ranked;

  const usedIds = [...excludeIds, ...ranked.map((story) => story.id)];
  const filler = await prisma.story.findMany({
    where: {
      ...liveStoryWhere(mature),
      ...notByAuthor,
      id: { notIn: usedIds },
    },
    orderBy: [{ viewCount: "desc" }, { publishedAt: "desc" }],
    take: limit - ranked.length,
    select: storyCardSelect,
  });

  return [...ranked, ...filler.map((story) => formatStoryCard(story))];
}

export async function getTrending(query: TrendingQuery) {
  const stories = await trendingCards(
    query.days,
    query.limit,
    query.mature,
    [],
    null
  );
  return { stories, days: query.days };
}

// The newest chapters, one entry per story.
export async function getLatestUpdates(query: ListQuery) {
  await publishDueChapters();

  const chapters = await prisma.chapter.findMany({
    where: { status: "PUBLISHED", story: liveStoryWhere(query.mature) },
    orderBy: { publishedAt: "desc" },
    take: query.limit * 6,
    select: {
      number: true,
      title: true,
      publishedAt: true,
      story: { select: storyCardSelect },
    },
  });

  const seen = new Set<string>();
  const items: {
    story: StoryCard;
    latestChapter: { number: number; title: string; publishedAt: Date | null };
  }[] = [];

  for (const chapter of chapters) {
    if (seen.has(chapter.story.id)) continue;
    seen.add(chapter.story.id);
    items.push({
      story: formatStoryCard(chapter.story),
      latestChapter: {
        number: chapter.number,
        title: chapter.title,
        publishedAt: chapter.publishedAt,
      },
    });
    if (items.length >= query.limit) break;
  }

  return { items };
}

// For a logged-in reader: stories that share tags with what they saved, liked
// or read. For everyone else (or when there is nothing to go on): trending.
export async function getRecommended(viewer: AuthUser | null, query: ListQuery) {
  const fallback = async (excludeIds: string[], basedOnTags: string[]) => ({
    personalized: false,
    basedOnTags,
    stories: await trendingCards(
      14,
      query.limit,
      query.mature,
      excludeIds,
      viewer ? viewer.id : null
    ),
  });

  if (!viewer) return fallback([], []);

  const [library, liked, reading] = await Promise.all([
    prisma.libraryEntry.findMany({
      where: { userId: viewer.id },
      select: { storyId: true },
      take: 200,
    }),
    prisma.like.findMany({
      where: { userId: viewer.id, storyId: { not: null } },
      select: { storyId: true },
      take: 200,
    }),
    prisma.readingProgress.findMany({
      where: { userId: viewer.id },
      select: { storyId: true },
      take: 200,
    }),
  ]);

  const seedIds = [
    ...new Set([
      ...library.map((row) => row.storyId),
      ...liked.flatMap((row) => (row.storyId ? [row.storyId] : [])),
      ...reading.map((row) => row.storyId),
    ]),
  ];
  if (seedIds.length === 0) return fallback([], []);

  const seedStories = await prisma.story.findMany({
    where: { id: { in: seedIds } },
    select: { tags: { select: { slug: true } } },
  });
  const wanted = topTags(
    seedStories.flatMap((story) => story.tags.map((tag) => tag.slug)),
    5
  );
  if (wanted.length === 0) return fallback(seedIds, []);

  const candidates = await prisma.story.findMany({
    where: {
      ...liveStoryWhere(query.mature),
      id: { notIn: seedIds },
      authorId: { not: viewer.id },
      tags: { some: { slug: { in: wanted } } },
    },
    orderBy: { viewCount: "desc" },
    take: 80,
    select: storyCardSelect,
  });

  const ranked = candidates
    .map((story) => ({
      story,
      score:
        tagOverlap(
          story.tags.map((tag) => tag.slug),
          wanted
        ) *
          10 +
        Math.log10(1 + story.viewCount),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, query.limit)
    .map((entry) => formatStoryCard(entry.story));

  if (ranked.length >= query.limit) {
    return { personalized: true, basedOnTags: wanted, stories: ranked };
  }

  const extra = await trendingCards(
    14,
    query.limit - ranked.length,
    query.mature,
    [...seedIds, ...ranked.map((story) => story.id)],
    viewer.id
  );
  return {
    personalized: true,
    basedOnTags: wanted,
    stories: [...ranked, ...extra],
  };
}

// "More like this": other stories sharing tags with one story. Stories by the
// same writer get a small boost.
export async function getSimilar(slug: string, query: ListQuery) {
  const story = await prisma.story.findUnique({
    where: { slug },
    select: {
      id: true,
      status: true,
      authorId: true,
      author: { select: { status: true } },
      tags: { select: { slug: true } },
    },
  });
  if (!story || story.status !== "PUBLISHED" || story.author.status !== "ACTIVE") {
    throw new AppError("Story not found", 404);
  }

  const wanted = story.tags.map((tag) => tag.slug);
  if (wanted.length === 0) {
    return {
      stories: await trendingCards(14, query.limit, query.mature, [story.id], null),
    };
  }

  const candidates = await prisma.story.findMany({
    where: {
      ...liveStoryWhere(query.mature),
      id: { not: story.id },
      tags: { some: { slug: { in: wanted } } },
    },
    orderBy: { viewCount: "desc" },
    take: 60,
    select: storyCardSelect,
  });

  const stories = candidates
    .map((candidate) => ({
      candidate,
      score:
        tagOverlap(
          candidate.tags.map((tag) => tag.slug),
          wanted
        ) *
          10 +
        (candidate.author.id === story.authorId ? 3 : 0) +
        Math.log10(1 + candidate.viewCount),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, query.limit)
    .map((entry) => formatStoryCard(entry.candidate));

  return { stories };
}

// Location: backend/services/discovery.service.ts
// End of file: discovery.service.ts