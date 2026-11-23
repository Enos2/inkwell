// Location: backend/routes/story.routes.ts
// Purpose: The story addresses under /api/stories and /api/tags. Anyone can
// browse and read published stories. Writers create and manage their own
// stories and add chapters. The address "/mine" is placed before "/:slug" so it
// is not mistaken for a story name.

import { Router } from "express";
import {
  chapterReadParamsSchema,
  createStorySchema,
  listStoriesQuerySchema,
  paginationQuerySchema,
  slugParamSchema,
  storyIdParamSchema,
  updateStorySchema,
} from "../validators/story.validator";
import { createChapterSchema } from "../validators/chapter.validator";
import {
  createStory,
  deleteStory,
  getStoryBySlug,
  listMyStories,
  listStories,
  listTags,
  publishStory,
  unpublishStory,
  updateStory,
} from "../services/story.service";
import {
  createChapter,
  getChapterForReading,
} from "../services/chapter.service";
import { authenticate, getAuthUser } from "../middleware/auth";
import {
  getOptionalUser,
  optionalAuthenticate,
} from "../middleware/optionalAuth";
import { asyncHandler } from "../utils/asyncHandler";

export const storyRouter = Router();
export const tagRouter = Router();

tagRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ tags: await listTags() });
  })
);

// Browse and search published stories.
storyRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listStoriesQuerySchema.parse(req.query);
    res.json(await listStories(query));
  })
);

// The logged-in writer's own stories, including drafts.
storyRouter.get(
  "/mine",
  authenticate,
  asyncHandler(async (req, res) => {
    const { page, limit } = paginationQuerySchema.parse(req.query);
    res.json(await listMyStories(getAuthUser(res), page, limit));
  })
);

// One story and its list of chapters.
storyRouter.get(
  "/:slug",
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const { slug } = slugParamSchema.parse(req.params);
    res.json(await getStoryBySlug(slug, getOptionalUser(res)));
  })
);

// Read one chapter.
storyRouter.get(
  "/:slug/chapters/:number",
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const { slug, number } = chapterReadParamsSchema.parse(req.params);
    res.json(await getChapterForReading(slug, number, getOptionalUser(res)));
  })
);

storyRouter.post(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const input = createStorySchema.parse(req.body);
    const story = await createStory(getAuthUser(res), input);
    res.status(201).json({ story });
  })
);

storyRouter.patch(
  "/:storyId",
  authenticate,
  asyncHandler(async (req, res) => {
    const { storyId } = storyIdParamSchema.parse(req.params);
    const input = updateStorySchema.parse(req.body);
    const story = await updateStory(getAuthUser(res), storyId, input);
    res.json({ story });
  })
);

storyRouter.delete(
  "/:storyId",
  authenticate,
  asyncHandler(async (req, res) => {
    const { storyId } = storyIdParamSchema.parse(req.params);
    res.json(await deleteStory(getAuthUser(res), storyId));
  })
);

storyRouter.post(
  "/:storyId/publish",
  authenticate,
  asyncHandler(async (req, res) => {
    const { storyId } = storyIdParamSchema.parse(req.params);
    res.json({ story: await publishStory(getAuthUser(res), storyId) });
  })
);

storyRouter.post(
  "/:storyId/unpublish",
  authenticate,
  asyncHandler(async (req, res) => {
    const { storyId } = storyIdParamSchema.parse(req.params);
    res.json({ story: await unpublishStory(getAuthUser(res), storyId) });
  })
);

// Add a new chapter to a story.
storyRouter.post(
  "/:storyId/chapters",
  authenticate,
  asyncHandler(async (req, res) => {
    const { storyId } = storyIdParamSchema.parse(req.params);
    const input = createChapterSchema.parse(req.body);
    const chapter = await createChapter(getAuthUser(res), storyId, input);
    res.status(201).json({ chapter });
  })
);

// Location: backend/routes/story.routes.ts
// End of file: story.routes.ts