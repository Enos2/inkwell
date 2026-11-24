// Location: backend/routes/adminAds.routes.ts
// Purpose: The admin ad addresses under /api/admin/ads. Managing ads needs the
// MANAGE_ADS ability and the AdSense switch needs TOGGLE_ADSENSE. The Super
// Admin can switch either ability off for one specific person. The "/adsense"
// addresses are placed BEFORE "/:adId" so "adsense" is not mistaken for an ad id.

import { Router } from "express";
import {
  authenticate,
  getAuthUser,
  requireAdmin,
  requirePermission,
} from "../middleware/auth";
import {
  createAd,
  deleteAd,
  getAd,
  getAdsenseSettings,
  listAds,
  setAdsenseSettings,
  updateAd,
} from "../services/ad.service";
import {
  adIdParamSchema,
  adminListAdsQuerySchema,
  adsenseSettingsSchema,
  createAdSchema,
  updateAdSchema,
} from "../validators/ad.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const adminAdsRouter = Router();

adminAdsRouter.use(authenticate, requireAdmin);

adminAdsRouter.get(
  "/adsense",
  requirePermission("TOGGLE_ADSENSE"),
  asyncHandler(async (_req, res) => {
    res.json(await getAdsenseSettings());
  })
);

adminAdsRouter.put(
  "/adsense",
  requirePermission("TOGGLE_ADSENSE"),
  asyncHandler(async (req, res) => {
    const input = adsenseSettingsSchema.parse(req.body);
    res.json(await setAdsenseSettings(getAuthUser(res), input));
  })
);

adminAdsRouter.get(
  "/",
  requirePermission("MANAGE_ADS"),
  asyncHandler(async (req, res) => {
    const query = adminListAdsQuerySchema.parse(req.query);
    res.json(await listAds(query));
  })
);

adminAdsRouter.post(
  "/",
  requirePermission("MANAGE_ADS"),
  asyncHandler(async (req, res) => {
    const input = createAdSchema.parse(req.body);
    res.status(201).json(await createAd(getAuthUser(res), input));
  })
);

adminAdsRouter.get(
  "/:adId",
  requirePermission("MANAGE_ADS"),
  asyncHandler(async (req, res) => {
    const { adId } = adIdParamSchema.parse(req.params);
    res.json(await getAd(adId));
  })
);

adminAdsRouter.patch(
  "/:adId",
  requirePermission("MANAGE_ADS"),
  asyncHandler(async (req, res) => {
    const { adId } = adIdParamSchema.parse(req.params);
    const input = updateAdSchema.parse(req.body);
    res.json(await updateAd(getAuthUser(res), adId, input));
  })
);

adminAdsRouter.delete(
  "/:adId",
  requirePermission("MANAGE_ADS"),
  asyncHandler(async (req, res) => {
    const { adId } = adIdParamSchema.parse(req.params);
    res.json(await deleteAd(getAuthUser(res), adId));
  })
);

// Location: backend/routes/adminAds.routes.ts
// End of file: adminAds.routes.ts