// Location: backend/routes/writer.routes.ts
// Purpose: The address POST /api/writer/apply. A logged-in user asks to become
// a writer. An admin then approves or rejects the application.

import { Router } from "express";
import { authenticate, getAuthUser } from "../middleware/auth";
import { applyToBeWriter } from "../services/writer.service";
import { asyncHandler } from "../utils/asyncHandler";

export const writerRouter = Router();

writerRouter.post(
  "/apply",
  authenticate,
  asyncHandler(async (_req, res) => {
    res.status(201).json(await applyToBeWriter(getAuthUser(res)));
  })
);

// Location: backend/routes/writer.routes.ts
// End of file: writer.routes.ts