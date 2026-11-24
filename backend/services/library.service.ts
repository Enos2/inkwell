// Location: backend/services/library.service.ts
// Purpose: A reader's personal library (bookmarks). Add or remove a published
// story, and list the library together with how far the reader has got in each
// story.

import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import type { AuthUser } from "../utils/selects";
import { findPublishedStory } from "./storyAccess.service";

const librarySelect = {
  id: true,
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
  _count: {
    select: { likes: true, chapters: { where: { status: "PUBLISHED" } } },
  },
} satisfies Prisma.StorySelect;

export async function addToLibrary(user: AuthUser, storyId: string) {
  await findPublishedStory(storyId);

  await prisma.libraryEntry.upsert({
    where: { userId_storyId: { userId: user.id, storyId } },
    create: { userId: user.id, storyId },
    update: {},
  });

  return { inLibrary: true, storyId };
}

export async function removeFromLibrary(user: AuthUser, storyId: string) {
  await prisma.libraryEntry.deleteMany({
    where: { userId: user.id, storyId },
  });
  return { inLibrary: false, storyId };
}

export async function listLibrary(
  user: AuthUser,
  page: number,
  limit: number
) {
  const where = { userId: user.id, story: { status: "PUBLISHED" as const } };

  const [entries, total] = await prisma.$transaction([
    prisma.libraryEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: { createdAt: true, story: { select: librarySelect } },
    }),
    prisma.libraryEntry.count({ where }),
  ]);

  const storyIds = entries.map((entry) => entry.story.id);
  const progressRows =
    storyIds.length === 0
      ? []
      : await prisma.readingProgress.findMany({
          where: { userId: user.id, storyId: { in: storyIds } },
          select: {
            storyId: true,
            chapterId: true,
            position: true,
            updatedAt: true,
            chapter: { select: { number: true, title: true } },
          },
        });
  const progressByStory = new Map(
    progressRows.map((row) => [row.storyId, row] as const)
  );

  const library = entries.map((entry) => {
    const { _count, ...story } = entry.story;
    return {
      addedAt: entry.createdAt,
      story: {
        ...story,
        chapterCount: _count.chapters,
        likeCount: _count.likes,
      },
      progress: progressByStory.get(entry.story.id) ?? null,
    };
  });

  return { library, page, limit, total };
}

// Location: backend/services/library.service.ts
// End of file: library.service.ts