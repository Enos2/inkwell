// Location: backend/routes/ad.routes.ts
// Purpose: The public ad addresses under /api/ads, used by the website and a
// future mobile app. GET / returns the ads to show in one spot, POST
// /:adId/view counts a view, and GET /:adId/click counts a click and sends the
// reader to the ad's link. Logged-in readers are recognised so premium readers
// see no ads.

import { Router } from "express";
import {
  getOptionalUser,
  optionalAuthenticate,
} from "../middleware/optionalAuth";
import {
  recordClickAndGetLink,
  recordView,
  serveAds,
} from "../services/ad.service";
import {
  adIdParamSchema,
  serveAdsQuerySchema,
} from "../validators/ad.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const adRouter = Router();

adRouter.get(
  "/",
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const query = serveAdsQuerySchema.parse(req.query);
    res.json(await serveAds(query, getOptionalUser(res)));
  })
);

adRouter.post(
  "/:adId/view",
  asyncHandler(async (req, res) => {
    const { adId } = adIdParamSchema.parse(req.params);
    res.json(await recordView(adId));
  })
);

adRouter.get(
  "/:adId/click",
  asyncHandler(async (req, res) => {
    const { adId } = adIdParamSchema.parse(req.params);
    const link = await recordClickAndGetLink(adId);
    res.redirect(302, link);
  })
);

// Location: backend/routes/ad.routes.ts
// End of file: ad.routes.ts