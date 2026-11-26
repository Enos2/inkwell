// Project: Inkwell
// Location: backend/tests/helpers.test.ts
// Purpose: Tests for helpers written in earlier batches: web-address text
// (slug), YouTube and Vimeo link checking (video), money maths (money) and the
// admin rank list (permissions).

import { describe, expect, it } from "vitest";
import { ASSIGNABLE_RANKS, PERMISSION_LIST, RANK_DEFAULTS } from "../config/permissions";
import { AppError } from "../utils/errors";
import { addDays, chargeToUsd, formatUsd, splitAmount, usdToCharge } from "../utils/money";
import { normalizeTags, slugify } from "../utils/slug";
import { parseVideoUrl } from "../utils/video";

describe("slugify and tags", () => {
  it("makes web-friendly text", () => {
    expect(slugify("The Lion's Return!")).toBe("the-lion-s-return");
    expect(slugify("  Café au lait ")).toBe("cafe-au-lait");
    expect(slugify("!!!")).toBe("");
  });

  it("cuts long titles without a trailing dash", () => {
    const slug = slugify("word ".repeat(40));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("cleans and de-duplicates tags", () => {
    expect(normalizeTags(["Romance", "romance ", " SCI-FI", "!!"])).toEqual([
      { name: "romance", slug: "romance" },
      { name: "sci-fi", slug: "sci-fi" },
    ]);
  });
});

describe("parseVideoUrl", () => {
  it("accepts YouTube links in several shapes", () => {
    expect(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.embedUrl).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
    );
    expect(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
    expect(parseVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.provider).toBe("youtube");
  });

  it("accepts Vimeo links", () => {
    expect(parseVideoUrl("https://vimeo.com/123456789")?.embedUrl).toBe(
      "https://player.vimeo.com/video/123456789"
    );
  });

  it("refuses everything else", () => {
    expect(parseVideoUrl("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseVideoUrl("https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseVideoUrl("https://example.com/video.mp4")).toBeNull();
    expect(parseVideoUrl("not a link")).toBeNull();
    expect(parseVideoUrl("https://www.youtube.com/watch?v=short")).toBeNull();
  });
});

describe("money", () => {
  it("keeps US dollars as they are and converts to shillings", () => {
    expect(usdToCharge(500, "USD", null)).toBe(500);
    expect(usdToCharge(500, "KES", 130)).toBe(65_000);
    expect(chargeToUsd(65_000, "KES", 130)).toBe(500);
    expect(chargeToUsd(65_129, "KES", 130)).toBe(500);
  });

  it("refuses shillings until a rate is set", () => {
    expect(() => usdToCharge(500, "KES", null)).toThrow(AppError);
    expect(() => chargeToUsd(500, "KES", null)).toThrow(AppError);
  });

  it("splits a payment between platform and writer without losing a cent", () => {
    expect(splitAmount(1000, 10)).toEqual({ feeCents: 100, shareCents: 900 });
    const odd = splitAmount(333, 10);
    expect(odd.feeCents + odd.shareCents).toBe(333);
    expect(splitAmount(1000, 0)).toEqual({ feeCents: 0, shareCents: 1000 });
  });

  it("formats dollars and adds days", () => {
    expect(formatUsd(1234)).toBe("$12.34");
    expect(addDays(new Date("2026-11-26T00:00:00Z"), 30).toISOString()).toBe("2026-12-26T00:00:00.000Z");
  });
});

describe("admin ranks", () => {
  it("gives the Super Admin every ability and never lists it as assignable", () => {
    expect([...RANK_DEFAULTS.SUPER_ADMIN]).toEqual([...PERMISSION_LIST]);
    expect((ASSIGNABLE_RANKS as readonly string[]).includes("SUPER_ADMIN")).toBe(false);
  });

  it("only lists real abilities for every rank", () => {
    for (const abilities of Object.values(RANK_DEFAULTS)) {
      for (const ability of abilities) {
        expect(PERMISSION_LIST).toContain(ability);
      }
    }
  });

  it("keeps ranks apart", () => {
    expect(RANK_DEFAULTS.AD_MANAGER).toContain("MANAGE_ADS");
    expect(RANK_DEFAULTS.AD_MANAGER).not.toContain("BAN_USERS");
    expect(RANK_DEFAULTS.SUPPORT).not.toContain("HIDE_COMMENTS");
  });
});

// Location: backend/tests/helpers.test.ts
// End of file: helpers.test.ts