// Location: backend/utils/money.ts
// Purpose: Small money helpers and rules used across the payment code. Every
// price on Inkwell is in US dollar cents. Readers can pay in USD or in Kenyan
// shillings (KES), which are converted with an exchange rate the Super Admin
// sets. Also holds the limits (smallest tip, smallest payout) and the length of
// a membership or Premium pass.

import { AppError } from "./errors";

export const CHARGE_CURRENCIES = ["USD", "KES"] as const;
export type ChargeCurrency = (typeof CHARGE_CURRENCIES)[number];

export const MIN_TIP_USD_CENTS = 100;
export const MAX_TIP_USD_CENTS = 50_000;
export const MIN_PAYOUT_USD_CENTS = 1_000;
export const MEMBERSHIP_DAYS = 30;
export const PREMIUM_DAYS = 30;

function requireRate(kesPerUsd: number | null): number {
  if (!kesPerUsd) {
    throw new AppError(
      "Payments in Kenyan shillings are not available yet. Please pay in US dollars",
      503
    );
  }
  return kesPerUsd;
}

// Turns a US dollar price into the amount to charge in the chosen currency.
export function usdToCharge(
  usdCents: number,
  currency: ChargeCurrency,
  kesPerUsd: number | null
): number {
  if (currency === "USD") return usdCents;
  return Math.ceil(usdCents * requireRate(kesPerUsd));
}

// Turns an amount in the chosen currency into US dollar cents.
export function chargeToUsd(
  amountCents: number,
  currency: ChargeCurrency,
  kesPerUsd: number | null
): number {
  if (currency === "USD") return amountCents;
  return Math.floor(amountCents / requireRate(kesPerUsd));
}

// Splits a payment into the platform fee and the writer's share.
export function splitAmount(usdCents: number, feePercent: number) {
  const feeCents = Math.round((usdCents * feePercent) / 100);
  return { feeCents, shareCents: usdCents - feeCents };
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

// Location: backend/utils/money.ts
// End of file: money.ts