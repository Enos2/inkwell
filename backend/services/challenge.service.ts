// Project: Inkwell
// Location: backend/services/challenge.service.ts
// Purpose: Writing challenges. Admins with the MANAGE_CHALLENGES ability create
// and edit challenges and pick winners (every action is written to the activity
// log, and a winner is notified). Anyone can browse challenges and see the
// published entries. An approved writer can enter up to 3 of their OWN stories
// while a challenge is running, and withdraw an entry until it ends.

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import { randomSuffix, slugify } from "../utils/slug";
import type { AuthUser } from "../utils/selects";
import type {
  CreateChallengeInput,
  ListChallengesQuery,
  UpdateChallengeInput,
} from "../validators/challenge.validator";
import { createNotification } from "./notification.service";
import { assertWriter } from "./storyAccess.service";
import { formatStoryCard, liveStoryWhere, storyCardSelect } from "./storyCard";

const MAX_ENTRIES_PER_WRITER = 3;

const challengeSelect = {
  id: true,
  title: true,
  slug: true,
  prompt: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
  _count: { select: { entries: true } },
} satisfies Prisma.ChallengeSelect;

type ChallengeStatus = "upcoming" | "active" | "past";

function challengeStatus(
  challenge: { startsAt: Date; endsAt: Date },
  now: Date
): ChallengeStatus {
  if (challenge.startsAt.getTime() > now.getTime()) return "upcoming";
  if (challenge.endsAt.getTime() < now.getTime()) return "past";
  return "active";
}

function formatChallenge<
  T extends { startsAt: Date; endsAt: Date; _count: { entries: number } },
>(row: T) {
  const { _count, ...rest } = row;
  return {
    ...rest,
    status: challengeStatus(rest, new Date()),
    entryCount: _count.entries,
  };
}

async function makeUniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || "challenge";
  const taken = await prisma.challenge.findUnique({
    where: { slug: base },
    select: { id: true },
  });
  return taken ? `${base}-${randomSuffix()}` : base;
}

async function findChallengeBySlug(slug: string) {
  const challenge = await prisma.challenge.findUnique({
    where: { slug },
    select: { id: true, title: true, slug: true, startsAt: true, endsAt: true },
  });
  if (!challenge) throw new AppError("Challenge not found", 404);
  return challenge;
}

// ---------------------------------------------------------------- PUBLIC

export async function listChallenges(query: ListChallengesQuery) {
  const now = new Date();

  let where: Prisma.ChallengeWhereInput = {};
  let orderBy: Prisma.ChallengeOrderByWithRelationInput = { startsAt: "desc" };

  if (query.status === "active") {
    where = { startsAt: { lte: now }, endsAt: { gte: now } };
    orderBy = { endsAt: "asc" };
  } else if (query.status === "upcoming") {
    where = { startsAt: { gt: now } };
    orderBy = { startsAt: "asc" };
  } else if (query.status === "past") {
    where = { endsAt: { lt: now } };
    orderBy = { endsAt: "desc" };
  }

  const [rows, total] = await prisma.$transaction([
    prisma.challenge.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: challengeSelect,
    }),
    prisma.challenge.count({ where }),
  ]);

  return {
    challenges: rows.map((row) => formatChallenge(row)),
    page: query.page,
    limit: query.limit,
    total,
  };
}

// A challenge with its published entries. Winners come first.
export async function getChallengeBySlug(slug: string) {
  const challenge = await prisma.challenge.findUnique({
    where: { slug },
    select: challengeSelect,
  });
  if (!challenge) throw new AppError("Challenge not found", 404);

  const entries = await prisma.challengeEntry.findMany({
    where: { challengeId: challenge.id, story: liveStoryWhere(true) },
    orderBy: [{ isWinner: "desc" }, { submittedAt: "desc" }],
    take: 100,
    select: {
      isWinner: true,
      submittedAt: true,
      story: { select: storyCardSelect },
    },
  });

  return {
    challenge: formatChallenge(challenge),
    entries: entries.map((entry) => ({
      isWinner: entry.isWinner,
      submittedAt: entry.submittedAt,
      story: formatStoryCard(entry.story),
    })),
  };
}

// ---------------------------------------------------------------- WRITERS

export async function enterChallenge(
  user: AuthUser,
  slug: string,
  storyId: string
) {
  assertWriter(user);

  const challenge = await findChallengeBySlug(slug);
  if (challengeStatus(challenge, new Date()) !== "active") {
    throw new AppError("This challenge is not open for entries right now", 400);
  }

  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, authorId: true },
  });
  if (!story) throw new AppError("Story not found", 404);
  if (story.authorId !== user.id) {
    throw new AppError("You can only enter your own stories", 403);
  }

  const entered = await prisma.challengeEntry.count({
    where: { challengeId: challenge.id, story: { authorId: user.id } },
  });
  if (entered >= MAX_ENTRIES_PER_WRITER) {
    throw new AppError(
      `You can enter up to ${MAX_ENTRIES_PER_WRITER} stories in one challenge`,
      400
    );
  }

  try {
    await prisma.challengeEntry.create({
      data: { challengeId: challenge.id, storyId },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AppError("This story is already in the challenge", 409);
    }
    throw error;
  }

  return { entered: true, challengeId: challenge.id, storyId };
}

export async function withdrawEntry(
  user: AuthUser,
  slug: string,
  storyId: string
) {
  const challenge = await findChallengeBySlug(slug);
  if (challengeStatus(challenge, new Date()) === "past") {
    throw new AppError("This challenge has ended, so entries are final", 400);
  }

  const result = await prisma.challengeEntry.deleteMany({
    where: {
      challengeId: challenge.id,
      storyId,
      story: { authorId: user.id },
    },
  });
  if (result.count === 0) throw new AppError("Entry not found", 404);

  return { entered: false, challengeId: challenge.id, storyId };
}

// ---------------------------------------------------------------- ADMIN

export async function createChallenge(
  actor: AuthUser,
  input: CreateChallengeInput
) {
  const slug = await makeUniqueSlug(input.title);

  const challenge = await prisma.$transaction(async (tx) => {
    const created = await tx.challenge.create({
      data: {
        title: input.title,
        slug,
        prompt: input.prompt,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        createdById: actor.id,
      },
      select: challengeSelect,
    });
    await tx.adminActionLog.create({
      data: {
        actorId: actor.id,
        action: "CHALLENGE_CREATED",
        details: { challengeId: created.id, title: created.title },
      },
    });
    return created;
  });

  return { challenge: formatChallenge(challenge) };
}

export async function updateChallenge(
  actor: AuthUser,
  challengeId: string,
  input: UpdateChallengeInput
) {
  const existing = await prisma.challenge.findUnique({
    where: { id: challengeId },
    select: { id: true, title: true, startsAt: true, endsAt: true },
  });
  if (!existing) throw new AppError("Challenge not found", 404);

  const startsAt = input.startsAt ?? existing.startsAt;
  const endsAt = input.endsAt ?? existing.endsAt;
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new AppError("The end time must be after the start time", 400);
  }

  const data: Prisma.ChallengeUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.prompt !== undefined) data.prompt = input.prompt;
  if (input.startsAt !== undefined) data.startsAt = input.startsAt;
  if (input.endsAt !== undefined) data.endsAt = input.endsAt;

  const challenge = await prisma.$transaction(async (tx) => {
    const updated = await tx.challenge.update({
      where: { id: challengeId },
      data,
      select: challengeSelect,
    });
    await tx.adminActionLog.create({
      data: {
        actorId: actor.id,
        action: "CHALLENGE_UPDATED",
        details: {
          challengeId,
          title: existing.title,
          changedFields: Object.keys(input),
        },
      },
    });
    return updated;
  });

  return { challenge: formatChallenge(challenge) };
}

export async function deleteChallenge(actor: AuthUser, challengeId: string) {
  const existing = await prisma.challenge.findUnique({
    where: { id: challengeId },
    select: { id: true, title: true },
  });
  if (!existing) throw new AppError("Challenge not found", 404);

  await prisma.$transaction([
    prisma.challenge.delete({ where: { id: challengeId } }),
    prisma.adminActionLog.create({
      data: {
        actorId: actor.id,
        action: "CHALLENGE_DELETED",
        details: { challengeId, title: existing.title },
      },
    }),
  ]);

  return { message: "Challenge deleted", challengeId };
}

// Marks an entry as a winner (or removes the mark). A new winner is notified.
export async function setEntryWinner(
  actor: AuthUser,
  challengeId: string,
  storyId: string,
  isWinner: boolean
) {
  const entry = await prisma.challengeEntry.findUnique({
    where: { challengeId_storyId: { challengeId, storyId } },
    select: {
      id: true,
      isWinner: true,
      challenge: { select: { title: true } },
      story: { select: { title: true, slug: true, authorId: true } },
    },
  });
  if (!entry) throw new AppError("Entry not found", 404);
  if (entry.isWinner === isWinner) {
    return { challengeId, storyId, isWinner };
  }

  await prisma.$transaction([
    prisma.challengeEntry.update({
      where: { id: entry.id },
      data: { isWinner },
    }),
    prisma.adminActionLog.create({
      data: {
        actorId: actor.id,
        targetUserId: entry.story.authorId,
        action: isWinner ? "CHALLENGE_WINNER_SET" : "CHALLENGE_WINNER_REMOVED",
        details: { challengeId, storyId },
      },
    }),
  ]);

  if (isWinner) {
    await createNotification(
      entry.story.authorId,
      "SYSTEM",
      `Congratulations! Your story "${entry.story.title}" won the "${entry.challenge.title}" challenge`,
      `/stories/${entry.story.slug}`
    );
  }

  return { challengeId, storyId, isWinner };
}

// Location: backend/services/challenge.service.ts
// End of file: challenge.service.ts