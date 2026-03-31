import { describe, expect, it } from "vitest";
import { profileSchema } from "@/lib/validation/profile";

describe("profileSchema", () => {
  it("accepts valid payload", () => {
    const parsed = profileSchema.safeParse({ name: "Alex", desiredWeeklyHours: 40 });
    expect(parsed.success).toBe(true);
  });

  it("rejects negative desiredWeeklyHours", () => {
    const parsed = profileSchema.safeParse({ desiredWeeklyHours: -2 });
    expect(parsed.success).toBe(false);
  });
});
