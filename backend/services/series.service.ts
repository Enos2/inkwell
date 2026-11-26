// Project: Inkwell
// Location: backend/services/series.service.ts
// Purpose: Series: a group of stories that belong together (Book 1, Book 2).
// A writer creates series, edits them, deletes them (the stories stay, they just
// leave the series) and puts their OWN stories in or out of a series with a
// position number. Anyone can see a series, but visitors only see its published
// stories, and nothing at all if the writer is banned or suspended.

import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import { randomSuffix, slugify } from "../utils/slug";
import type { AuthUser } from "../utils/selects";
import type {
  CreateSeriesInput,
  UpdateSeriesInput,
} from "../validators/series.validator";
import { isAccountBlocked } from "./session.service";
import { assertWriter } from "./storyAccess.service";
import { formatStoryCard, storyCardSelect } from "./storyCard";

const MAX_SERIES_PER_WRITER = 50;

const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

const seriesBase = {
  id: true,
  title: true,
  slug: true,
  description: true,
  coverUrl: true,
  createdAt: true,
  updatedAt: true,
  author: { select: authorSelect },
} as const satisfies Prisma.SeriesSelect;

// For the public: the count only includes published stories.
const publicSeriesSelect = {
  ...seriesBase,
  _count: { select: { stories: { where: { status: "PUBLISHED" } } } },
} satisfies Prisma.SeriesSelect;

// For the writer: the count includes drafts.
const ownerSeriesSelect = {
  ...seriesBase,
  _count: { select: { stories: true } },
} satisfies Prisma.SeriesSelect;

function formatSeries<T extends { _count: { stories: number } }>(row: T) {
  const { _count, ...rest } = row;
  return { ...rest, storyCount: _count.stories };
}

async function makeUniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || "series";
  const taken = await prisma.series.findUnique({
    where: { slug: base },
    select: { id: true },
  });
  return taken ? `${base}-${randomSuffix()}` : base;
}

async function findOwnedSeries(user: AuthUser, seriesId: string) {
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    select: { id: true, authorId: true },
  });
  if (!series) throw new AppError("Series not found", 404);
  if (series.authorId !== user.id) {
    throw new AppError("You can only change your own series", 403);
  }
  return series;
}

export async function listAuthorSeries(username: string) {
  const author = await prisma.user.findUnique({
    where: { username },
    select: { id: true, status: true, bannedUntil: true },
  });
  if (!author || isAccountBlocked(author)) {
    throw new AppError("User not found", 404);
  }

  const series = await prisma.series.findMany({
    where: { authorId: author.id, stories: { some: { status: "PUBLISHED" } } },
    orderBy: { updatedAt: "desc" },
    select: publicSeriesSelect,
  });

  return { series: series.map((row) => formatSeries(row)) };
}

export async function listMySeries(user: AuthUser) {
  const series = await prisma.series.findMany({
    where: { authorId: user.id },
    orderBy: { updatedAt: "desc" },
    select: ownerSeriesSelect,
  });
  return { series: series.map((row) => formatSeries(row)) };
}

export async function getSeriesBySlug(slug: string, viewer: AuthUser | null) {
  const series = await prisma.series.findUnique({
    where: { slug },
    select: { ...seriesBase, authorId: true },
  });
  if (!series) throw new AppError("Series not found", 404);

  const isOwner = !!viewer && viewer.id === series.authorId;
  const isAdmin = !!viewer && viewer.adminRank !== null;
  const seeAll = isOwner || isAdmin;

  if (!seeAll) {
    const author = await prisma.user.findUnique({
      where: { id: series.authorId },
      select: { status: true, bannedUntil: true },
    });
    if (!author || isAccountBlocked(author)) {
      throw new AppError("Series not found", 404);
    }
  }

  const stories = await prisma.story.findMany({
    where: {
      seriesId: series.id,
      ...(seeAll ? {} : { status: "PUBLISHED" as const }),
    },
    orderBy: [{ seriesOrder: "asc" }, { createdAt: "asc" }],
    select: { ...storyCardSelect, status: true, seriesOrder: true },
  });

  const { authorId, ...info } = series;
  void authorId;

  return {
    series: { ...info, storyCount: stories.length },
    stories: stories.map((story) => ({
      ...formatStoryCard(story),
      status: story.status,
      seriesOrder: story.seriesOrder,
    })),
  };
}

export async function createSeries(user: AuthUser, input: CreateSeriesInput) {
  assertWriter(user);

  const existing = await prisma.series.count({ where: { authorId: user.id } });
  if (existing >= MAX_SERIES_PER_WRITER) {
    throw new AppError(
      `You can have up to ${MAX_SERIES_PER_WRITER} series`,
      400
    );
  }

  const series = await prisma.series.create({
    data: {
      authorId: user.id,
      title: input.title,
      slug: await makeUniqueSlug(input.title),
      description: input.description ?? null,
      coverUrl: input.coverUrl ?? null,
    },
    select: ownerSeriesSelect,
  });

  return { series: formatSeries(series) };
}

export async function updateSeries(
  user: AuthUser,
  seriesId: string,
  input: UpdateSeriesInput
) {
  await findOwnedSeries(user, seriesId);

  const data: Prisma.SeriesUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.coverUrl !== undefined) data.coverUrl = input.coverUrl;

  const series = await prisma.series.update({
    where: { id: seriesId },
    data,
    select: ownerSeriesSelect,
  });

  return { series: formatSeries(series) };
}

// The stories are kept: they simply leave the series.
export async function deleteSeries(user: AuthUser, seriesId: string) {
  await findOwnedSeries(user, seriesId);

  await prisma.$transaction([
    prisma.story.updateMany({
      where: { seriesId },
      data: { seriesId: null, seriesOrder: null },
    }),
    prisma.series.delete({ where: { id: seriesId } }),
  ]);

  return { message: "Series deleted", seriesId };
}

// Puts one of the writer's own stories in the series. Without a position, it
// goes to the end.
export async function addStoryToSeries(
  user: AuthUser,
  seriesId: string,
  storyId: string,
  order: number | undefined
) {
  await findOwnedSeries(user, seriesId);

  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, authorId: true },
  });
  if (!story) throw new AppError("Story not found", 404);
  if (story.authorId !== user.id) {
    throw new AppError("You can only add your own stories to a series", 403);
  }

  let position = order;
  if (position === undefined) {
    const last = await prisma.story.aggregate({
      where: { seriesId },
      _max: { seriesOrder: true },
    });
    position = (last._max.seriesOrder ?? 0) + 1;
  }

  await prisma.story.update({
    where: { id: storyId },
    data: { seriesId, seriesOrder: position },
  });

  return { seriesId, storyId, seriesOrder: position };
}

export async function removeStoryFromSeries(
  user: AuthUser,
  seriesId: string,
  storyId: string
) {
  await findOwnedSeries(user, seriesId);

  const result = await prisma.story.updateMany({
    where: { id: storyId, seriesId, authorId: user.id },
    data: { seriesId: null, seriesOrder: null },
  });
  if (result.count === 0) {
    throw new AppError("That story is not in this series", 404);
  }

  return { seriesId, storyId, removed: true };
}

// Location: backend/services/series.service.ts
// End of file: series.service.ts