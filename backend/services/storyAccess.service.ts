// Location: backend/services/storyAccess.service.ts
// Purpose: Small shared helpers used by the story and chapter services: who
// may write, who may see a hidden or draft story, whether a reader has an
// active membership, finding a story that belongs to the logged-in writer, and
// publishing scheduled chapters whose time has come.

import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import type { AuthUser } from "../utils/selects";

// Approved writers can write. The Super Admin can always write.
export function canWrite(user: AuthUser): boolean {
  return user.writerStatus === "APPROVED" || user.adminRank === "SUPER_ADMIN";
}

export function assertWriter(user: AuthUser): void {
  if (canWrite(user)) return;
  throw new AppError(
    user.writerStatus === "PENDING"
      ? "Your writer application is still waiting for approval"
      : "You need an approved writer account to do this. Please apply to become a writer first",
    403
  );
}

// The author of a story and every admin may see it even when it is a draft.
export function isOwnerOrAdmin(
  viewer: AuthUser | null,
  authorId: string
): boolean {
  return !!viewer && (viewer.id === authorId || viewer.adminRank !== null);
}

// Stops with "not found" if the viewer is not allowed to see this story.
export function assertCanView(
  story: { status: string; authorId: string },
  viewer: AuthUser | null
): void {
  if (story.status === "PUBLISHED") return;
  if (!isOwnerOrAdmin(viewer, story.authorId)) {
    throw new AppError("Story not found", 404);
  }
}

export async function hasActiveMembership(
  userId: string,
  writerId: string
): Promise<boolean> {
  const count = await prisma.membership.count({
    where: {
      subscriberId: userId,
      status: "ACTIVE",
      tier: { writerId },
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
    },
  });
  return count > 0;
}

// Finds a story and makes sure it belongs to this writer.
export async function findOwnedStory(user: AuthUser, storyId: string) {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, authorId: true, status: true, publishedAt: true },
  });
  if (!story) throw new AppError("Story not found", 404);
  if (story.authorId !== user.id) {
    throw new AppError("You can only change your own stories", 403);
  }
  return story;
}

// Scheduled chapters go live by themselves: whenever someone reads or lists
// stories, any scheduled chapter whose time has passed is published first. This
// needs no paid timer or background worker.
export async function publishDueChapters(): Promise<void> {
  const due = await prisma.chapter.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    select: { id: true, scheduledAt: true },
    take: 200,
  });
  if (due.length === 0) return;

  await prisma.$transaction(
    due.map((chapter) =>
      prisma.chapter.update({
        where: { id: chapter.id },
        data: {
          status: "PUBLISHED",
          publishedAt: chapter.scheduledAt ?? new Date(),
          scheduledAt: null,
        },
      })
    )
  );
}

// Location: backend/services/storyAccess.service.ts
// End of file: storyAccess.service.ts