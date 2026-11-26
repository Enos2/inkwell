// Project: Inkwell
// Location: backend/tests/streak.test.ts
// Purpose: Tests for the reading streak rules in utils/streak.ts.

import { describe, expect, it } from "vitest";
import { computeStreaks, toDayString } from "../utils/streak";

describe("computeStreaks", () => {
  it("handles a reader with no days", () => {
    expect(computeStreaks([], "2026-11-26")).toEqual({
      current: 0,
      longest: 0,
      lastReadDay: null,
      readToday: false,
    });
  });

  it("counts one day read today", () => {
    const result = computeStreaks(["2026-11-26"], "2026-11-26");
    expect(result.current).toBe(1);
    expect(result.longest).toBe(1);
    expect(result.readToday).toBe(true);
  });

  it("keeps the streak alive until the end of the next day", () => {
    const result = computeStreaks(["2026-11-24", "2026-11-25"], "2026-11-26");
    expect(result.current).toBe(2);
    expect(result.readToday).toBe(false);
  });

  it("ends the current streak after a missed day, but remembers the longest", () => {
    const result = computeStreaks(["2026-11-20", "2026-11-21", "2026-11-22"], "2026-11-26");
    expect(result.current).toBe(0);
    expect(result.longest).toBe(3);
  });

  it("separates old runs from the current one", () => {
    const days = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-25", "2026-11-26"];
    const result = computeStreaks(days, "2026-11-26");
    expect(result.current).toBe(2);
    expect(result.longest).toBe(3);
  });

  it("ignores repeated days and unsorted input", () => {
    const result = computeStreaks(["2026-11-26", "2026-11-25", "2026-11-26"], "2026-11-26");
    expect(result.current).toBe(2);
  });

  it("works across month and leap-year boundaries", () => {
    expect(computeStreaks(["2026-02-28", "2026-03-01"], "2026-03-01").current).toBe(2);
    expect(computeStreaks(["2028-02-28", "2028-02-29", "2028-03-01"], "2028-03-01").current).toBe(3);
    expect(computeStreaks(["2028-02-28", "2028-03-01"], "2028-03-01").current).toBe(1);
  });
});

describe("toDayString", () => {
  it("uses the UTC date", () => {
    expect(toDayString(new Date("2026-11-26T23:59:59Z"))).toBe("2026-11-26");
    expect(toDayString(new Date("2026-11-27T00:00:00Z"))).toBe("2026-11-27");
  });
});

// Location: backend/tests/streak.test.ts
// End of file: streak.test.ts