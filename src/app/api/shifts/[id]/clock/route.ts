import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/scheduling";
import { emitRealtimeEvent } from "@/lib/realtime.server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "STAFF") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const action = body?.action === "clockOut" ? "clockOut" : body?.action === "clockIn" ? "clockIn" : null;

  if (!action) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const assignment = await prisma.shiftAssignment.findFirst({
    where: {
      shiftId: id,
      userId: session.user.id,
    },
    select: {
      id: true,
      shiftId: true,
      userId: true,
      shift: {
        select: {
          id: true,
          locationId: true,
          startDateTime: true,
          endDateTime: true,
        },
      },
    },
  });

  if (!assignment) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const priorLogs = await prisma.auditLog.findMany({
    where: {
      entityType: "SHIFT_ASSIGNMENT",
      action: "UPDATE",
      shiftAssignmentId: assignment.id,
    },
    select: {
      afterState: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 1,
  });

  const lastState = (priorLogs[0]?.afterState ?? null) as { clockInAt?: string | null; clockOutAt?: string | null } | null;
  const previousClockInAt = typeof lastState?.clockInAt === "string" ? lastState.clockInAt : null;
  const previousClockOutAt = typeof lastState?.clockOutAt === "string" ? lastState.clockOutAt : null;

  const now = new Date();

  if (action === "clockIn") {
    if (previousClockInAt && !previousClockOutAt) {
      return Response.json({ error: "Already clocked in." }, { status: 409 });
    }

    if (now > assignment.shift.endDateTime) {
      return Response.json({ error: "Cannot clock in after shift end." }, { status: 409 });
    }
  }

  if (action === "clockOut") {
    if (!previousClockInAt || previousClockOutAt) {
      return Response.json({ error: "You must clock in before clocking out." }, { status: 409 });
    }
  }

  const nextClockInAt = action === "clockIn"
    ? now.toISOString()
    : previousClockInAt;
  const nextClockOutAt = action === "clockOut"
    ? now.toISOString()
    : previousClockOutAt;

  await createAuditLog(prisma, {
    actorId: session.user.id,
    entityType: "SHIFT_ASSIGNMENT",
    entityId: assignment.id,
    action: "UPDATE",
    locationId: assignment.shift.locationId,
    shiftId: assignment.shiftId,
    shiftAssignmentId: assignment.id,
    beforeState: {
      clockInAt: previousClockInAt,
      clockOutAt: previousClockOutAt,
    },
    afterState: {
      clockInAt: nextClockInAt,
      clockOutAt: nextClockOutAt,
    },
  });

  await emitRealtimeEvent("schedule.updated", {
    action: action === "clockIn" ? "clock_in" : "clock_out",
    locationId: assignment.shift.locationId,
    shiftId: assignment.shiftId,
    userId: session.user.id,
  });

  return Response.json({
    data: {
      shiftId: assignment.shiftId,
      assignmentId: assignment.id,
      clockInAt: nextClockInAt,
      clockOutAt: nextClockOutAt,
    },
  });
}