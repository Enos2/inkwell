// Location: backend/services/ad.service.ts
// Purpose: The real work for ads. For admins: create, list, edit and delete
// ads, and the Google AdSense switch (every change goes in the activity log).
// For the website: choose which ads to show in a spot (only live ads that match
// the reader's country and the story's tags, never for premium readers), count
// views, and count clicks while sending the reader to the ad's link.

import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import type { AuthUser } from "../utils/selects";
import type {
  AdminListAdsQuery,
  AdsenseSettingsInput,
  CreateAdInput,
  ServeAdsQuery,
  UpdateAdInput,
} from "../validators/ad.validator";

const ADSENSE_ENABLED_KEY = "adsense_enabled";
const ADSENSE_CLIENT_KEY = "adsense_client_id";

const adAdminSelect = {
  id: true,
  title: true,
  imageUrl: true,
  bodyText: true,
  linkUrl: true,
  placement: true,
  startsAt: true,
  endsAt: true,
  isActive: true,
  targetCountries: true,
  targetTags: true,
  views: true,
  clicks: true,
  createdAt: true,
  createdBy: { select: { id: true, username: true } },
} satisfies Prisma.AdSelect;

type AdAdminRow = Prisma.AdGetPayload<{ select: typeof adAdminSelect }>;

type AdStatus = "live" | "scheduled" | "expired" | "paused";

function adStatus(
  ad: { isActive: boolean; startsAt: Date; endsAt: Date },
  now: Date
): AdStatus {
  if (ad.endsAt.getTime() < now.getTime()) return "expired";
  if (!ad.isActive) return "paused";
  if (ad.startsAt.getTime() > now.getTime()) return "scheduled";
  return "live";
}

function formatAdminAd(ad: AdAdminRow) {
  const clickRatePercent =
    ad.views > 0 ? Math.round((ad.clicks / ad.views) * 10000) / 100 : 0;
  return {
    ...ad,
    status: adStatus(ad, new Date()),
    clickRatePercent,
  };
}

function unique<T>(list: T[]): T[] {
  return [...new Set(list)];
}

function statusFilter(
  status: AdminListAdsQuery["status"],
  now: Date
): Prisma.AdWhereInput {
  switch (status) {
    case "live":
      return { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } };
    case "scheduled":
      return { isActive: true, startsAt: { gt: now }, endsAt: { gte: now } };
    case "expired":
      return { endsAt: { lt: now } };
    case "paused":
      return { isActive: false, endsAt: { gte: now } };
    default:
      return {};
  }
}

// ---------------------------------------------------------------- SETTINGS

async function readAdsenseSettings() {
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: [ADSENSE_ENABLED_KEY, ADSENSE_CLIENT_KEY] } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.value] as const));

  return {
    enabled: byKey.get(ADSENSE_ENABLED_KEY) === "true",
    clientId: byKey.get(ADSENSE_CLIENT_KEY) ?? null,
  };
}

export async function getAdsenseSettings() {
  return { adsense: await readAdsenseSettings() };
}

export async function setAdsenseSettings(
  actor: AuthUser,
  input: AdsenseSettingsInput
) {
  const current = await readAdsenseSettings();
  const clientId = input.clientId ?? current.clientId;

  if (input.enabled && !clientId) {
    throw new AppError(
      "Add your AdSense publisher id (it looks like ca-pub-1234567890123456) before turning AdSense on",
      400
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.siteSetting.upsert({
      where: { key: ADSENSE_ENABLED_KEY },
      create: { key: ADSENSE_ENABLED_KEY, value: String(input.enabled) },
      update: { value: String(input.enabled) },
    });

    if (input.clientId) {
      await tx.siteSetting.upsert({
        where: { key: ADSENSE_CLIENT_KEY },
        create: { key: ADSENSE_CLIENT_KEY, value: input.clientId },
        update: { value: input.clientId },
      });
    }

    await tx.adminActionLog.create({
      data: {
        actorId: actor.id,
        action: "ADSENSE_CHANGED",
        details: {
          enabled: input.enabled,
          publisherIdChanged: input.clientId !== undefined,
        },
      },
    });
  });

  return { adsense: await readAdsenseSettings() };
}

// ---------------------------------------------------------------- ADMIN

export async function createAd(actor: AuthUser, input: CreateAdInput) {
  const ad = await prisma.$transaction(async (tx) => {
    const created = await tx.ad.create({
      data: {
        title: input.title,
        imageUrl: input.imageUrl ?? null,
        bodyText: input.bodyText ?? null,
        linkUrl: input.linkUrl,
        placement: input.placement,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        isActive: input.isActive,
        targetCountries: unique(input.targetCountries),
        targetTags: unique(input.targetTags),
        createdById: actor.id,
      },
      select: adAdminSelect,
    });

    await tx.adminActionLog.create({
      data: {
        actorId: actor.id,
        action: "AD_CREATED",
        details: {
          adId: created.id,
          title: created.title,
          placement: created.placement,
        },
      },
    });

    return created;
  });

  return { ad: formatAdminAd(ad) };
}

export async function listAds(query: AdminListAdsQuery) {
  const now = new Date();
  const where: Prisma.AdWhereInput = {
    AND: [
      statusFilter(query.status, now),
      query.placement ? { placement: query.placement } : {},
    ],
  };

  const [ads, total] = await prisma.$transaction([
    prisma.ad.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: adAdminSelect,
    }),
    prisma.ad.count({ where }),
  ]);

  return {
    ads: ads.map(formatAdminAd),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function getAd(adId: string) {
  const ad = await prisma.ad.findUnique({
    where: { id: adId },
    select: adAdminSelect,
  });
  if (!ad) throw new AppError("Ad not found", 404);
  return { ad: formatAdminAd(ad) };
}

export async function updateAd(
  actor: AuthUser,
  adId: string,
  input: UpdateAdInput
) {
  const existing = await prisma.ad.findUnique({
    where: { id: adId },
    select: {
      id: true,
      title: true,
      imageUrl: true,
      bodyText: true,
      startsAt: true,
      endsAt: true,
    },
  });
  if (!existing) throw new AppError("Ad not found", 404);

  // Check the result of the change, not just the change itself.
  const startsAt = input.startsAt ?? existing.startsAt;
  const endsAt = input.endsAt ?? existing.endsAt;
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new AppError("The end date must be after the start date", 400);
  }

  const imageUrl =
    input.imageUrl !== undefined ? input.imageUrl : existing.imageUrl;
  const bodyText =
    input.bodyText !== undefined ? input.bodyText : existing.bodyText;
  if (!imageUrl && !bodyText) {
    throw new AppError("An ad needs an image link or some text", 400);
  }

  const data: Prisma.AdUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
  if (input.bodyText !== undefined) data.bodyText = input.bodyText;
  if (input.linkUrl !== undefined) data.linkUrl = input.linkUrl;
  if (input.placement !== undefined) data.placement = input.placement;
  if (input.startsAt !== undefined) data.startsAt = input.startsAt;
  if (input.endsAt !== undefined) data.endsAt = input.endsAt;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.targetCountries !== undefined) {
    data.targetCountries = unique(input.targetCountries);
  }
  if (input.targetTags !== undefined) {
    data.targetTags = unique(input.targetTags);
  }

  const ad = await prisma.$transaction(async (tx) => {
    const updated = await tx.ad.update({
      where: { id: adId },
      data,
      select: adAdminSelect,
    });

    await tx.adminActionLog.create({
      data: {
        actorId: actor.id,
        action: "AD_UPDATED",
        details: {
          adId,
          title: existing.title,
          changedFields: Object.keys(input),
        },
      },
    });

    return updated;
  });

  return { ad: formatAdminAd(ad) };
}

export async function deleteAd(actor: AuthUser, adId: string) {
  const existing = await prisma.ad.findUnique({
    where: { id: adId },
    select: { id: true, title: true },
  });
  if (!existing) throw new AppError("Ad not found", 404);

  await prisma.$transaction([
    prisma.ad.delete({ where: { id: adId } }),
    prisma.adminActionLog.create({
      data: {
        actorId: actor.id,
        action: "AD_DELETED",
        details: { adId, title: existing.title },
      },
    }),
  ]);

  return { message: "Ad deleted", adId };
}

// ---------------------------------------------------------------- PUBLIC

function isAdFree(viewer: AuthUser | null): boolean {
  return (
    !!viewer &&
    viewer.premiumUntil !== null &&
    viewer.premiumUntil.getTime() > Date.now()
  );
}

function shuffle<T>(list: T[]): T[] {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

// The ads to show in one spot. An ad with no country (or no tags) set shows
// to everyone; an ad with countries or tags set only shows when they match.
export async function serveAds(query: ServeAdsQuery, viewer: AuthUser | null) {
  if (isAdFree(viewer)) {
    return {
      ads: [],
      adFree: true,
      adsense: { enabled: false, clientId: null },
    };
  }

  const now = new Date();
  const country = query.country ?? viewer?.country ?? null;

  const countryFilter: Prisma.AdWhereInput = country
    ? {
        OR: [
          { targetCountries: { isEmpty: true } },
          { targetCountries: { has: country } },
        ],
      }
    : { targetCountries: { isEmpty: true } };

  const tagFilter: Prisma.AdWhereInput =
    query.tags.length > 0
      ? {
          OR: [
            { targetTags: { isEmpty: true } },
            { targetTags: { hasSome: query.tags } },
          ],
        }
      : { targetTags: { isEmpty: true } };

  const [candidates, adsense] = await Promise.all([
    prisma.ad.findMany({
      where: {
        isActive: true,
        placement: query.placement,
        startsAt: { lte: now },
        endsAt: { gte: now },
        AND: [countryFilter, tagFilter],
      },
      select: {
        id: true,
        title: true,
        imageUrl: true,
        bodyText: true,
        placement: true,
      },
      take: 30,
    }),
    readAdsenseSettings(),
  ]);

  const ads = shuffle(candidates)
    .slice(0, query.limit)
    .map((ad) => ({
      ...ad,
      sponsored: true,
      clickUrl: `/api/ads/${ad.id}/click`,
    }));

  return {
    ads,
    adFree: false,
    adsense: adsense.enabled
      ? { enabled: true, clientId: adsense.clientId }
      : { enabled: false, clientId: null },
  };
}

function liveAdFilter(adId: string): Prisma.AdWhereInput {
  const now = new Date();
  return {
    id: adId,
    isActive: true,
    startsAt: { lte: now },
    endsAt: { gte: now },
  };
}

export async function recordView(adId: string) {
  const result = await prisma.ad.updateMany({
    where: liveAdFilter(adId),
    data: { views: { increment: 1 } },
  });
  if (result.count === 0) throw new AppError("Ad not found", 404);
  return { counted: true };
}

// Counts the click and returns the link to send the reader to. The link is
// always the one saved on the ad, so this can never be used to send people to
// any other address.
export async function recordClickAndGetLink(adId: string): Promise<string> {
  const ad = await prisma.ad.findFirst({
    where: liveAdFilter(adId),
    select: { linkUrl: true },
  });
  if (!ad) throw new AppError("Ad not found", 404);

  await prisma.ad.update({
    where: { id: adId },
    data: { clicks: { increment: 1 } },
  });

  return ad.linkUrl;
}

// Location: backend/services/ad.service.ts
// End of file: ad.service.ts