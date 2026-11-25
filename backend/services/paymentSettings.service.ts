// Location: backend/services/paymentSettings.service.ts
// Purpose: The three payment settings the Super Admin controls: the KES per
// USD exchange rate (no default: KES payments stay off until it is set), the
// Premium price, and the platform fee percent. They are stored in the
// SiteSetting table, so they can change without restarting the server. Every
// change is written to the activity log.

import { prisma } from "../config/prisma";
import type { AuthUser } from "../utils/selects";
import type { PaymentSettingsInput } from "../validators/payment.validator";

const KEY_KES_RATE = "payments_kes_per_usd";
const KEY_PREMIUM_PRICE = "payments_premium_price_cents";
const KEY_FEE_PERCENT = "payments_platform_fee_percent";

export const DEFAULT_PREMIUM_PRICE_CENTS = 300;
export const DEFAULT_PLATFORM_FEE_PERCENT = 10;

export type PaymentSettings = {
  kesPerUsd: number | null;
  premiumPriceCents: number;
  platformFeePercent: number;
};

function readNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: [KEY_KES_RATE, KEY_PREMIUM_PRICE, KEY_FEE_PERCENT] } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.value] as const));

  const rate = readNumber(byKey.get(KEY_KES_RATE));
  const premium = readNumber(byKey.get(KEY_PREMIUM_PRICE));
  const fee = readNumber(byKey.get(KEY_FEE_PERCENT));

  return {
    kesPerUsd: rate !== null && rate > 0 ? rate : null,
    premiumPriceCents:
      premium !== null && premium > 0
        ? Math.round(premium)
        : DEFAULT_PREMIUM_PRICE_CENTS,
    platformFeePercent:
      fee !== null && fee >= 0 && fee <= 50
        ? fee
        : DEFAULT_PLATFORM_FEE_PERCENT,
  };
}

export async function updatePaymentSettings(
  actor: AuthUser,
  input: PaymentSettingsInput
) {
  const entries: [string, string][] = [];
  const changed: Record<string, number> = {};

  if (input.kesPerUsd !== undefined) {
    entries.push([KEY_KES_RATE, String(input.kesPerUsd)]);
    changed.kesPerUsd = input.kesPerUsd;
  }
  if (input.premiumPriceCents !== undefined) {
    entries.push([KEY_PREMIUM_PRICE, String(input.premiumPriceCents)]);
    changed.premiumPriceCents = input.premiumPriceCents;
  }
  if (input.platformFeePercent !== undefined) {
    entries.push([KEY_FEE_PERCENT, String(input.platformFeePercent)]);
    changed.platformFeePercent = input.platformFeePercent;
  }

  await prisma.$transaction([
    ...entries.map(([key, value]) =>
      prisma.siteSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      })
    ),
    prisma.adminActionLog.create({
      data: {
        actorId: actor.id,
        action: "PAYMENT_SETTINGS_CHANGED",
        details: changed,
      },
    }),
  ]);

  return { settings: await getPaymentSettings() };
}

// Location: backend/services/paymentSettings.service.ts
// End of file: paymentSettings.service.ts