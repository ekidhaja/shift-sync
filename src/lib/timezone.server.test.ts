import { describe, expect, it } from "vitest";
import { convertDateTimeLocalToUtcIso } from "@/lib/timezone";
import { isShiftWithinAvailability } from "@/lib/scheduling";

describe("timezone conversion", () => {
  it("converts New York local datetime to UTC", () => {
    const converted = convertDateTimeLocalToUtcIso("2026-03-30T09:00", "America/New_York");

    expect(converted).toBe("2026-03-30T13:00:00.000Z");
  });

  it("converts Los Angeles local datetime to UTC", () => {
    const converted = convertDateTimeLocalToUtcIso("2026-03-30T09:00", "America/Los_Angeles");

    expect(converted).toBe("2026-03-30T16:00:00.000Z");
  });

  it("returns null for invalid input", () => {
    expect(convertDateTimeLocalToUtcIso("invalid", "America/New_York")).toBeNull();
    expect(convertDateTimeLocalToUtcIso("2026-03-30T09:00", "Invalid/Timezone")).toBeNull();
  });

  it("preserves Monday 9-5 recurring availability semantics", () => {
    const startIso = convertDateTimeLocalToUtcIso("2026-03-30T09:00", "America/New_York");
    const endIso = convertDateTimeLocalToUtcIso("2026-03-30T17:00", "America/New_York");

    expect(startIso).not.toBeNull();
    expect(endIso).not.toBeNull();

    const available = isShiftWithinAvailability(
      [
        {
          id: "availability-1",
          userId: "user-1",
          locationId: "location-1",
          type: "RECURRING",
          dayOfWeek: 1,
          startMinute: 540,
          endMinute: 1020,
          startDateTime: null,
          endDateTime: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      new Date(startIso as string),
      new Date(endIso as string),
      "America/New_York"
    );

    expect(available).toBe(true);
  });
});
