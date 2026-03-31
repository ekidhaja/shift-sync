import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/scheduling";
import { createNotification } from "@/lib/notifications";
import { emitRealtimeEvent } from "@/lib/realtime.server";

function isWithinPublishCutoff(shiftStart: Date, cutoffHours: number) {
  const cutoffBoundary = shiftStart.getTime() - (cutoffHours * 60 * 60 * 1000);
  return Date.now() >= cutoffBoundary;
}

async function canManageShift(
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

  const link = await prisma.managerLocation.findUnique({
    where: {
      userId_locationId: {
        userId,
        locationId,
      },
    },
    select: { userId: true },
  });

  return Boolean(link);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const { id, assignmentId } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const assignment = await prisma.shiftAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      shift: {
        include: { scheduleWeek: true },
      },
    },
  });

  if (!assignment || assignment.shiftId !== id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const allowed = await canManageShift(
    session.user.id,
    session.user.role,
    assignment.shift.locationId
  );

  if (!allowed) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (
    assignment.shift.status === "PUBLISHED"
    && isWithinPublishCutoff(
      assignment.shift.startDateTime,
      assignment.shift.scheduleWeek.cutoffHours
    )
  ) {
    return Response.json(
      {
        error: "Publish cutoff reached",
        details: "Published shifts cannot be reassigned inside the cutoff window.",
      },
      { status: 409 }
    );
  }

  try {
    await createAuditLog(prisma, {
      actorId: session.user.id,
      entityType: "SHIFT_ASSIGNMENT",
      entityId: assignment.id,
      action: "UNASSIGN",
      locationId: assignment.shift.locationId,
      shiftId: assignment.shiftId,
      shiftAssignmentId: assignment.id,
      beforeState: {
        shiftId: assignment.shiftId,
        userId: assignment.userId,
        assignedById: assignment.assignedById,
      },
    });

    await prisma.shiftAssignment.delete({ where: { id: assignment.id } });

    await createNotification(prisma, {
      userId: assignment.userId,
      type: "SCHEDULE_UPDATED",
      title: "Shift assignment removed",
      message: "You were removed from a shift assignment.",
      shiftId: assignment.shiftId,
      locationId: assignment.shift.locationId,
    });

    await emitRealtimeEvent("schedule.updated", {
      locationId: assignment.shift.locationId,
      shiftId: assignment.shiftId,
      assignmentId: assignment.id,
      action: "unassign",
    });
  } catch {
    return Response.json(
      {
        error: "Could not remove assignment.",
        details: "Unexpected scheduling error while removing assignment.",
      },
      { status: 503 }
    );
  }

  return Response.json({ status: "deleted" });
}
