import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/scheduling";
import { evaluateAssignmentConstraints } from "@/lib/scheduling-rules";
import { getCompliancePreviewForShift } from "@/lib/compliance";
import { emitRealtimeEvent } from "@/lib/realtime.server";

export async function POST(
  _request: Request,
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

  const shift = await prisma.shift.findUnique({
    where: { id },
    include: {
      assignments: { select: { id: true, userId: true } },
    },
  });

  if (!shift) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (shift.status !== "PUBLISHED") {
    return Response.json(
      { error: "Invalid action", details: "Only published shifts can be picked up." },
      { status: 409 }
    );
  }

  if (shift.endDateTime <= new Date()) {
    return Response.json(
      { error: "Invalid action", details: "Past shifts cannot be picked up." },
      { status: 409 }
    );
  }

  if (shift.assignments.some((assignment) => assignment.userId === session.user.id)) {
    return Response.json(
      { error: "Already assigned", details: "You are already assigned to this shift." },
      { status: 409 }
    );
  }

  const { violations } = await evaluateAssignmentConstraints(prisma, {
    shiftId: shift.id,
    userId: session.user.id,
  });

  if (violations.length > 0) {
    return Response.json(
      {
        error: "Constraint violation",
        violations,
      },
      { status: 409 }
    );
  }

  const compliance = await getCompliancePreviewForShift(prisma, {
    userId: session.user.id,
    shiftId: shift.id,
  });

  const hasBlockingComplianceIssue =
    compliance?.issues.some((issue) => issue.severity === "block" || issue.severity === "requires_override")
    ?? false;

  if (hasBlockingComplianceIssue) {
    return Response.json(
      {
        error: "Constraint violation",
        details: "This shift cannot be picked up due to compliance constraints.",
        compliance,
      },
      { status: 409 }
    );
  }

  let assignment;

  try {
    assignment = await prisma.$transaction(async (transaction) => {
      const latestShift = await transaction.shift.findUnique({
        where: { id: shift.id },
        include: {
          assignments: { select: { id: true, userId: true } },
        },
      });

      if (!latestShift) {
        throw new Error("SHIFT_NOT_FOUND");
      }

      if (latestShift.assignments.some((entry) => entry.userId === session.user.id)) {
        throw new Error("ALREADY_ASSIGNED");
      }

      if (latestShift.assignments.length >= latestShift.headcount) {
        throw new Error("HEADCOUNT_FILLED");
      }

      return transaction.shiftAssignment.create({
        data: {
          shiftId: shift.id,
          userId: session.user.id,
          assignedById: session.user.id,
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return Response.json(
        {
          error: "Constraint violation",
          details: "This shift was updated before your pickup request completed. Refresh and try again.",
        },
        { status: 409 }
      );
    }

    if (error instanceof Error) {
      if (error.message === "ALREADY_ASSIGNED") {
        return Response.json(
          { error: "Already assigned", details: "You are already assigned to this shift." },
          { status: 409 }
        );
      }

      if (error.message === "HEADCOUNT_FILLED") {
        return Response.json(
          { error: "Headcount filled", details: "This shift has no open spots left." },
          { status: 409 }
        );
      }

      if (error.message === "SHIFT_NOT_FOUND") {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
    }

    return Response.json(
      { error: "Could not pick up shift.", details: "Unexpected scheduling error." },
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
      userId: session.user.id,
      assignedById: session.user.id,
    },
  });

  await emitRealtimeEvent("schedule.updated", {
    locationId: shift.locationId,
    shiftId: shift.id,
    assignmentId: assignment.id,
    action: "pickup",
  });

  return Response.json({ data: assignment }, { status: 201 });
}
