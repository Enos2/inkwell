// Project: Inkwell
// Location: backend/routes/discovery.routes.ts
// Purpose: The search and discovery addresses. GET /api/search finds stories,
// writers and tags. Under /api/discover: GET /trending, GET /latest, GET
// /recommended (personal when logged in) and GET /similar/:slug ("more like
// this"). Anyone can use them.

import { Router } from "express";
import {
  getOptionalUser,
  optionalAuthenticate,
} from "../middleware/optionalAuth";
import {
  getLatestUpdates,
  getRecommended,
  getSimilar,
  getTrending,
} from "../services/discovery.service";
import { search } from "../services/search.service";
import {
  listQuerySchema,
  searchQuerySchema,
  similarParamSchema,
  trendingQuerySchema,
} from "../validators/discovery.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const searchRouter = Router();
export const discoverRouter = Router();

searchRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = searchQuerySchema.parse(req.query);
    res.json(await search(query));
  })
);

discoverRouter.get(
  "/trending",
  asyncHandler(async (req, res) => {
    const query = trendingQuerySchema.parse(req.query);
    res.json(await getTrending(query));
  })
);

discoverRouter.get(
  "/latest",
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    res.json(await getLatestUpdates(query));
  })
);

discoverRouter.get(
  "/recommended",
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    res.json(await getRecommended(getOptionalUser(res), query));
  })
);

discoverRouter.get(
  "/similar/:slug",
  asyncHandler(async (req, res) => {
    const { slug } = similarParamSchema.parse(req.params);
    const query = listQuerySchema.parse(req.query);
    res.json(await getSimilar(slug, query));
  })
);

// Location: backend/routes/discovery.routes.ts
// End of file: discovery.routes.ts