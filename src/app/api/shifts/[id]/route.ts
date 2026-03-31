import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/scheduling";
import { createNotifications } from "@/lib/notifications";
import { emitRealtimeEvent } from "@/lib/realtime.server";

function toDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existingShift = await prisma.shift.findUnique({
    where: { id },
    include: { scheduleWeek: true },
  });

  if (!existingShift) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const allowed = await canManageShift(
    session.user.id,
    session.user.role,
    existingShift.locationId
  );

  if (!allowed) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (
    existingShift.status === "PUBLISHED"
    && isWithinPublishCutoff(existingShift.startDateTime, existingShift.scheduleWeek.cutoffHours)
  ) {
    return Response.json(
      {
        error: "Publish cutoff reached",
        details: "Published shifts cannot be edited inside the cutoff window.",
      },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => null);
  const nextStart = body?.startDateTime ? toDate(body.startDateTime) : existingShift.startDateTime;
  const nextEnd = body?.endDateTime ? toDate(body.endDateTime) : existingShift.endDateTime;
  const nextHeadcount = Number.isInteger(body?.headcount) ? body.headcount : existingShift.headcount;

  if (!nextStart || !nextEnd || nextEnd <= nextStart) {
    return Response.json(
      { error: "Invalid payload", details: "Invalid shift time range." },
      { status: 400 }
    );
  }

  const beforeState = {
    startDateTime: existingShift.startDateTime,
    endDateTime: existingShift.endDateTime,
    headcount: existingShift.headcount,
    requiredSkillId: existingShift.requiredSkillId,
  };

  const updatedShift = await prisma.shift.update({
    where: { id },
    data: {
      startDateTime: nextStart,
      endDateTime: nextEnd,
      headcount: nextHeadcount,
      requiredSkillId:
        typeof body?.requiredSkillId === "string"
          ? body.requiredSkillId
          : existingShift.requiredSkillId,
    },
  });

  const assignedStaff = await prisma.shiftAssignment.findMany({
    where: { shiftId: updatedShift.id },
    select: { userId: true },
  });

  const affectedSwapRequests = await prisma.swapRequest.findMany({
    where: {
      status: {
        in: ["PENDING_PEER", "PENDING_MANAGER", "APPROVED"],
      },
      OR: [
        { shiftId: updatedShift.id },
        { proposedShiftId: updatedShift.id },
      ],
    },
    select: {
      id: true,
      status: true,
      requesterId: true,
      targetUserId: true,
      shiftId: true,
      shift: {
        select: {
          locationId: true,
        },
      },
    },
  });

  if (affectedSwapRequests.length > 0) {
    await prisma.swapRequest.updateMany({
      where: {
        id: { in: affectedSwapRequests.map((entry) => entry.id) },
      },
      data: {
        status: "CANCELED",
        canceledAt: new Date(),
        cancelReason: "SHIFT_EDITED",
      },
    });

    await Promise.all(
      affectedSwapRequests.map((entry) => createAuditLog(prisma, {
        actorId: session.user.id,
        entityType: "SWAP_REQUEST",
        entityId: entry.id,
        action: "CANCEL_SWAP",
        shiftId: entry.shiftId,
        locationId: entry.shift.locationId,
        beforeState: {
          status: entry.status,
        },
        afterState: {
          status: "CANCELED",
          cancelReason: "SHIFT_EDITED",
          shiftId: entry.shiftId,
        },
      }))
    );

    const notifications = affectedSwapRequests.flatMap((entry) => {
      const recipients = [entry.requesterId, entry.targetUserId].filter(
        (value): value is string => Boolean(value)
      );

      return recipients.map((userId) => ({
        userId,
        type: "SWAP_CANCELED" as const,
        title: "Swap canceled after shift edit",
        message: "A related shift was edited, so the swap request was canceled.",
        shiftId: entry.shiftId,
        locationId: entry.shift.locationId,
        swapRequestId: entry.id,
      }));
    });

    await createNotifications(prisma, notifications);
  }

  await createAuditLog(prisma, {
    actorId: session.user.id,
    entityType: "SHIFT",
    entityId: updatedShift.id,
    action: "UPDATE",
    locationId: updatedShift.locationId,
    shiftId: updatedShift.id,
    beforeState,
    afterState: {
      startDateTime: updatedShift.startDateTime,
      endDateTime: updatedShift.endDateTime,
      headcount: updatedShift.headcount,
      requiredSkillId: updatedShift.requiredSkillId,
    },
  });

  await createNotifications(
    prisma,
    assignedStaff.map((entry) => ({
      userId: entry.userId,
      type: "SCHEDULE_UPDATED" as const,
      title: "Shift updated",
      message: "A shift on your schedule was updated.",
      shiftId: updatedShift.id,
      locationId: updatedShift.locationId,
    }))
  );

  await emitRealtimeEvent("schedule.updated", {
    locationId: updatedShift.locationId,
    shiftId: updatedShift.id,
    action: "update",
  });

  if (affectedSwapRequests.length > 0) {
    await emitRealtimeEvent("swap.updated", {
      locationId: updatedShift.locationId,
      shiftId: updatedShift.id,
      action: "canceled_due_to_shift_edit",
      affectedSwapRequestIds: affectedSwapRequests.map((entry) => entry.id),
    });
  }

  return Response.json({ data: updatedShift });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existingShift = await prisma.shift.findUnique({
    where: { id },
    include: { scheduleWeek: true },
  });

  if (!existingShift) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const allowed = await canManageShift(
    session.user.id,
    session.user.role,
    existingShift.locationId
  );

  if (!allowed) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (
    existingShift.status === "PUBLISHED"
    && isWithinPublishCutoff(existingShift.startDateTime, existingShift.scheduleWeek.cutoffHours)
  ) {
    return Response.json(
      {
        error: "Publish cutoff reached",
        details: "Published shifts cannot be deleted inside the cutoff window.",
      },
      { status: 409 }
    );
  }

  const assignedStaff = await prisma.shiftAssignment.findMany({
    where: { shiftId: existingShift.id },
    select: { userId: true },
  });

  await createAuditLog(prisma, {
    actorId: session.user.id,
    entityType: "SHIFT",
    entityId: existingShift.id,
    action: "DELETE",
    locationId: existingShift.locationId,
    shiftId: existingShift.id,
    beforeState: {
      startDateTime: existingShift.startDateTime,
      endDateTime: existingShift.endDateTime,
      headcount: existingShift.headcount,
      requiredSkillId: existingShift.requiredSkillId,
    },
  });

  await prisma.shift.delete({ where: { id } });

  await createNotifications(
    prisma,
    assignedStaff.map((entry) => ({
      userId: entry.userId,
      type: "SCHEDULE_UPDATED" as const,
      title: "Shift removed",
      message: "A shift on your schedule was removed.",
      locationId: existingShift.locationId,
    }))
  );

  await emitRealtimeEvent("schedule.updated", {
    locationId: existingShift.locationId,
    shiftId: existingShift.id,
    action: "delete",
  });

  return Response.json({ status: "deleted" });
}
