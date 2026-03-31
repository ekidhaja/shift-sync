import type { Role } from "@prisma/client";

export function isAdmin(role?: Role) {
  return role === "ADMIN";
}

export function isManager(role?: Role) {
  return role === "MANAGER";
}

export function isStaff(role?: Role) {
  return role === "STAFF";
}

export function canManageLocation(
  role: Role | undefined,
  managerLocationIds: string[],
  locationId: string
) {
  if (role === "ADMIN") {
    return true;
  }

  if (role !== "MANAGER") {
    return false;
  }

  return managerLocationIds.includes(locationId);
}

export function canEditOwnAvailability(role?: Role) {
  return role === "STAFF";
}

export function canViewManagedAvailability(role?: Role) {
  return role === "MANAGER" || role === "ADMIN";
}
