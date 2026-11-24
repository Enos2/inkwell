// Location: backend/routes/featured.routes.ts
// Purpose: The public address GET /api/featured. It returns the stories that
// editors and admins have featured, for the home page. Anyone can use it.

import { Router } from "express";
import { listFeatured } from "../services/moderation.service";
import { featuredQuerySchema } from "../validators/moderation.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const featuredRouter = Router();

featuredRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = featuredQuerySchema.parse(req.query);
    res.json(await listFeatured(query));
  })
);

// Location: backend/routes/featured.routes.ts
// End of file: featured.routes.ts