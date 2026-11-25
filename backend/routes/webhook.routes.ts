// Location: backend/routes/webhook.routes.ts
// Purpose: The address POST /api/webhooks/paystack, where Paystack tells us a
// payment succeeded. The signature is checked against the exact raw bytes Paystack
// sent (saved by server.ts). Anything with a bad signature is refused with 401.
// A real error returns 500 so Paystack tries again later.

import { Router } from "express";
import type { Request } from "express";
import { handlePaystackEvent } from "../services/fulfillment.service";
import { isValidWebhookSignature } from "../services/paystack.service";
import { asyncHandler } from "../utils/asyncHandler";

export const webhookRouter = Router();

webhookRouter.post(
  "/paystack",
  asyncHandler(async (req, res) => {
    const signature = req.header("x-paystack-signature");
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

    if (!isValidWebhookSignature(rawBody, signature)) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    const result = await handlePaystackEvent(req.body);
    res.status(200).json({ received: true, ...result });
  })
);

// Location: backend/routes/webhook.routes.ts
// End of file: webhook.routes.ts