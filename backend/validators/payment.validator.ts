// Location: backend/validators/payment.validator.ts
// Purpose: Checks everything sent to the money addresses: tip, gift, membership
// and Premium checkouts, membership tiers, gift types, payout requests and
// decisions, the payment settings, and the list filters. Never trust what
// users send.

import { z } from "zod";
import { CHARGE_CURRENCIES } from "../utils/money";

export const PAYOUT_METHODS = [
  "MPESA",
  "BANK_TRANSFER",
  "PAYPAL",
  "OTHER",
] as const;

const idField = z.string().min(1).max(40);
const currencyField = z.enum(CHARGE_CURRENCIES).default("USD");
const usernameField = z.string().trim().toLowerCase().min(1).max(20);

// ---------------------------------------------------------------- CHECKOUT

// amountCents is in the smallest unit of the chosen currency (cents).
export const tipCheckoutSchema = z.object({
  username: usernameField,
  amountCents: z.number().int().min(1).max(100_000_000),
  currency: currencyField,
  message: z.string().trim().max(300).optional(),
});

export const giftCheckoutSchema = z.object({
  username: usernameField,
  giftTypeId: idField,
  quantity: z.number().int().min(1).max(20).default(1),
  storyId: idField.optional(),
  currency: currencyField,
});

export const membershipCheckoutSchema = z.object({
  tierId: idField,
  currency: currencyField,
});

export const premiumCheckoutSchema = z.object({
  currency: currencyField,
});

export const referenceParamSchema = z.object({
  reference: z
    .string()
    .min(5)
    .max(80)
    .regex(/^[A-Za-z0-9._=-]+$/, "Invalid payment reference"),
});

// ---------------------------------------------------------------- TIERS

export const createTierSchema = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(500).optional(),
  priceCents: z.number().int().min(100).max(10_000),
});

// No defaults on purpose: only the fields that are sent get changed.
export const updateTierSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    priceCents: z.number().int().min(100).max(10_000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Send at least one field to change"
  );

export const tierIdParamSchema = z.object({ tierId: idField });

// ---------------------------------------------------------------- GIFTS

export const createGiftTypeSchema = z.object({
  name: z.string().trim().min(1).max(30),
  emoji: z.string().trim().min(1).max(8),
  priceCents: z.number().int().min(50).max(50_000),
});

export const updateGiftTypeSchema = z
  .object({
    name: z.string().trim().min(1).max(30).optional(),
    emoji: z.string().trim().min(1).max(8).optional(),
    priceCents: z.number().int().min(50).max(50_000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Send at least one field to change"
  );

export const giftTypeIdParamSchema = z.object({ giftTypeId: idField });

// ---------------------------------------------------------------- PAYOUTS

export const payoutRequestSchema = z
  .object({
    amountCents: z.number().int().min(1).max(100_000_000),
    method: z.enum(PAYOUT_METHODS),
    details: z.string().trim().min(5).max(200),
  })
  .refine(
    (value) =>
      value.method !== "MPESA" ||
      /^\+?\d{9,15}$/.test(value.details.replace(/\s/g, "")),
    {
      message:
        "For M-Pesa, enter the phone number, for example +254712345678",
      path: ["details"],
    }
  );

export const handlePayoutSchema = z
  .object({
    decision: z.enum(["PAID", "REJECTED"]),
    note: z.string().trim().max(300).optional(),
  })
  .refine(
    (value) => value.decision !== "REJECTED" || (value.note ?? "").length >= 3,
    {
      message: "Please give a reason when rejecting a payout",
      path: ["note"],
    }
  );

export const payoutIdParamSchema = z.object({ payoutId: idField });

export const adminPayoutsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["PENDING", "PAID", "REJECTED", "all"]).default("PENDING"),
});

// ---------------------------------------------------------------- ADMIN

export const adminPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z
    .enum(["PENDING", "SUCCESS", "FAILED", "REFUNDED", "all"])
    .default("all"),
});

export const paymentSettingsSchema = z
  .object({
    kesPerUsd: z.number().min(1).max(100_000).optional(),
    premiumPriceCents: z.number().int().min(100).max(10_000).optional(),
    platformFeePercent: z.number().min(0).max(50).optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Send at least one setting to change"
  );

export type TipCheckoutInput = z.infer<typeof tipCheckoutSchema>;
export type GiftCheckoutInput = z.infer<typeof giftCheckoutSchema>;
export type MembershipCheckoutInput = z.infer<typeof membershipCheckoutSchema>;
export type PremiumCheckoutInput = z.infer<typeof premiumCheckoutSchema>;
export type CreateTierInput = z.infer<typeof createTierSchema>;
export type UpdateTierInput = z.infer<typeof updateTierSchema>;
export type CreateGiftTypeInput = z.infer<typeof createGiftTypeSchema>;
export type UpdateGiftTypeInput = z.infer<typeof updateGiftTypeSchema>;
export type PayoutRequestInput = z.infer<typeof payoutRequestSchema>;
export type HandlePayoutInput = z.infer<typeof handlePayoutSchema>;
export type AdminPayoutsQuery = z.infer<typeof adminPayoutsQuerySchema>;
export type AdminPaymentsQuery = z.infer<typeof adminPaymentsQuerySchema>;
export type PaymentSettingsInput = z.infer<typeof paymentSettingsSchema>;

// Location: backend/validators/payment.validator.ts
// End of file: payment.validator.ts