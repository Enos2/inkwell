// Location: backend/services/paystack.service.ts
// Purpose: The ONLY file that talks to Paystack. It starts a hosted checkout
// (Paystack's own payment page, so card and M-Pesa details never reach our
// server), checks a payment with Paystack, and verifies that a webhook really
// came from Paystack. To use another payment provider later, only this file and
// the webhook route need a twin.

import { createHmac, timingSafeEqual } from "crypto";
import { env } from "../config/env";
import { AppError } from "../utils/errors";

const BASE_URL = "https://api.paystack.co";

type PaystackReply<T> = { status: boolean; message: string; data: T };

// Stops early (before any database row is made) if payments cannot work yet.
export function assertPaymentsConfigured(): void {
  if (env.PAYMENTS_SANDBOX) return;
  if (!env.PAYSTACK_SECRET_KEY) {
    throw new AppError(
      "Payments are not set up yet. Please try again later",
      503
    );
  }
}

async function paystackRequest<T>(
  path: string,
  method: "GET" | "POST",
  body?: unknown
): Promise<T> {
  const key = env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new AppError(
      "Payments are not set up yet. Please try again later",
      503
    );
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error("Paystack request failed", error);
    throw new AppError(
      "The payment service is not responding. Please try again",
      502
    );
  }

  let reply: PaystackReply<T> | null = null;
  try {
    reply = (await response.json()) as PaystackReply<T>;
  } catch {
    reply = null;
  }

  if (!response.ok || !reply || reply.status !== true) {
    console.error("Paystack error", response.status, reply?.message);
    throw new AppError(
      "The payment service could not complete this request",
      502
    );
  }

  return reply.data;
}

export type InitializedTransaction = {
  authorizationUrl: string;
  reference: string;
};

// Starts a hosted checkout. amountCents is in the smallest unit of "currency".
export async function initializeTransaction(input: {
  email: string;
  amountCents: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}): Promise<InitializedTransaction> {
  const data = await paystackRequest<{
    authorization_url: string;
    reference: string;
  }>("/transaction/initialize", "POST", {
    email: input.email,
    amount: input.amountCents,
    currency: input.currency,
    reference: input.reference,
    callback_url: input.callbackUrl,
    metadata: input.metadata,
  });

  return {
    authorizationUrl: data.authorization_url,
    reference: data.reference,
  };
}

export type VerifiedTransaction = {
  status: string;
  amount: number;
  currency: string;
  reference: string;
};

export async function verifyTransaction(
  reference: string
): Promise<VerifiedTransaction> {
  return paystackRequest<VerifiedTransaction>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    "GET"
  );
}

// Paystack signs every webhook with your secret key. Anything without a valid
// signature is rejected, so nobody can fake a "payment succeeded" message.
export function isValidWebhookSignature(
  rawBody: Buffer | undefined,
  signature: string | undefined
): boolean {
  if (!env.PAYSTACK_SECRET_KEY || !rawBody || !signature) return false;

  const expected = createHmac("sha512", env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");

  const expectedBytes = Buffer.from(expected, "utf8");
  const givenBytes = Buffer.from(signature, "utf8");
  return (
    expectedBytes.length === givenBytes.length &&
    timingSafeEqual(expectedBytes, givenBytes)
  );
}

// Location: backend/services/paystack.service.ts
// End of file: paystack.service.ts