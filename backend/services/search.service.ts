// Project: Inkwell
// Location: backend/services/search.service.ts
// Purpose: Search across Inkwell. Finds stories (by title, synopsis or tag),
// approved writers (by username or display name) and tags. Every word of the
// search must match somewhere. Stories are ranked by how well they match, with
// popularity only breaking ties. Stories of banned or suspended writers and
// mature stories (unless asked for) are never shown.

import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { scoreSearchHit, searchTerms } from "../utils/ranking";
import type { SearchQuery } from "../validators/discovery.validator";
import { formatStoryCard, liveStoryWhere, storyCardSelect } from "./storyCard";

const CANDIDATE_LIMIT = 60;
const insensitive = "insensitive" as const;

async function findStories(terms: string[], limit: number, mature: boolean) {
  const where: Prisma.StoryWhereInput = {
    ...liveStoryWhere(mature),
    AND: terms.map((term) => ({
      OR: [
        { title: { contains: term, mode: insensitive } },
        { synopsis: { contains: term, mode: insensitive } },
        { tags: { some: { name: { contains: term, mode: insensitive } } } },
      ],
    })),
  };

  const candidates = await prisma.story.findMany({
    where,
    orderBy: { viewCount: "desc" },
    take: CANDIDATE_LIMIT,
    select: storyCardSelect,
  });

  return candidates
    .map((story) => ({
      story,
      score: scoreSearchHit(
        {
          title: story.title,
          synopsis: story.synopsis,
          tagNames: story.tags.map((tag) => tag.name),
          viewCount: story.viewCount,
        },
        terms
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => formatStoryCard(entry.story));
}

async function findWriters(terms: string[], limit: number) {
  const writers = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      writerStatus: "APPROVED",
      AND: terms.map((term) => ({
        OR: [
          { username: { contains: term, mode: insensitive } },
          { displayName: { contains: term, mode: insensitive } },
        ],
      })),
    },
    orderBy: { followers: { _count: "desc" } },
    take: limit,
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      country: true,
      _count: { select: { followers: true } },
    },
  });

  return writers.map(({ _count, ...writer }) => ({
    ...writer,
    followerCount: _count.followers,
  }));
}

async function findTags(terms: string[], limit: number) {
  const tags = await prisma.tag.findMany({
    where: {
      AND: terms.map((term) => ({
        name: { contains: term, mode: insensitive },
      })),
      stories: { some: { status: "PUBLISHED" } },
    },
    orderBy: { stories: { _count: "desc" } },
    take: limit,
    select: {
      name: true,
      slug: true,
      _count: { select: { stories: { where: { status: "PUBLISHED" } } } },
    },
  });

  return tags.map((tag) => ({
    name: tag.name,
    slug: tag.slug,
    storyCount: tag._count.stories,
  }));
}

export async function search(query: SearchQuery) {
  const terms = searchTerms(query.q);
  if (terms.length === 0) {
    return { query: query.q, stories: [], writers: [], tags: [] };
  }

  const wants = (kind: SearchQuery["type"]) =>
    query.type === "all" || query.type === kind;
  // A search across everything shows a short list of each kind.
  const limit = query.type === "all" ? Math.min(query.limit, 10) : query.limit;

  const [stories, writers, tags] = await Promise.all([
    wants("stories") ? findStories(terms, limit, query.mature) : [],
    wants("writers") ? findWriters(terms, limit) : [],
    wants("tags") ? findTags(terms, limit) : [],
  ]);

  return { query: query.q, stories, writers, tags };
}

// Location: backend/services/search.service.ts
// End of file: search.service.ts