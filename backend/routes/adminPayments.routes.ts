// Location: backend/routes/adminPayments.routes.ts
// Purpose: The money admin addresses under /api/admin/payments. Only the Super
// Admin can use ANY of them, because they move real money: the summary, the
// payments list, the settings (exchange rate, Premium price, platform fee), the
// gift types, and the payout queue.

import { Router } from "express";
import {
  authenticate,
  getAuthUser,
  requireAdmin,
  requireSuperAdmin,
} from "../middleware/auth";
import {
  createGiftType,
  listAllGiftTypes,
  seedDefaultGiftTypes,
  updateGiftType,
} from "../services/catalog.service";
import {
  getPaymentsSummary,
  handlePayout,
  listPayments,
  listPayoutRequests,
} from "../services/paymentAdmin.service";
import {
  getPaymentSettings,
  updatePaymentSettings,
} from "../services/paymentSettings.service";
import {
  adminPaymentsQuerySchema,
  adminPayoutsQuerySchema,
  createGiftTypeSchema,
  giftTypeIdParamSchema,
  handlePayoutSchema,
  payoutIdParamSchema,
  paymentSettingsSchema,
  updateGiftTypeSchema,
} from "../validators/payment.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const adminPaymentsRouter = Router();

adminPaymentsRouter.use(authenticate, requireAdmin, requireSuperAdmin);

adminPaymentsRouter.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    res.json(await getPaymentsSummary());
  })
);

adminPaymentsRouter.get(
  "/payments",
  asyncHandler(async (req, res) => {
    const query = adminPaymentsQuerySchema.parse(req.query);
    res.json(await listPayments(query));
  })
);

adminPaymentsRouter.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    res.json({ settings: await getPaymentSettings() });
  })
);

adminPaymentsRouter.put(
  "/settings",
  asyncHandler(async (req, res) => {
    const input = paymentSettingsSchema.parse(req.body);
    res.json(await updatePaymentSettings(getAuthUser(res), input));
  })
);

adminPaymentsRouter.get(
  "/gift-types",
  asyncHandler(async (_req, res) => {
    res.json(await listAllGiftTypes());
  })
);

adminPaymentsRouter.post(
  "/gift-types/seed-defaults",
  asyncHandler(async (_req, res) => {
    res.status(201).json(await seedDefaultGiftTypes(getAuthUser(res)));
  })
);

adminPaymentsRouter.post(
  "/gift-types",
  asyncHandler(async (req, res) => {
    const input = createGiftTypeSchema.parse(req.body);
    res.status(201).json(await createGiftType(getAuthUser(res), input));
  })
);

adminPaymentsRouter.patch(
  "/gift-types/:giftTypeId",
  asyncHandler(async (req, res) => {
    const { giftTypeId } = giftTypeIdParamSchema.parse(req.params);
    const input = updateGiftTypeSchema.parse(req.body);
    res.json(await updateGiftType(getAuthUser(res), giftTypeId, input));
  })
);

adminPaymentsRouter.get(
  "/payouts",
  asyncHandler(async (req, res) => {
    const query = adminPayoutsQuerySchema.parse(req.query);
    res.json(await listPayoutRequests(query));
  })
);

adminPaymentsRouter.post(
  "/payouts/:payoutId/handle",
  asyncHandler(async (req, res) => {
    const { payoutId } = payoutIdParamSchema.parse(req.params);
    const input = handlePayoutSchema.parse(req.body);
    res.json(await handlePayout(getAuthUser(res), payoutId, input));
  })
);

// Location: backend/routes/adminPayments.routes.ts
// End of file: adminPayments.routes.ts