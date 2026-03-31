import { describe, expect, it } from "vitest";
import { availabilitySchema } from "@/lib/validation/availability";

describe("availabilitySchema", () => {
  it("accepts recurring availability", () => {
    const parsed = availabilitySchema.safeParse({
      type: "RECURRING",
      dayOfWeeks: [1, 2, 3],
      startMinute: 480,
      endMinute: 960,
      locationIds: ["loc-1", "loc-2"],
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts exception availability", () => {
    const parsed = availabilitySchema.safeParse({
      type: "EXCEPTION",
      startDateTime: "2026-03-29T09:00",
      endDateTime: "2026-03-29T13:00",
      locationIds: ["loc-1"],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects exception availability when end is before start", () => {
    const parsed = availabilitySchema.safeParse({
      type: "EXCEPTION",
      startDateTime: "2026-03-29T13:00",
      endDateTime: "2026-03-29T09:00",
      locationIds: ["loc-1"],
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts legacy payload with single locationId", () => {
    const parsed = availabilitySchema.safeParse({
      type: "RECURRING",
      dayOfWeek: 1,
      startMinute: 600,
      endMinute: 900,
      locationId: "loc-1",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects recurring availability when no day is provided", () => {
    const parsed = availabilitySchema.safeParse({
      type: "RECURRING",
      startMinute: 600,
      endMinute: 900,
      locationId: "loc-1",
    });

    expect(parsed.success).toBe(false);
  });
});
