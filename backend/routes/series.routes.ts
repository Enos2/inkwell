// Project: Inkwell
// Location: backend/routes/series.routes.ts
// Purpose: The series addresses under /api/series. Anyone can see a series and
// the series of a writer. An approved writer creates, edits and deletes their
// own series and puts their own stories in or out of it. "/mine" and
// "/author/:username" come BEFORE "/:slug" so they are not mistaken for a
// series name.

import { Router } from "express";
import { authenticate, getAuthUser } from "../middleware/auth";
import {
  getOptionalUser,
  optionalAuthenticate,
} from "../middleware/optionalAuth";
import {
  addStoryToSeries,
  createSeries,
  deleteSeries,
  getSeriesBySlug,
  listAuthorSeries,
  listMySeries,
  removeStoryFromSeries,
  updateSeries,
} from "../services/series.service";
import { usernameParamSchema } from "../validators/social.validator";
import {
  addStoryBodySchema,
  createSeriesSchema,
  seriesIdParamSchema,
  seriesSlugParamSchema,
  seriesStoryParamsSchema,
  updateSeriesSchema,
} from "../validators/series.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const seriesRouter = Router();

seriesRouter.get(
  "/mine",
  authenticate,
  asyncHandler(async (_req, res) => {
    res.json(await listMySeries(getAuthUser(res)));
  })
);

seriesRouter.get(
  "/author/:username",
  asyncHandler(async (req, res) => {
    const { username } = usernameParamSchema.parse(req.params);
    res.json(await listAuthorSeries(username));
  })
);

seriesRouter.get(
  "/:slug",
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const { slug } = seriesSlugParamSchema.parse(req.params);
    res.json(await getSeriesBySlug(slug, getOptionalUser(res)));
  })
);

seriesRouter.post(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const input = createSeriesSchema.parse(req.body);
    res.status(201).json(await createSeries(getAuthUser(res), input));
  })
);

seriesRouter.patch(
  "/:seriesId",
  authenticate,
  asyncHandler(async (req, res) => {
    const { seriesId } = seriesIdParamSchema.parse(req.params);
    const input = updateSeriesSchema.parse(req.body);
    res.json(await updateSeries(getAuthUser(res), seriesId, input));
  })
);

seriesRouter.delete(
  "/:seriesId",
  authenticate,
  asyncHandler(async (req, res) => {
    const { seriesId } = seriesIdParamSchema.parse(req.params);
    res.json(await deleteSeries(getAuthUser(res), seriesId));
  })
);

// The body is optional: without a position the story goes to the end.
seriesRouter.put(
  "/:seriesId/stories/:storyId",
  authenticate,
  asyncHandler(async (req, res) => {
    const { seriesId, storyId } = seriesStoryParamsSchema.parse(req.params);
    const { order } = addStoryBodySchema.parse(req.body ?? {});
    res.json(await addStoryToSeries(getAuthUser(res), seriesId, storyId, order));
  })
);

seriesRouter.delete(
  "/:seriesId/stories/:storyId",
  authenticate,
  asyncHandler(async (req, res) => {
    const { seriesId, storyId } = seriesStoryParamsSchema.parse(req.params);
    res.json(await removeStoryFromSeries(getAuthUser(res), seriesId, storyId));
  })
);

// Location: backend/routes/series.routes.ts
// End of file: series.routes.ts