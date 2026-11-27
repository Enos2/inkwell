// Project: Inkwell
// Location: backend/tests/account.test.ts
// Purpose: Tests for account safety and the new settings: the secret codes used
// in reset and verification links (utils/tokens), login tokens and the token
// version that powers "log out everywhere" (services/token.service), the
// account, reader settings and challenge checks (validators), and the
// MANAGE_CHALLENGES ability.

import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";
import { RANK_DEFAULTS } from "../config/permissions";
import { signToken, verifyToken } from "../services/token.service";
import { createRawToken, hashToken } from "../utils/tokens";
import {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validators/account.validator";
import {
  createChallengeSchema,
  listChallengesQuerySchema,
  updateChallengeSchema,
} from "../validators/challenge.validator";
import {
  DEFAULT_READER_PREFS,
  resolveReaderPrefs,
  updateReaderPrefsSchema,
} from "../validators/preferences.validator";

// These settings must exist BEFORE the token service is loaded, so they are set
// in a "hoisted" block that vitest runs first.
const { SECRET } = vi.hoisted(() => {
  const secret = "x".repeat(40);
  process.env.JWT_SECRET = secret;
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
  process.env.SUPER_ADMIN_EMAIL = "owner@example.com";
  return { SECRET: secret };
});

describe("secret codes", () => {
  it("makes long random codes and stores only a hash", () => {
    const first = createRawToken();
    const second = createRawToken();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(second);

    const hash = hashToken(first);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(first);
    expect(hashToken(first)).toBe(hash);
    expect(hashToken(second)).not.toBe(hash);
  });
});

describe("login tokens and token version", () => {
  it("carries the user and the token version", () => {
    expect(verifyToken(signToken("user1", 3))).toEqual({
      userId: "user1",
      tokenVersion: 3,
    });
  });

  it("treats a token made before versions existed as version 0", () => {
    const oldToken = jwt.sign({}, SECRET, { subject: "user1" });
    expect(verifyToken(oldToken)).toEqual({ userId: "user1", tokenVersion: 0 });
  });

  it("refuses broken, forged and expired tokens", () => {
    expect(verifyToken("not-a-token")).toBeNull();
    expect(verifyToken(jwt.sign({ tv: 0 }, "y".repeat(40), { subject: "user1" }))).toBeNull();
    expect(verifyToken(jwt.sign({ tv: 0 }, SECRET))).toBeNull();
    const expired = jwt.sign({ tv: 0 }, SECRET, { subject: "user1", expiresIn: -10 });
    expect(verifyToken(expired)).toBeNull();
  });
});

describe("account checks", () => {
  it("cleans the email when asking for a reset", () => {
    expect(forgotPasswordSchema.parse({ email: "  Mary@Example.COM " }).email).toBe(
      "mary@example.com"
    );
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
  });

  it("needs a real code and a strong enough new password", () => {
    const code = "a".repeat(64);
    expect(resetPasswordSchema.safeParse({ token: code, password: "longenough1" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token: code, password: "short" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "abc", password: "longenough1" }).success).toBe(false);
  });

  it("checks password changes and account deletion", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "newpassword1" }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "short" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ password: "" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ password: "secret" }).success).toBe(true);
  });
});

describe("reader settings", () => {
  it("gives defaults to someone who saved nothing", () => {
    expect(resolveReaderPrefs(null)).toEqual(DEFAULT_READER_PREFS);
    expect(resolveReaderPrefs(undefined)).toEqual(DEFAULT_READER_PREFS);
  });

  it("combines saved settings with defaults", () => {
    const prefs = resolveReaderPrefs({ theme: "dark", fontSize: 22 });
    expect(prefs.theme).toBe("dark");
    expect(prefs.fontSize).toBe(22);
    expect(prefs.fontFamily).toBe(DEFAULT_READER_PREFS.fontFamily);
  });

  it("falls back to defaults when saved data is damaged", () => {
    expect(resolveReaderPrefs("garbage")).toEqual(DEFAULT_READER_PREFS);
    expect(resolveReaderPrefs({ fontSize: 999 })).toEqual(DEFAULT_READER_PREFS);
  });

  it("accepts only sensible changes", () => {
    expect(updateReaderPrefsSchema.safeParse({}).success).toBe(false);
    expect(updateReaderPrefsSchema.safeParse({ fontSize: 5 }).success).toBe(false);
    expect(updateReaderPrefsSchema.safeParse({ theme: "neon" }).success).toBe(false);
    expect(updateReaderPrefsSchema.safeParse({ theme: "sepia", fontSize: 20 }).success).toBe(true);
    expect(updateReaderPrefsSchema.parse({ language: " EN " }).language).toBe("en");
  });
});

describe("challenge checks", () => {
  const valid = {
    title: "Seven day story",
    prompt: "Write a complete story in seven days.",
    startsAt: "2026-12-01T00:00:00Z",
    endsAt: "2026-12-08T00:00:00Z",
  };

  it("accepts a normal challenge and turns the dates into dates", () => {
    const parsed = createChallengeSchema.parse(valid);
    expect(parsed.startsAt).toBeInstanceOf(Date);
    expect(parsed.endsAt.getTime()).toBeGreaterThan(parsed.startsAt.getTime());
  });

  it("refuses an end before the start, and a tiny title", () => {
    expect(createChallengeSchema.safeParse({ ...valid, endsAt: valid.startsAt }).success).toBe(false);
    expect(createChallengeSchema.safeParse({ ...valid, title: "Hi" }).success).toBe(false);
  });

  it("needs at least one field to edit, and has list defaults", () => {
    expect(updateChallengeSchema.safeParse({}).success).toBe(false);
    expect(updateChallengeSchema.safeParse({ title: "New title here" }).success).toBe(true);
    expect(listChallengesQuerySchema.parse({})).toEqual({ status: "all", page: 1, limit: 12 });
  });
});

describe("MANAGE_CHALLENGES ability", () => {
  it("belongs to editors and senior admins only", () => {
    expect(RANK_DEFAULTS.EDITOR).toContain("MANAGE_CHALLENGES");
    expect(RANK_DEFAULTS.SENIOR_ADMIN).toContain("MANAGE_CHALLENGES");
    expect(RANK_DEFAULTS.SUPER_ADMIN).toContain("MANAGE_CHALLENGES");
    expect(RANK_DEFAULTS.MODERATOR).not.toContain("MANAGE_CHALLENGES");
    expect(RANK_DEFAULTS.AD_MANAGER).not.toContain("MANAGE_CHALLENGES");
    expect(RANK_DEFAULTS.SUPPORT).not.toContain("MANAGE_CHALLENGES");
  });
});

// Location: backend/tests/account.test.ts
// End of file: account.test.ts