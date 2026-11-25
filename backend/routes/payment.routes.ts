// Location: backend/routes/payment.routes.ts
// Purpose: The payment addresses under /api/payments. Anyone can read
// /config. A logged-in user can start a tip, gift, membership or Premium
// checkout, see their payments, and check a payment with GET /verify/:reference
// when they come back from the payment page. In sandbox mode (local testing
// only) POST /sandbox/:reference/complete pretends the payment succeeded.

import { Router } from "express";
import { authenticate, getAuthUser } from "../middleware/auth";
import {
  getPaymentConfig,
  listMyPayments,
  startGiftCheckout,
  startMembershipCheckout,
  startPremiumCheckout,
  startTipCheckout,
} from "../services/checkout.service";
import {
  completeSandboxPayment,
  confirmMyPayment,
} from "../services/fulfillment.service";
import {
  giftCheckoutSchema,
  membershipCheckoutSchema,
  premiumCheckoutSchema,
  referenceParamSchema,
  tipCheckoutSchema,
} from "../validators/payment.validator";
import { pageQuerySchema } from "../validators/social.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const paymentRouter = Router();

paymentRouter.get(
  "/config",
  asyncHandler(async (_req, res) => {
    res.json(await getPaymentConfig());
  })
);

paymentRouter.get(
  "/mine",
  authenticate,
  asyncHandler(async (req, res) => {
    const { page, limit } = pageQuerySchema.parse(req.query);
    res.json(await listMyPayments(getAuthUser(res), page, limit));
  })
);

paymentRouter.get(
  "/verify/:reference",
  authenticate,
  asyncHandler(async (req, res) => {
    const { reference } = referenceParamSchema.parse(req.params);
    res.json(await confirmMyPayment(getAuthUser(res), reference));
  })
);

paymentRouter.post(
  "/tip",
  authenticate,
  asyncHandler(async (req, res) => {
    const input = tipCheckoutSchema.parse(req.body);
    res.status(201).json(await startTipCheckout(getAuthUser(res), input));
  })
);

paymentRouter.post(
  "/gift",
  authenticate,
  asyncHandler(async (req, res) => {
    const input = giftCheckoutSchema.parse(req.body);
    res.status(201).json(await startGiftCheckout(getAuthUser(res), input));
  })
);

paymentRouter.post(
  "/membership",
  authenticate,
  asyncHandler(async (req, res) => {
    const input = membershipCheckoutSchema.parse(req.body);
    res
      .status(201)
      .json(await startMembershipCheckout(getAuthUser(res), input));
  })
);

paymentRouter.post(
  "/premium",
  authenticate,
  asyncHandler(async (req, res) => {
    const input = premiumCheckoutSchema.parse(req.body);
    res.status(201).json(await startPremiumCheckout(getAuthUser(res), input));
  })
);

paymentRouter.post(
  "/sandbox/:reference/complete",
  authenticate,
  asyncHandler(async (req, res) => {
    const { reference } = referenceParamSchema.parse(req.params);
    res.json(await completeSandboxPayment(getAuthUser(res), reference));
  })
);

// Location: backend/routes/payment.routes.ts
// End of file: payment.routes.ts