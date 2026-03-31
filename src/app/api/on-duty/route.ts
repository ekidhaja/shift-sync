import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const url = new URL(request.url);
  const locationId = url.searchParams.get("locationId") ?? undefined;

  const managedLocationIds = session.user.role === "MANAGER"
    ? (await prisma.managerLocation.findMany({
        where: { userId: session.user.id },
        select: { locationId: true },
      })).map((entry) => entry.locationId)
    : undefined;

  if (
    session.user.role === "MANAGER"
    && locationId
    && !managedLocationIds?.includes(locationId)
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      userId: session.user.role === "STAFF" ? session.user.id : undefined,
      shift: {
        locationId: locationId
          ? locationId
          : managedLocationIds
            ? { in: managedLocationIds }
            : undefined,
        endDateTime: { gte: now },
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      shift: {
        select: {
          id: true,
          locationId: true,
          startDateTime: true,
          endDateTime: true,
          location: { select: { name: true, timezone: true } },
        },
      },
    },
    orderBy: { shift: { startDateTime: "asc" } },
  });

  const assignmentIds = assignments.map((entry) => entry.id);

  if (assignmentIds.length === 0) {
    return Response.json({ data: [] });
  }

  const clockLogs = await prisma.auditLog.findMany({
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

  const onDutyClockedIn = assignments
    .map((assignment) => {
      const state = clockStateByAssignment.get(assignment.id);

      return {
        ...assignment,
        clockInAt: state?.clockInAt ?? null,
        clockOutAt: state?.clockOutAt ?? null,
      };
    })
    .filter((assignment) => Boolean(assignment.clockInAt) && !assignment.clockOutAt);

  return Response.json({ data: onDutyClockedIn });
}
