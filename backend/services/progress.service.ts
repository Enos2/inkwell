// Project: Inkwell
// Location: backend/services/progress.service.ts
// Purpose: Remembers where each reader stopped. One saved spot per story (the
// chapter and how far down it). Also gives the "continue reading" list and the
// saved spot for one story. Progress can only be saved for a chapter the
// person is allowed to read. Saving progress also counts today as a reading day
// for streaks and badges.

import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import type { AuthUser } from "../utils/selects";
import type { SaveProgressInput } from "../validators/social.validator";
import { recordReadingActivity } from "./engagement.service";
import { assertCanAccessChapter, assertCanView } from "./storyAccess.service";

const progressSelect = {
  storyId: true,
  chapterId: true,
  position: true,
  updatedAt: true,
  chapter: { select: { number: true, title: true } },
} as const;

export async function saveProgress(user: AuthUser, input: SaveProgressInput) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: input.chapterId },
    select: {
      id: true,
      storyId: true,
      status: true,
      isMembersOnly: true,
      story: { select: { id: true, status: true, authorId: true } },
    },
  });
  if (!chapter) throw new AppError("Chapter not found", 404);
  if (chapter.storyId !== input.storyId) {
    throw new AppError("That chapter does not belong to that story", 400);
  }

  assertCanView(chapter.story, user);
  await assertCanAccessChapter(chapter, chapter.story, user);

  const progress = await prisma.readingProgress.upsert({
    where: {
      userId_storyId: { userId: user.id, storyId: input.storyId },
    },
    create: {
      userId: user.id,
      storyId: input.storyId,
      chapterId: input.chapterId,
      position: input.position,
    },
    update: { chapterId: input.chapterId, position: input.position },
    select: progressSelect,
  });

  // Count today as a reading day. A problem here must never stop the progress
  // from being saved, so it is only logged.
  recordReadingActivity(user.id).catch((error: unknown) => {
    console.error("Could not record reading activity", error);
  });

  return { progress };
}

export async function getProgressForStory(user: AuthUser, storyId: string) {
  const progress = await prisma.readingProgress.findUnique({
    where: { userId_storyId: { userId: user.id, storyId } },
    select: progressSelect,
  });
  return { progress };
}

// The stories the reader read most recently, newest first.
export async function listContinueReading(user: AuthUser, limit: number) {
  const rows = await prisma.readingProgress.findMany({
    where: { userId: user.id, story: { status: "PUBLISHED" } },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      ...progressSelect,
      story: {
        select: {
          id: true,
          title: true,
          slug: true,
          coverUrl: true,
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          _count: {
            select: { chapters: { where: { status: "PUBLISHED" } } },
          },
        },
      },
    },
  });

  const items = rows.map((row) => {
    const { story, ...progress } = row;
    const { _count, ...storyDetails } = story;
    return {
      progress,
      story: { ...storyDetails, chapterCount: _count.chapters },
    };
  });

  return { items };
}

// Location: backend/services/progress.service.ts
// End of file: progress.service.ts