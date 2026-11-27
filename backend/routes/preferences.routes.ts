// Project: Inkwell
// Location: backend/routes/preferences.routes.ts
// Purpose: The reader settings addresses under /api/preferences. GET /reader
// gives your saved settings (with defaults filled in) and PUT /reader changes
// the ones you send. Both need a logged-in user.

import { Router } from "express";
import { authenticate, getAuthUser } from "../middleware/auth";
import {
  getReaderPrefs,
  updateReaderPrefs,
} from "../services/preferences.service";
import { updateReaderPrefsSchema } from "../validators/preferences.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const preferencesRouter = Router();

preferencesRouter.use(authenticate);

preferencesRouter.get(
  "/reader",
  asyncHandler(async (_req, res) => {
    res.json(await getReaderPrefs(getAuthUser(res)));
  })
);

preferencesRouter.put(
  "/reader",
  asyncHandler(async (req, res) => {
    const input = updateReaderPrefsSchema.parse(req.body);
    res.json(await updateReaderPrefs(getAuthUser(res), input));
  })
);

// Location: backend/routes/preferences.routes.ts
// End of file: preferences.routes.ts