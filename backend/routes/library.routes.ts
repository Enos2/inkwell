// Location: backend/routes/library.routes.ts
// Purpose: The library addresses under /api/library. All need a logged-in
// reader: GET to list, PUT /:storyId to add a story, DELETE /:storyId to
// remove it.

import { Router } from "express";
import { authenticate, getAuthUser } from "../middleware/auth";
import {
  addToLibrary,
  listLibrary,
  removeFromLibrary,
} from "../services/library.service";
import { pageQuerySchema } from "../validators/social.validator";
import { storyIdParamSchema } from "../validators/story.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const libraryRouter = Router();

libraryRouter.use(authenticate);

libraryRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit } = pageQuerySchema.parse(req.query);
    res.json(await listLibrary(getAuthUser(res), page, limit));
  })
);

libraryRouter.put(
  "/:storyId",
  asyncHandler(async (req, res) => {
    const { storyId } = storyIdParamSchema.parse(req.params);
    res.json(await addToLibrary(getAuthUser(res), storyId));
  })
);

libraryRouter.delete(
  "/:storyId",
  asyncHandler(async (req, res) => {
    const { storyId } = storyIdParamSchema.parse(req.params);
    res.json(await removeFromLibrary(getAuthUser(res), storyId));
  })
);

// Location: backend/routes/library.routes.ts
// End of file: library.routes.ts