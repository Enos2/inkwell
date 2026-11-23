// Location: backend/services/chapter.service.ts
// Purpose: The real work for chapters: creating, editing and deleting a
// chapter (writers only, on their own stories) and reading a chapter. Reading
// checks that the story is visible, that members-only chapters are only shown
// to members, adds to the story's view count, and returns the previous and next
// chapters. Chapter numbers are given automatically (1, 2, 3 ...).

import { Prisma } from "@prisma/client";
import type { ChapterStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import { parseVideoUrl } from "../utils/video";
import type { AuthUser } from "../utils/selects";
import type {
  CreateChapterInput,
  UpdateChapterInput,
} from "../validators/chapter.validator";
import {
  assertCanView,
  findOwnedStory,
  hasActiveMembership,
  isOwnerOrAdmin,
  publishDueChapters,
} from "./storyAccess.service";

const chapterSelect = {
  id: true,
  storyId: true,
  number: true,
  title: true,
  content: true,
  videoUrl: true,
  status: true,
  scheduledAt: true,
  publishedAt: true,
  isMembersOnly: true,
  wordCount: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ChapterSelect;

type ChapterRow = Prisma.ChapterGetPayload<{ select: typeof chapterSelect }>;

function withEmbed(chapter: ChapterRow) {
  const video = chapter.videoUrl ? parseVideoUrl(chapter.videoUrl) : null;
  return { ...chapter, videoEmbedUrl: video ? video.embedUrl : null };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Works out the status, scheduled time and published time of a chapter.
function resolvePublishFields(
  status: ChapterStatus,
  scheduledAt: Date | null,
  existingPublishedAt: Date | null
) {
  if (status === "SCHEDULED") {
    if (!scheduledAt) {
      throw new AppError(
        "Choose a date and time for the scheduled chapter",
        400
      );
    }
    if (scheduledAt.getTime() <= Date.now()) {
      throw new AppError("The scheduled time must be in the future", 400);
    }
    return { status, scheduledAt, publishedAt: null };
  }

  if (status === "PUBLISHED") {
    return {
      status,
      scheduledAt: null,
      publishedAt: existingPublishedAt ?? new Date(),
    };
  }

  return { status: "DRAFT" as const, scheduledAt: null, publishedAt: null };
}

// If a published story loses its last published chapter, it goes back to draft.
async function demoteStoryIfEmpty(storyId: string): Promise<void> {
  const published = await prisma.chapter.count({
    where: { storyId, status: "PUBLISHED" },
  });
  if (published === 0) {
    await prisma.story.updateMany({
      where: { id: storyId, status: "PUBLISHED" },
      data: { status: "DRAFT" },
    });
  }
}

export async function createChapter(
  user: AuthUser,
  storyId: string,
  input: CreateChapterInput
) {
  await findOwnedStory(user, storyId);

  const fields = resolvePublishFields(
    input.status,
    input.scheduledAt ?? null,
    null
  );

  const last = await prisma.chapter.aggregate({
    where: { storyId },
    _max: { number: true },
  });
  const number = (last._max.number ?? 0) + 1;

  try {
    const chapter = await prisma.chapter.create({
      data: {
        storyId,
        number,
        title: input.title,
        content: input.content,
        wordCount: countWords(input.content),
        videoUrl: input.videoUrl ?? null,
        isMembersOnly: input.isMembersOnly,
        status: fields.status,
        scheduledAt: fields.scheduledAt,
        publishedAt: fields.publishedAt,
      },
      select: chapterSelect,
    });
    return withEmbed(chapter);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AppError(
        "Another chapter was being saved at the same time. Please try again",
        409
      );
    }
    throw error;
  }
}

async function findOwnedChapter(user: AuthUser, chapterId: string) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      id: true,
      storyId: true,
      status: true,
      scheduledAt: true,
      publishedAt: true,
      story: { select: { authorId: true } },
    },
  });
  if (!chapter) throw new AppError("Chapter not found", 404);
  if (chapter.story.authorId !== user.id) {
    throw new AppError("You can only change your own chapters", 403);
  }
  return chapter;
}

export async function updateChapter(
  user: AuthUser,
  chapterId: string,
  input: UpdateChapterInput
) {
  const chapter = await findOwnedChapter(user, chapterId);

  const data: Prisma.ChapterUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.content !== undefined) {
    data.content = input.content;
    data.wordCount = countWords(input.content);
  }
  if (input.videoUrl !== undefined) data.videoUrl = input.videoUrl;
  if (input.isMembersOnly !== undefined) {
    data.isMembersOnly = input.isMembersOnly;
  }

  if (input.status !== undefined || input.scheduledAt !== undefined) {
    const status = input.status ?? chapter.status;
    const scheduledAt =
      input.scheduledAt !== undefined ? input.scheduledAt : chapter.scheduledAt;
    const fields = resolvePublishFields(
      status,
      scheduledAt,
      chapter.publishedAt
    );
    data.status = fields.status;
    data.scheduledAt = fields.scheduledAt;
    data.publishedAt = fields.publishedAt;
  }

  const updated = await prisma.chapter.update({
    where: { id: chapterId },
    data,
    select: chapterSelect,
  });

  await demoteStoryIfEmpty(chapter.storyId);
  return withEmbed(updated);
}

export async function deleteChapter(user: AuthUser, chapterId: string) {
  const chapter = await findOwnedChapter(user, chapterId);
  await prisma.chapter.delete({ where: { id: chapterId } });
  await demoteStoryIfEmpty(chapter.storyId);
  return { message: "Chapter deleted", chapterId };
}

export async function getChapterForReading(
  slug: string,
  number: number,
  viewer: AuthUser | null
) {
  await publishDueChapters();

  const story = await prisma.story.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      authorId: true,
      author: {
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      },
    },
  });
  if (!story) throw new AppError("Story not found", 404);
  assertCanView(story, viewer);

  const seeAll = isOwnerOrAdmin(viewer, story.authorId);

  const chapter = await prisma.chapter.findUnique({
    where: { storyId_number: { storyId: story.id, number } },
    select: chapterSelect,
  });
  if (!chapter || (chapter.status !== "PUBLISHED" && !seeAll)) {
    throw new AppError("Chapter not found", 404);
  }

  if (chapter.isMembersOnly && !seeAll) {
    const isMember = viewer
      ? await hasActiveMembership(viewer.id, story.authorId)
      : false;
    if (!isMember) {
      throw new AppError("This chapter is for members only", 403);
    }
  }

  // Count a view, except when the author reads their own work.
  if (!viewer || viewer.id !== story.authorId) {
    await prisma.story.update({
      where: { id: story.id },
      data: { viewCount: { increment: 1 } },
    });
  }

  const published = { storyId: story.id, status: "PUBLISHED" as const };
  const [previous, next] = await Promise.all([
    prisma.chapter.findFirst({
      where: { ...published, number: { lt: number } },
      orderBy: { number: "desc" },
      select: { number: true, title: true },
    }),
    prisma.chapter.findFirst({
      where: { ...published, number: { gt: number } },
      orderBy: { number: "asc" },
      select: { number: true, title: true },
    }),
  ]);

  return {
    story: {
      id: story.id,
      title: story.title,
      slug: story.slug,
      author: story.author,
    },
    chapter: withEmbed(chapter),
    previous,
    next,
  };
}

// Location: backend/services/chapter.service.ts
// End of file: chapter.service.ts