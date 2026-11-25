// Location: backend/routes/membership.routes.ts
// Purpose: The membership addresses under /api/memberships. Anyone can see a
// writer's tiers. A logged-in reader sees their own memberships. An approved
// writer creates, edits and switches off their own tiers.

import { Router } from "express";
import { authenticate, getAuthUser } from "../middleware/auth";
import {
  createTier,
  listMyMemberships,
  listMyTiers,
  listWriterTiers,
  updateTier,
} from "../services/catalog.service";
import {
  createTierSchema,
  tierIdParamSchema,
  updateTierSchema,
} from "../validators/payment.validator";
import { usernameParamSchema } from "../validators/social.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const membershipRouter = Router();

membershipRouter.get(
  "/mine",
  authenticate,
  asyncHandler(async (_req, res) => {
    res.json(await listMyMemberships(getAuthUser(res)));
  })
);

membershipRouter.get(
  "/my-tiers",
  authenticate,
  asyncHandler(async (_req, res) => {
    res.json(await listMyTiers(getAuthUser(res)));
  })
);

membershipRouter.get(
  "/writers/:username/tiers",
  asyncHandler(async (req, res) => {
    const { username } = usernameParamSchema.parse(req.params);
    res.json(await listWriterTiers(username));
  })
);

membershipRouter.post(
  "/tiers",
  authenticate,
  asyncHandler(async (req, res) => {
    const input = createTierSchema.parse(req.body);
    res.status(201).json(await createTier(getAuthUser(res), input));
  })
);

membershipRouter.patch(
  "/tiers/:tierId",
  authenticate,
  asyncHandler(async (req, res) => {
    const { tierId } = tierIdParamSchema.parse(req.params);
    const input = updateTierSchema.parse(req.body);
    res.json(await updateTier(getAuthUser(res), tierId, input));
  })
);

// Location: backend/routes/membership.routes.ts
// End of file: membership.routes.ts