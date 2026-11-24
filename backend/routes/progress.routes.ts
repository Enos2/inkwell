// Location: backend/routes/progress.routes.ts
// Purpose: The reading progress addresses under /api/progress. PUT saves where
// the reader stopped, GET lists "continue reading", and GET /:storyId gives
// the saved spot for one story.

import { Router } from "express";
import { authenticate, getAuthUser } from "../middleware/auth";
import {
  getProgressForStory,
  listContinueReading,
  saveProgress,
} from "../services/progress.service";
import {
  continueReadingQuerySchema,
  saveProgressSchema,
} from "../validators/social.validator";
import { storyIdParamSchema } from "../validators/story.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const progressRouter = Router();

progressRouter.use(authenticate);

progressRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const input = saveProgressSchema.parse(req.body);
    res.json(await saveProgress(getAuthUser(res), input));
  })
);

progressRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { limit } = continueReadingQuerySchema.parse(req.query);
    res.json(await listContinueReading(getAuthUser(res), limit));
  })
);

progressRouter.get(
  "/:storyId",
  asyncHandler(async (req, res) => {
    const { storyId } = storyIdParamSchema.parse(req.params);
    res.json(await getProgressForStory(getAuthUser(res), storyId));
  })
);

// Location: backend/routes/progress.routes.ts
// End of file: progress.routes.ts