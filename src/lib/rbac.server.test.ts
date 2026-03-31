import { describe, expect, it } from "vitest";
import {
  canEditOwnAvailability,
  canManageLocation,
  canViewManagedAvailability,
  isAdmin,
} from "@/lib/rbac";
import type { Role } from "@prisma/client";

describe("rbac helpers", () => {
  it("detects admin role", () => {
    expect(isAdmin("ADMIN" as Role)).toBe(true);
  });

  it("allows manager for assigned location", () => {
    expect(canManageLocation("MANAGER" as Role, ["loc-1"], "loc-1")).toBe(true);
  });

  it("allows only staff to edit own availability", () => {
    expect(canEditOwnAvailability("STAFF" as Role)).toBe(true);
    expect(canEditOwnAvailability("MANAGER" as Role)).toBe(false);
    expect(canEditOwnAvailability("ADMIN" as Role)).toBe(false);
  });

  it("allows managers and admins to view managed availability", () => {
    expect(canViewManagedAvailability("MANAGER" as Role)).toBe(true);
    expect(canViewManagedAvailability("ADMIN" as Role)).toBe(true);
    expect(canViewManagedAvailability("STAFF" as Role)).toBe(false);
  });
});
