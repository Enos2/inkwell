// Location: backend/services/story.service.ts
// Purpose: The real work for stories: browsing and searching, reading one
// story, a writer's own stories, creating, editing, publishing, unpublishing
// and deleting. Stories hidden by a moderator cannot be published again by
// their author. An admin with DELETE_STORIES can delete any story, and that is
// written to the activity log.

import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import { normalizeTags, randomSuffix, slugify } from "../utils/slug";
import type { AuthUser } from "../utils/selects";
import type {
  CreateStoryInput,
  ListStoriesQuery,
  UpdateStoryInput,
} from "../validators/story.validator";
import { userHasPermission } from "./permission.service";
import {
  assertCanView,
  assertWriter,
  findOwnedStory,
  isOwnerOrAdmin,
  publishDueChapters,
} from "./storyAccess.service";

const storySummarySelect = {
  id: true,
  authorId: true,
  kind: true,
  title: true,
  slug: true,
  synopsis: true,
  coverUrl: true,
  language: true,
  isMature: true,
  status: true,
  isFeatured: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  author: {
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  },
  tags: { select: { name: true, slug: true } },
  _count: {
    select: { likes: true, chapters: { where: { status: "PUBLISHED" } } },
  },
} satisfies Prisma.StorySelect;

type StoryRow = Prisma.StoryGetPayload<{ select: typeof storySummarySelect }>;

function formatStory(story: StoryRow) {
  const { _count, authorId, ...rest } = story;
  void authorId;
  return {
    ...rest,
    likeCount: _count.likes,
    chapterCount: _count.chapters,
  };
}

async function makeUniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || "story";
  const taken = await prisma.story.findUnique({
    where: { slug: base },
    select: { id: true },
  });
  return taken ? `${base}-${randomSuffix()}` : base;
}

function tagConnections(names: string[]) {
  return normalizeTags(names).map((tag) => ({
    where: { slug: tag.slug },
    create: { name: tag.name, slug: tag.slug },
  }));
}

export async function listStories(query: ListStoriesQuery) {
  await publishDueChapters();

  const where: Prisma.StoryWhereInput = {
    status: "PUBLISHED",
    author: {
      status: "ACTIVE",
      ...(query.author ? { username: query.author } : {}),
    },
    ...(query.mature ? {} : { isMature: false }),
    ...(query.tag ? { tags: { some: { slug: query.tag } } } : {}),
    ...(query.language ? { language: query.language } : {}),
    ...(query.q
      ? { title: { contains: query.q, mode: "insensitive" as const } }
      : {}),
  };

  const orderBy: Prisma.StoryOrderByWithRelationInput[] =
    query.sort === "popular"
      ? [{ viewCount: "desc" }, { publishedAt: "desc" }]
      : [{ publishedAt: "desc" }];

  const [stories, total] = await prisma.$transaction([
    prisma.story.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: storySummarySelect,
    }),
    prisma.story.count({ where }),
  ]);

  return {
    stories: stories.map(formatStory),
    page: query.page,
    limit: query.limit,
    total,
    hasMore: query.page * query.limit < total,
  };
}

export async function listTags() {
  const tags = await prisma.tag.findMany({
    where: { stories: { some: { status: "PUBLISHED" } } },
    select: {
      name: true,
      slug: true,
      _count: { select: { stories: { where: { status: "PUBLISHED" } } } },
    },
    orderBy: { stories: { _count: "desc" } },
    take: 50,
  });

  return tags.map((tag) => ({
    name: tag.name,
    slug: tag.slug,
    storyCount: tag._count.stories,
  }));
}

export async function getStoryBySlug(slug: string, viewer: AuthUser | null) {
  await publishDueChapters();

  const story = await prisma.story.findUnique({
    where: { slug },
    select: storySummarySelect,
  });
  if (!story) throw new AppError("Story not found", 404);
  assertCanView(story, viewer);

  const seeAll = isOwnerOrAdmin(viewer, story.authorId);
  const chapters = await prisma.chapter.findMany({
    where: { storyId: story.id, ...(seeAll ? {} : { status: "PUBLISHED" }) },
    orderBy: { number: "asc" },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      wordCount: true,
      isMembersOnly: true,
      publishedAt: true,
      scheduledAt: true,
    },
  });

  return { story: formatStory(story), chapters };
}

export async function listMyStories(
  user: AuthUser,
  page: number,
  limit: number
) {
  const where = { authorId: user.id };

  const [stories, total] = await prisma.$transaction([
    prisma.story.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: storySummarySelect,
    }),
    prisma.story.count({ where }),
  ]);

  return { stories: stories.map(formatStory), page, limit, total };
}

export async function createStory(user: AuthUser, input: CreateStoryInput) {
  assertWriter(user);

  const slug = await makeUniqueSlug(input.title);

  const story = await prisma.story.create({
    data: {
      authorId: user.id,
      kind: input.kind,
      title: input.title,
      slug,
      synopsis: input.synopsis ?? null,
      coverUrl: input.coverUrl ?? null,
      language: input.language,
      isMature: input.isMature,
      tags: { connectOrCreate: tagConnections(input.tags) },
    },
    select: storySummarySelect,
  });

  return formatStory(story);
}

export async function updateStory(
  user: AuthUser,
  storyId: string,
  input: UpdateStoryInput
) {
  await findOwnedStory(user, storyId);

  const data: Prisma.StoryUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.synopsis !== undefined) data.synopsis = input.synopsis;
  if (input.coverUrl !== undefined) data.coverUrl = input.coverUrl;
  if (input.language !== undefined) data.language = input.language;
  if (input.isMature !== undefined) data.isMature = input.isMature;
  if (input.kind !== undefined) data.kind = input.kind;

  if (input.tags !== undefined) {
    // First remove all old tags, then attach the new list.
    await prisma.story.update({
      where: { id: storyId },
      data: { tags: { set: [] } },
    });
    data.tags = { connectOrCreate: tagConnections(input.tags) };
  }

  const story = await prisma.story.update({
    where: { id: storyId },
    data,
    select: storySummarySelect,
  });

  return formatStory(story);
}

export async function publishStory(user: AuthUser, storyId: string) {
  const story = await findOwnedStory(user, storyId);
  if (story.status === "HIDDEN") {
    throw new AppError(
      "This story was hidden by a moderator and cannot be published",
      403
    );
  }

  await publishDueChapters();
  const publishedChapters = await prisma.chapter.count({
    where: { storyId, status: "PUBLISHED" },
  });
  if (publishedChapters === 0) {
    throw new AppError(
      "Publish at least one chapter before publishing the story",
      400
    );
  }

  const updated = await prisma.story.update({
    where: { id: storyId },
    data: { status: "PUBLISHED", publishedAt: story.publishedAt ?? new Date() },
    select: storySummarySelect,
  });

  return formatStory(updated);
}

export async function unpublishStory(user: AuthUser, storyId: string) {
  const story = await findOwnedStory(user, storyId);
  if (story.status === "HIDDEN") {
    throw new AppError("This story was hidden by a moderator", 403);
  }

  const updated = await prisma.story.update({
    where: { id: storyId },
    data: { status: "DRAFT" },
    select: storySummarySelect,
  });

  return formatStory(updated);
}

export async function deleteStory(user: AuthUser, storyId: string) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, title: true, authorId: true },
  });
  if (!story) throw new AppError("Story not found", 404);

  if (story.authorId === user.id) {
    await prisma.story.delete({ where: { id: storyId } });
    return { message: "Story deleted", storyId };
  }

  const allowed = await userHasPermission(
    user.id,
    user.adminRank,
    "DELETE_STORIES"
  );
  if (!allowed) {
    throw new AppError("You can only delete your own stories", 403);
  }

  await prisma.$transaction([
    prisma.story.delete({ where: { id: storyId } }),
    prisma.adminActionLog.create({
      data: {
        actorId: user.id,
        targetUserId: story.authorId,
        action: "STORY_DELETED",
        details: { storyId: story.id, title: story.title },
      },
    }),
  ]);

  return { message: "Story deleted", storyId };
}

// Location: backend/services/story.service.ts
// End of file: story.service.ts