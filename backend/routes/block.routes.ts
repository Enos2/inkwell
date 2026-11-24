// Location: backend/routes/block.routes.ts
// Purpose: The blocking addresses under /api/blocks. All need a logged-in
// user: GET lists the people you blocked, PUT /:userId blocks someone, and
// DELETE /:userId unblocks them.

import { Router } from "express";
import { authenticate, getAuthUser } from "../middleware/auth";
import {
  blockUser,
  listBlocks,
  unblockUser,
} from "../services/block.service";
import { userIdParamSchema } from "../validators/admin.validator";
import { pageQuerySchema } from "../validators/social.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const blockRouter = Router();

blockRouter.use(authenticate);

blockRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit } = pageQuerySchema.parse(req.query);
    res.json(await listBlocks(getAuthUser(res), page, limit));
  })
);

blockRouter.put(
  "/:userId",
  asyncHandler(async (req, res) => {
    const { userId } = userIdParamSchema.parse(req.params);
    res.json(await blockUser(getAuthUser(res), userId));
  })
);

blockRouter.delete(
  "/:userId",
  asyncHandler(async (req, res) => {
    const { userId } = userIdParamSchema.parse(req.params);
    res.json(await unblockUser(getAuthUser(res), userId));
  })
);

// Location: backend/routes/block.routes.ts
// End of file: block.routes.ts