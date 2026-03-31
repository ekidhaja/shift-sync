import { describe, expect, it } from "vitest";
import { getDropExpiryDate, isPastDropExpiry } from "@/lib/swaps";

describe("swap helpers", () => {
  it("computes drop expiry 24h before shift", () => {
    const shiftStart = new Date("2026-05-10T18:00:00.000Z");
    const expiry = getDropExpiryDate(shiftStart);

    expect(expiry.toISOString()).toBe("2026-05-09T18:00:00.000Z");
  });

  it("blocks drop requests after expiry", () => {
    const shiftStart = new Date("2026-05-10T18:00:00.000Z");
    const now = new Date("2026-05-09T18:00:01.000Z");

    expect(isPastDropExpiry(shiftStart, now)).toBe(true);
  });

  it("allows drop requests before expiry", () => {
    const shiftStart = new Date("2026-05-10T18:00:00.000Z");
    const now = new Date("2026-05-09T17:59:59.000Z");

    expect(isPastDropExpiry(shiftStart, now)).toBe(false);
  });
});
