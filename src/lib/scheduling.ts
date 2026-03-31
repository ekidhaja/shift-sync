import type { Availability, PrismaClient } from "@prisma/client";

export type AssignmentViolationCode =
  | "MISSING_SKILL"
  | "MISSING_CERTIFICATION"
  | "OVERLAP"
  | "REST_WINDOW"
  | "UNAVAILABLE";

export type AssignmentViolation = {
  code: AssignmentViolationCode;
  message: string;
};

export type AssignmentAlternative = {
  userId: string;
  name: string | null;
  email: string | null;
  reasons: string[];
};

export function rangesOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date
) {
  return startA < endB && startB < endA;
}

export function hoursBetweenDates(earlier: Date, later: Date) {
  return (later.getTime() - earlier.getTime()) / (1000 * 60 * 60);
}

export function getWeekStartDate(date: Date) {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  const day = normalized.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  normalized.setUTCDate(normalized.getUTCDate() + diff);
  return normalized;
}

function getTimeZoneDayAndMinute(date: Date, timeZone: string) {
  const dayText = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone,
  }).format(date);
  const dayLookup: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(date);

  const hour = Number.parseInt(parts.find((part) => part.type === "hour")?.value ?? "0", 10);
  const minute = Number.parseInt(parts.find((part) => part.type === "minute")?.value ?? "0", 10);

  return {
    dayOfWeek: dayLookup[dayText] ?? 0,
    minuteOfDay: (hour * 60) + minute,
  };
}

export function isShiftWithinAvailability(
  availabilityEntries: Availability[],
  shiftStart: Date,
  shiftEnd: Date,
  locationTimeZone: string
) {
  const recurring = availabilityEntries.filter((entry) => entry.type === "RECURRING");
  const exceptions = availabilityEntries.filter((entry) => entry.type === "EXCEPTION");

  const recurringMatch = recurring.some((entry) => {
    if (
      entry.dayOfWeek === null
      || entry.startMinute === null
      || entry.endMinute === null
    ) {
      return false;
    }

    const startPoint = getTimeZoneDayAndMinute(shiftStart, locationTimeZone);
    const endPoint = getTimeZoneDayAndMinute(shiftEnd, locationTimeZone);

    if (startPoint.dayOfWeek !== entry.dayOfWeek || endPoint.dayOfWeek !== entry.dayOfWeek) {
      return false;
    }

    return startPoint.minuteOfDay >= entry.startMinute
      && endPoint.minuteOfDay <= entry.endMinute;
  });

  const exceptionBlock = exceptions.some((entry) => {
    if (!entry.startDateTime || !entry.endDateTime) {
      return false;
    }

    return rangesOverlap(
      shiftStart,
      shiftEnd,
      entry.startDateTime,
      entry.endDateTime
    );
  });

  return recurringMatch && !exceptionBlock;
}

export async function createAuditLog(
  prisma: PrismaClient,
  args: {
    actorId?: string;
    entityType: "SHIFT" | "SHIFT_ASSIGNMENT" | "SCHEDULE_WEEK" | "SWAP_REQUEST" | "NOTIFICATION";
    entityId: string;
    action:
      | "CREATE"
      | "UPDATE"
      | "DELETE"
      | "ASSIGN"
      | "UNASSIGN"
      | "PUBLISH"
      | "UNPUBLISH"
      | "REQUEST_SWAP"
      | "ACCEPT_SWAP"
      | "APPROVE_SWAP"
      | "REJECT_SWAP"
      | "CANCEL_SWAP"
      | "READ_NOTIFICATION";
    locationId?: string;
    shiftId?: string;
    shiftAssignmentId?: string;
    beforeState?: unknown;
    afterState?: unknown;
  }
) {
  await prisma.auditLog.create({
    data: {
      actorId: args.actorId,
      entityType: args.entityType,
      entityId: args.entityId,
      action: args.action,
      locationId: args.locationId,
      shiftId: args.shiftId,
      shiftAssignmentId: args.shiftAssignmentId,
      beforeState: args.beforeState as never,
      afterState: args.afterState as never,
    },
  });
}
