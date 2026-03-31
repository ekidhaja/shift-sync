import { describe, expect, it } from "vitest";
import {
  getWeekStartDate,
  hoursBetweenDates,
  isShiftWithinAvailability,
  rangesOverlap,
} from "@/lib/scheduling";

describe("scheduling helpers", () => {
  it("detects overlap between date ranges", () => {
    const aStart = new Date("2026-03-30T09:00:00.000Z");
    const aEnd = new Date("2026-03-30T12:00:00.000Z");
    const bStart = new Date("2026-03-30T11:00:00.000Z");
    const bEnd = new Date("2026-03-30T13:00:00.000Z");

    expect(rangesOverlap(aStart, aEnd, bStart, bEnd)).toBe(true);
  });

  it("calculates hours between dates", () => {
    const start = new Date("2026-03-30T09:00:00.000Z");
    const end = new Date("2026-03-30T19:00:00.000Z");

    expect(hoursBetweenDates(start, end)).toBe(10);
  });

  it("computes monday week start in UTC", () => {
    const weekStart = getWeekStartDate(new Date("2026-04-02T10:00:00.000Z"));

    expect(weekStart.toISOString()).toBe("2026-03-30T00:00:00.000Z");
  });

  it("matches recurring availability and blocks by exception", () => {
    const shiftStart = new Date("2026-03-30T13:00:00.000Z");
    const shiftEnd = new Date("2026-03-30T15:00:00.000Z");

    const recurringOnly = isShiftWithinAvailability(
      [
        {
          id: "av-1",
          userId: "u1",
          locationId: "l1",
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
      shiftStart,
      shiftEnd,
      "America/New_York"
    );

    expect(recurringOnly).toBe(true);

    const withException = isShiftWithinAvailability(
      [
        {
          id: "av-1",
          userId: "u1",
          locationId: "l1",
          type: "RECURRING",
          dayOfWeek: 1,
          startMinute: 540,
          endMinute: 1020,
          startDateTime: null,
          endDateTime: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "av-2",
          userId: "u1",
          locationId: "l1",
          type: "EXCEPTION",
          dayOfWeek: null,
          startMinute: null,
          endMinute: null,
          startDateTime: new Date("2026-03-30T12:00:00.000Z"),
          endDateTime: new Date("2026-03-30T16:00:00.000Z"),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      shiftStart,
      shiftEnd,
      "America/New_York"
    );

    expect(withException).toBe(false);
  });
});
