// Location: backend/services/notification.service.ts
// Purpose: Creates and manages notifications. Creating a notification never
// breaks the real action: if it fails, the error is only logged. Also lists a
// person's notifications, counts the unread ones, and marks them as read.

import type { NotificationType } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";

export async function createNotification(
  userId: string,
  type: NotificationType,
  message: string,
  link?: string
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type,
        message: message.slice(0, 300),
        link: link ?? null,
      },
    });
  } catch (error) {
    console.error("Could not create notification", error);
  }
}

type ChapterNotice = {
  authorId: string;
  story: { title: string; slug: string };
  chapter: { number: number; title: string };
};

// Tells every follower of a writer that a new chapter is out.
export async function notifyFollowersOfChapter(
  notice: ChapterNotice
): Promise<void> {
  try {
    const [author, followers] = await Promise.all([
      prisma.user.findUnique({
        where: { id: notice.authorId },
        select: { displayName: true },
      }),
      prisma.follow.findMany({
        where: { followingId: notice.authorId },
        select: { followerId: true },
        take: 5000,
      }),
    ]);
    if (followers.length === 0) return;

    const name = author?.displayName ?? "A writer you follow";
    const message =
      `${name} published chapter ${notice.chapter.number} of "${notice.story.title}"`.slice(
        0,
        300
      );
    const link = `/stories/${notice.story.slug}/chapters/${notice.chapter.number}`;

    await prisma.notification.createMany({
      data: followers.map((follower) => ({
        userId: follower.followerId,
        type: "NEW_CHAPTER" as const,
        message,
        link,
      })),
    });
  } catch (error) {
    console.error("Could not notify followers", error);
  }
}

export async function listNotifications(
  userId: string,
  page: number,
  limit: number,
  unreadOnly: boolean
) {
  const where = { userId, ...(unreadOnly ? { isRead: false } : {}) };

  const [notifications, total, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return { notifications, page, limit, total, unreadCount };
}

export async function getUnreadCount(userId: string) {
  const unreadCount = await prisma.notification.count({
    where: { userId, isRead: false },
  });
  return { unreadCount };
}

export async function markNotificationRead(
  userId: string,
  notificationId: string
) {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  });
  if (result.count === 0) throw new AppError("Notification not found", 404);
  return { notificationId, isRead: true };
}

export async function markAllNotificationsRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
  return { updated: result.count };
}

// Location: backend/services/notification.service.ts
// End of file: notification.service.ts