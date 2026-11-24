// Location: backend/routes/profile.routes.ts
// Purpose: The profile addresses under /api/users. Anyone can view a public
// profile. A logged-in user can see and edit their own profile and replace
// their social links. The "/me" addresses are placed BEFORE "/:username" so
// "me" is not mistaken for a username.

import { Router } from "express";
import { authenticate, getAuthUser } from "../middleware/auth";
import {
  getOptionalUser,
  optionalAuthenticate,
} from "../middleware/optionalAuth";
import {
  getProfile,
  setSocialLinks,
  updateProfile,
} from "../services/profile.service";
import {
  setSocialLinksSchema,
  updateProfileSchema,
} from "../validators/profile.validator";
import { usernameParamSchema } from "../validators/social.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const profileRouter = Router();

profileRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (_req, res) => {
    const me = getAuthUser(res);
    res.json(await getProfile(me.username, me));
  })
);

profileRouter.patch(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const input = updateProfileSchema.parse(req.body);
    res.json(await updateProfile(getAuthUser(res), input));
  })
);

profileRouter.put(
  "/me/social-links",
  authenticate,
  asyncHandler(async (req, res) => {
    const input = setSocialLinksSchema.parse(req.body);
    res.json(await setSocialLinks(getAuthUser(res), input));
  })
);

profileRouter.get(
  "/:username",
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const { username } = usernameParamSchema.parse(req.params);
    res.json(await getProfile(username, getOptionalUser(res)));
  })
);

// Location: backend/routes/profile.routes.ts
// End of file: profile.routes.ts