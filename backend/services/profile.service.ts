// Location: backend/services/profile.service.ts
// Purpose: The real work for profiles: showing a public profile (with counts
// and whether the viewer follows this person), editing your own profile, and
// replacing your list of social links.

import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import type { AuthUser } from "../utils/selects";
import type {
  SetSocialLinksInput,
  UpdateProfileInput,
} from "../validators/profile.validator";

export async function getProfile(username: string, viewer: AuthUser | null) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      country: true,
      writerStatus: true,
      status: true,
      createdAt: true,
      socialLinks: {
        select: { platform: true, url: true },
        orderBy: { platform: "asc" },
      },
      _count: { select: { followers: true, following: true } },
    },
  });
  if (!user || user.status !== "ACTIVE") {
    throw new AppError("User not found", 404);
  }

  const [storyCount, followRow] = await Promise.all([
    prisma.story.count({ where: { authorId: user.id, status: "PUBLISHED" } }),
    viewer && viewer.id !== user.id
      ? prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: viewer.id,
              followingId: user.id,
            },
          },
        })
      : Promise.resolve(null),
  ]);

  return {
    profile: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      country: user.country,
      isWriter: user.writerStatus === "APPROVED",
      joinedAt: user.createdAt,
      socialLinks: user.socialLinks,
      followerCount: user._count.followers,
      followingCount: user._count.following,
      storyCount,
      isMe: !!viewer && viewer.id === user.id,
      followedByMe: followRow !== null,
    },
  };
}

export async function updateProfile(user: AuthUser, input: UpdateProfileInput) {
  const data: Prisma.UserUpdateInput = {};
  if (input.displayName !== undefined) data.displayName = input.displayName;
  if (input.bio !== undefined) data.bio = input.bio;
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
  if (input.country !== undefined) data.country = input.country;

  await prisma.user.update({ where: { id: user.id }, data });
  return getProfile(user.username, user);
}

// Replaces the whole list in one step. Sending an empty list removes all links.
export async function setSocialLinks(
  user: AuthUser,
  input: SetSocialLinksInput
) {
  await prisma.$transaction([
    prisma.socialLink.deleteMany({ where: { userId: user.id } }),
    prisma.socialLink.createMany({
      data: input.links.map((link) => ({
        userId: user.id,
        platform: link.platform,
        url: link.url,
      })),
    }),
  ]);

  const socialLinks = await prisma.socialLink.findMany({
    where: { userId: user.id },
    select: { platform: true, url: true },
    orderBy: { platform: "asc" },
  });

  return { socialLinks };
}

// Location: backend/services/profile.service.ts
// End of file: profile.service.ts