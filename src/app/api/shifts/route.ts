import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog, getWeekStartDate } from "@/lib/scheduling";
import { emitRealtimeEvent } from "@/lib/realtime.server";

function toDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function assertLocationAccess(
  userId: string,
  role: "ADMIN" | "MANAGER" | "STAFF" | undefined,
  locationId: string
) {
  if (role === "ADMIN") {
    return true;
  }

  if (role !== "MANAGER") {
    return false;
  }

  const managerLocation = await prisma.managerLocation.findUnique({
    where: {
      userId_locationId: {
        userId,
        locationId,
      },
    },
    select: { userId: true },
  });

  return Boolean(managerLocation);
}

async function getClockStateByAssignmentId(assignmentIds: string[]) {
  if (assignmentIds.length === 0) {
    return new Map<string, { clockInAt: string | null; clockOutAt: string | null }>();
  }

  const logs = await prisma.auditLog.findMany({
    where: {
      entityType: "SHIFT_ASSIGNMENT",
      action: "UPDATE",
      shiftAssignmentId: { in: assignmentIds },
    },
    select: {
      shiftAssignmentId: true,
      afterState: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const clockState = new Map<string, { clockInAt: string | null; clockOutAt: string | null }>();

  for (const log of logs) {
    if (!log.shiftAssignmentId || clockState.has(log.shiftAssignmentId)) {
      continue;
    }

    const afterState = log.afterState as { clockInAt?: string | null; clockOutAt?: string | null } | null;
    clockState.set(log.shiftAssignmentId, {
      clockInAt: typeof afterState?.clockInAt === "string" ? afterState.clockInAt : null,
      clockOutAt: typeof afterState?.clockOutAt === "string" ? afterState.clockOutAt : null,
    });
  }

  return clockState;
}

type AssignmentClockMeta = {
  assignmentId: string;
  shiftId: string;
  locationId: string;
  shiftEndDateTime: Date;
};

async function autoClockOutExpiredAssignments(clockMeta: AssignmentClockMeta[], now: Date) {
  if (clockMeta.length === 0) {
    return;
  }

  const assignmentIds = clockMeta.map((entry) => entry.assignmentId);
  const clockStateByAssignment = await getClockStateByAssignmentId(assignmentIds);

  const expiredOpenAssignments = clockMeta.filter((entry) => {
    if (entry.shiftEndDateTime >= now) {
      return false;
    }

    const state = clockStateByAssignment.get(entry.assignmentId);
    return Boolean(state?.clockInAt) && !state?.clockOutAt;
  });

  if (expiredOpenAssignments.length === 0) {
    return;
  }

  await Promise.all(
    expiredOpenAssignments.map(async (entry) => {
      const state = clockStateByAssignment.get(entry.assignmentId);
      await createAuditLog(prisma, {
        entityType: "SHIFT_ASSIGNMENT",
        entityId: entry.assignmentId,
        action: "UPDATE",
        locationId: entry.locationId,
        shiftId: entry.shiftId,
        shiftAssignmentId: entry.assignmentId,
        beforeState: {
          clockInAt: state?.clockInAt ?? null,
          clockOutAt: state?.clockOutAt ?? null,
        },
        afterState: {
          clockInAt: state?.clockInAt ?? null,
          clockOutAt: entry.shiftEndDateTime.toISOString(),
        },
      });
    })
  );

  const uniqueLocationIds = Array.from(new Set(expiredOpenAssignments.map((entry) => entry.locationId)));
  await Promise.all(
    uniqueLocationIds.map((locationId) => emitRealtimeEvent("schedule.updated", {
      action: "auto_clock_out",
      locationId,
    }))
  );
}

function withAssignmentOutcome<T extends { endDateTime: Date; assignments: Array<{ id: string }> }>(
  items: T[],
  now: Date,
  clockStateByAssignmentId: Map<string, { clockInAt: string | null; clockOutAt: string | null }>
) {
  return items.map((item) => ({
    ...item,
    assignments: item.assignments.map((assignment) => {
      const clockState = clockStateByAssignmentId.get(assignment.id);
      const clockInAt = clockState?.clockInAt ?? null;
      const clockOutAt = clockState?.clockOutAt ?? null;
      const servedStatus = item.endDateTime < now
        ? (clockInAt ? "SERVED" : "MISSED")
        : null;

      return {
        ...assignment,
        clockInAt,
        clockOutAt,
        servedStatus,
      };
    }),
  }));
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const locationId = url.searchParams.get("locationId");
  const weekStartDateValue = url.searchParams.get("weekStartDate");
  const timeRange = url.searchParams.get("timeRange") ?? "week";
  const weekStartDate = weekStartDateValue ? toDate(weekStartDateValue) : null;
  const now = new Date();

  const whereClause: {
    locationId?: string;
    scheduleWeek?: { weekStartDate: Date };
    endDateTime?: { gte?: Date; lt?: Date };
  } = {};

  if (locationId) {
    if (session.user.role !== "STAFF") {
      const allowed = await assertLocationAccess(
        session.user.id,
        session.user.role,
        locationId
      );

      if (!allowed) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    whereClause.locationId = locationId;
  }

  if (timeRange === "week" && weekStartDate) {
    whereClause.scheduleWeek = { weekStartDate };
  }

  if (timeRange === "upcoming") {
    whereClause.endDateTime = { gte: now };
  } else if (timeRange === "past") {
    whereClause.endDateTime = { lt: now };
  }

  const orderBy = timeRange === "past"
    ? { startDateTime: "desc" as const }
    : { startDateTime: "asc" as const };

  const withTemporalStatus = <T extends { endDateTime: Date }>(items: T[]) =>
    items.map((item) => ({
      ...item,
      temporalStatus: item.endDateTime < now ? "PAST" : "UPCOMING",
    }));

  if (!locationId && session.user.role === "MANAGER") {
    const managerLocations = await prisma.managerLocation.findMany({
      where: { userId: session.user.id },
      select: { locationId: true },
    });

    const ids = managerLocations.map((entry) => entry.locationId);
    if (ids.length === 0) {
      return Response.json({ data: [] });
    }

    const shifts = await prisma.shift.findMany({
      where: {
        ...whereClause,
        locationId: { in: ids },
      },
      include: {
        location: { select: { name: true, timezone: true } },
        requiredSkill: { select: { name: true } },
        assignments: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        scheduleWeek: true,
      },
      orderBy,
    });

    await autoClockOutExpiredAssignments(
      shifts.flatMap((shift) => shift.assignments.map((assignment) => ({
        assignmentId: assignment.id,
        shiftId: shift.id,
        locationId: shift.locationId,
        shiftEndDateTime: shift.endDateTime,
      }))),
      now
    );

    const assignmentIds = shifts.flatMap((shift) => shift.assignments.map((assignment) => assignment.id));
    const clockStateByAssignmentId = await getClockStateByAssignmentId(assignmentIds);

    const shiftsWithOutcome = withAssignmentOutcome(shifts, now, clockStateByAssignmentId);

    return Response.json({ data: withTemporalStatus(shiftsWithOutcome) });
  }

  if (session.user.role === "STAFF") {
    const shifts = await prisma.shift.findMany({
      where: {
        ...whereClause,
        status: "PUBLISHED",
        assignments: {
          some: {
            userId: session.user.id,
          },
        },
      },
      include: {
        location: { select: { name: true, timezone: true } },
        requiredSkill: { select: { name: true } },
        assignments: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        scheduleWeek: true,
      },
      orderBy,
    });

    await autoClockOutExpiredAssignments(
      shifts.flatMap((shift) => shift.assignments.map((assignment) => ({
        assignmentId: assignment.id,
        shiftId: shift.id,
        locationId: shift.locationId,
        shiftEndDateTime: shift.endDateTime,
      }))),
      now
    );

    const myAssignmentIds = shifts
      .flatMap((shift) => shift.assignments)
      .filter((assignment) => assignment.user.id === session.user.id)
      .map((assignment) => assignment.id);

    const clockLogs = myAssignmentIds.length > 0
      ? await prisma.auditLog.findMany({
          where: {
            entityType: "SHIFT_ASSIGNMENT",
            action: "UPDATE",
            shiftAssignmentId: { in: myAssignmentIds },
          },
          select: {
            shiftAssignmentId: true,
            afterState: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const clockStateByAssignment = new Map<string, { clockInAt: string | null; clockOutAt: string | null }>();

    for (const log of clockLogs) {
      if (!log.shiftAssignmentId || clockStateByAssignment.has(log.shiftAssignmentId)) {
        continue;
      }

      const afterState = log.afterState as { clockInAt?: string | null; clockOutAt?: string | null } | null;
      clockStateByAssignment.set(log.shiftAssignmentId, {
        clockInAt: typeof afterState?.clockInAt === "string" ? afterState.clockInAt : null,
        clockOutAt: typeof afterState?.clockOutAt === "string" ? afterState.clockOutAt : null,
      });
    }

    const shiftsWithClockState = shifts.map((shift) => {
      const myAssignment = shift.assignments.find((assignment) => assignment.user.id === session.user.id);
      const clockState = myAssignment ? clockStateByAssignment.get(myAssignment.id) : undefined;

      return {
        ...shift,
        myAssignmentId: myAssignment?.id ?? null,
        clockInAt: clockState?.clockInAt ?? null,
        clockOutAt: clockState?.clockOutAt ?? null,
      };
    });

    return Response.json({ data: withTemporalStatus(shiftsWithClockState) });
  }

  const shifts = await prisma.shift.findMany({
    where: whereClause,
    include: {
      location: { select: { name: true, timezone: true } },
      requiredSkill: { select: { name: true } },
      assignments: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      scheduleWeek: true,
    },
    orderBy,
  });

  await autoClockOutExpiredAssignments(
    shifts.flatMap((shift) => shift.assignments.map((assignment) => ({
      assignmentId: assignment.id,
      shiftId: shift.id,
      locationId: shift.locationId,
      shiftEndDateTime: shift.endDateTime,
    }))),
    now
  );

  const assignmentIds = shifts.flatMap((shift) => shift.assignments.map((assignment) => assignment.id));
  const clockStateByAssignmentId = await getClockStateByAssignmentId(assignmentIds);

  const shiftsWithOutcome = withAssignmentOutcome(shifts, now, clockStateByAssignmentId);

  return Response.json({ data: withTemporalStatus(shiftsWithOutcome) });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const locationId = typeof body?.locationId === "string" ? body.locationId : null;
  const requiredSkillId = typeof body?.requiredSkillId === "string" ? body.requiredSkillId : null;
  const headcount = Number.isInteger(body?.headcount) ? body.headcount : 1;
  const startDateTime = toDate(body?.startDateTime);
  const endDateTime = toDate(body?.endDateTime);

  if (!locationId || !requiredSkillId || !startDateTime || !endDateTime || endDateTime <= startDateTime) {
    return Response.json(
      { error: "Invalid payload", details: "Provide valid locationId, requiredSkillId, startDateTime and endDateTime." },
      { status: 400 }
    );
  }

  const allowed = await assertLocationAccess(session.user.id, session.user.role, locationId);
  if (!allowed) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const weekStartDate = getWeekStartDate(startDateTime);

  try {
    const scheduleWeek = await prisma.scheduleWeek.upsert({
      where: {
        locationId_weekStartDate: {
          locationId,
          weekStartDate,
        },
      },
      update: {},
      create: {
        locationId,
        weekStartDate,
      },
    });

    const shift = await prisma.shift.create({
      data: {
        locationId,
        requiredSkillId,
        scheduleWeekId: scheduleWeek.id,
        startDateTime,
        endDateTime,
        headcount,
        createdById: session.user.id,
      },
      include: {
        location: { select: { name: true, timezone: true } },
        requiredSkill: { select: { name: true } },
        scheduleWeek: true,
      },
    });

    await createAuditLog(prisma, {
      actorId: session.user.id,
      entityType: "SHIFT",
      entityId: shift.id,
      action: "CREATE",
      locationId,
      shiftId: shift.id,
      afterState: {
        locationId,
        requiredSkillId,
        startDateTime: shift.startDateTime,
        endDateTime: shift.endDateTime,
        headcount,
      },
    });

    await emitRealtimeEvent("schedule.updated", {
      locationId,
      shiftId: shift.id,
      action: "create",
    });

    return Response.json({ data: shift }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: "Could not create shift.",
        details: error instanceof Error ? error.message : "Unexpected scheduling error.",
      },
      { status: 503 }
    );
  }
}
