import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/scheduling";
import { createNotification } from "@/lib/notifications";
import { evaluateAssignmentConstraints, findAssignmentAlternatives } from "@/lib/scheduling-rules";
import { getCompliancePreviewForShift } from "@/lib/compliance";
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shift = await prisma.shift.findUnique({
    where: { id },
    include: {
      scheduleWeek: true,
      assignments: { select: { id: true } },
    },
  });

  if (!shift) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const allowed = await canManageShift(session.user.id, session.user.role, shift.locationId);
  if (!allowed) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (
    shift.status === "PUBLISHED"
    && isWithinPublishCutoff(shift.startDateTime, shift.scheduleWeek.cutoffHours)
  ) {
    return Response.json(
      {
        error: "Publish cutoff reached",
        details: "Published shifts cannot be reassigned inside the cutoff window.",
      },
      { status: 409 }
    );
  }

  if (shift.assignments.length >= shift.headcount) {
    return Response.json(
      {
        error: "Headcount filled",
        details: "This shift has already reached its headcount limit.",
      },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : null;
  const overrideReason = typeof body?.overrideReason === "string" ? body.overrideReason.trim() : "";

  if (!userId) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { violations, alternatives } = await evaluateAssignmentConstraints(prisma, {
    shiftId: shift.id,
    userId,
  });

  const compliance = await getCompliancePreviewForShift(prisma, {
    userId,
    shiftId: shift.id,
  });

  const complianceBlocks = compliance?.issues.filter((issue) => issue.severity === "block") ?? [];
  const requiresOverride =
    (compliance?.issues.some((issue) => issue.severity === "requires_override") ?? false)
    && overrideReason.length === 0;

  if (violations.length > 0 || complianceBlocks.length > 0 || requiresOverride) {
    await emitRealtimeEvent("conflict.detected", {
      locationId: shift.locationId,
      shiftId: shift.id,
      userId,
      violations,
      compliance,
      requiresOverride,
    });

    return Response.json(
      {
        error: "Constraint violation",
        violations,
        alternatives,
        compliance,
        details: requiresOverride
          ? "This assignment requires an override reason due to 7th consecutive day risk."
          : complianceBlocks.length > 0
            ? complianceBlocks.map((issue) => issue.message).join(" ")
            : undefined,
      },
      { status: 409 }
    );
  }

  let assignment;
  try {
    assignment = await prisma.shiftAssignment.create({
      data: {
        shiftId: shift.id,
        userId,
        assignedById: session.user.id,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const alternatives = await findAssignmentAlternatives(prisma, { shiftId: shift.id });

      await emitRealtimeEvent("conflict.detected", {
        locationId: shift.locationId,
        shiftId: shift.id,
        userId,
        source: "assignment-create",
        code: error.code,
      });

      return Response.json(
        {
          error: "Constraint violation",
          details: "This assignment conflicted with a recent scheduling change. Please refresh and try again.",
          alternatives,
        },
        { status: 409 }
      );
    }

    return Response.json(
      { error: "Could not assign staff.", details: "Unexpected scheduling error." },
      { status: 503 }
    );
  }

  await createAuditLog(prisma, {
    actorId: session.user.id,
    entityType: "SHIFT_ASSIGNMENT",
    entityId: assignment.id,
    action: "ASSIGN",
    locationId: shift.locationId,
    shiftId: shift.id,
    shiftAssignmentId: assignment.id,
    afterState: {
      shiftId: shift.id,
      userId,
      assignedById: session.user.id,
    },
  });

  await createNotification(prisma, {
    userId,
    type: "SCHEDULE_UPDATED",
    title: "New shift assignment",
    message: "You were assigned to a shift.",
    shiftId: shift.id,
    locationId: shift.locationId,
  });

  await emitRealtimeEvent("schedule.updated", {
    locationId: shift.locationId,
    shiftId: shift.id,
    assignmentId: assignment.id,
    action: "assign",
  });

  return Response.json({ data: assignment }, { status: 201 });
}
