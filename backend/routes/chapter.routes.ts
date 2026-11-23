// Location: backend/routes/chapter.routes.ts
// Purpose: The addresses for changing or deleting one chapter under
// /api/chapters/:chapterId. Only the author of the story can use them.

import { Router } from "express";
import {
  chapterIdParamSchema,
  updateChapterSchema,
} from "../validators/chapter.validator";
import { deleteChapter, updateChapter } from "../services/chapter.service";
import { authenticate, getAuthUser } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const chapterRouter = Router();

chapterRouter.patch(
  "/:chapterId",
  authenticate,
  asyncHandler(async (req, res) => {
    const { chapterId } = chapterIdParamSchema.parse(req.params);
    const input = updateChapterSchema.parse(req.body);
    const chapter = await updateChapter(getAuthUser(res), chapterId, input);
    res.json({ chapter });
  })
);

chapterRouter.delete(
  "/:chapterId",
  authenticate,
  asyncHandler(async (req, res) => {
    const { chapterId } = chapterIdParamSchema.parse(req.params);
    res.json(await deleteChapter(getAuthUser(res), chapterId));
  })
);

// Location: backend/routes/chapter.routes.ts
// End of file: chapter.routes.ts