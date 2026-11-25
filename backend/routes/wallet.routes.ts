// Location: backend/routes/wallet.routes.ts
// Purpose: The writer wallet addresses under /api/wallet. All need a logged-in
// user: GET / shows the balance, GET /ledger the history, GET /payouts your
// payout requests, and POST /payouts asks for a payout.

import { Router } from "express";
import { authenticate, getAuthUser } from "../middleware/auth";
import {
  getWallet,
  listLedger,
  listMyPayouts,
  requestPayout,
} from "../services/wallet.service";
import { payoutRequestSchema } from "../validators/payment.validator";
import { pageQuerySchema } from "../validators/social.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const walletRouter = Router();

walletRouter.use(authenticate);

walletRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await getWallet(getAuthUser(res)));
  })
);

walletRouter.get(
  "/ledger",
  asyncHandler(async (req, res) => {
    const { page, limit } = pageQuerySchema.parse(req.query);
    res.json(await listLedger(getAuthUser(res), page, limit));
  })
);

walletRouter.get(
  "/payouts",
  asyncHandler(async (req, res) => {
    const { page, limit } = pageQuerySchema.parse(req.query);
    res.json(await listMyPayouts(getAuthUser(res), page, limit));
  })
);

walletRouter.post(
  "/payouts",
  asyncHandler(async (req, res) => {
    const input = payoutRequestSchema.parse(req.body);
    res.status(201).json(await requestPayout(getAuthUser(res), input));
  })
);

// Location: backend/routes/wallet.routes.ts
// End of file: wallet.routes.ts