import { describe, expect, it } from "vitest";
import { getCompliancePreviewForShift } from "@/lib/compliance";

type MockPrisma = {
  shift: {
    findUnique: () => Promise<null>;
  };
};

describe("compliance preview", () => {
  it("returns null when shift does not exist", async () => {
    const prisma = {
      shift: {
        findUnique: async () => null,
      },
    } satisfies MockPrisma;

    const preview = await getCompliancePreviewForShift(prisma as never, {
      userId: "user-1",
      shiftId: "missing-shift",
    });

    expect(preview).toBeNull();
  });
});
