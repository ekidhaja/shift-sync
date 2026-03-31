import { describe, expect, it } from "vitest";
import { getFairnessSummary } from "@/lib/fairness";

type MockPrisma = {
  shiftAssignment: {
    findMany: () => Promise<[]>;
  };
};

describe("fairness summary", () => {
  it("returns empty rows when there are no assignments", async () => {
    const prisma = {
      shiftAssignment: {
        findMany: async () => [],
      },
    } satisfies MockPrisma;

    const summary = await getFairnessSummary(prisma as never, {});

    expect(summary.rows).toEqual([]);
    expect(summary.weekStartDate instanceof Date).toBe(true);
    expect(summary.weekEndDate instanceof Date).toBe(true);
  });
});
