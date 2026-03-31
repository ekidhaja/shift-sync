import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/scheduling";
import { createNotifications } from "@/lib/notifications";
import { emitRealtimeEvent } from "@/lib/realtime.server";

async function canManageLocation(userId: string, role: "ADMIN" | "MANAGER" | "STAFF" | undefined, locationId: string) {
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

  const swap = await prisma.swapRequest.findUnique({
    where: { id },
    include: {
      shift: { select: { locationId: true } },
    },
  });

  if (!swap) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const allowed = await canManageLocation(session.user.id, session.user.role, swap.shift.locationId);
  if (!allowed) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (swap.status !== "PENDING_MANAGER") {
    return Response.json(
      { error: "Invalid action", details: "Only pending manager requests can be decided." },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => null);
  const approve = body?.approve === true;

  if (approve) {
    await prisma.$transaction(async (tx) => {
      if (swap.type === "DROP") {
        await tx.shiftAssignment.deleteMany({
          where: {
            shiftId: swap.shiftId,
            userId: swap.requesterId,
          },
        });
      } else {
        if (!swap.targetUserId || !swap.proposedShiftId) {
          throw new Error("Swap is missing target metadata.");
        }

        await tx.shiftAssignment.updateMany({
          where: {
            shiftId: swap.shiftId,
            userId: swap.requesterId,
          },
          data: {
            userId: swap.targetUserId,
          },
        });

        await tx.shiftAssignment.updateMany({
          where: {
            shiftId: swap.proposedShiftId,
            userId: swap.targetUserId,
          },
          data: {
            userId: swap.requesterId,
          },
        });
      }

      await tx.swapRequest.update({
        where: { id: swap.id },
        data: {
          status: "APPROVED",
          managerId: session.user.id,
          actedAt: new Date(),
        },
      });
    });

    const recipients = [swap.requesterId, swap.targetUserId].filter(
      (value): value is string => Boolean(value)
    );

    await createNotifications(
      prisma,
      recipients.map((userId) => ({
        userId,
        type: "SWAP_APPROVED",
        title: "Swap/drop approved",
        message: "Your swap/drop request has been approved.",
        shiftId: swap.shiftId,
        locationId: swap.shift.locationId,
        swapRequestId: swap.id,
      }))
    );

    await createAuditLog(prisma, {
      actorId: session.user.id,
      entityType: "SWAP_REQUEST",
      entityId: swap.id,
      action: "APPROVE_SWAP",
      shiftId: swap.shiftId,
      locationId: swap.shift.locationId,
      beforeState: { status: swap.status },
      afterState: {
        status: "APPROVED",
        requesterId: swap.requesterId,
        targetUserId: swap.targetUserId,
        managerId: session.user.id,
        shiftId: swap.shiftId,
        proposedShiftId: swap.proposedShiftId,
      },
    });

    await emitRealtimeEvent("swap.updated", {
      locationId: swap.shift.locationId,
      swapRequestId: swap.id,
      shiftId: swap.shiftId,
      action: "approve",
    });

    await emitRealtimeEvent("schedule.updated", {
      locationId: swap.shift.locationId,
      shiftId: swap.shiftId,
      action: "swap_approved_assignment_change",
    });

    return Response.json({ status: "approved" });
  }

  const updated = await prisma.swapRequest.update({
    where: { id: swap.id },
    data: {
      status: "REJECTED",
      managerId: session.user.id,
      actedAt: new Date(),
    },
  });

  const recipients = [swap.requesterId, swap.targetUserId].filter(
    (value): value is string => Boolean(value)
  );

  await createNotifications(
    prisma,
    recipients.map((userId) => ({
      userId,
      type: "SWAP_REJECTED",
      title: "Swap/drop rejected",
      message: "Your swap/drop request has been rejected.",
      shiftId: swap.shiftId,
      locationId: swap.shift.locationId,
      swapRequestId: swap.id,
    }))
  );

  await createAuditLog(prisma, {
    actorId: session.user.id,
    entityType: "SWAP_REQUEST",
    entityId: swap.id,
    action: "REJECT_SWAP",
    shiftId: swap.shiftId,
    locationId: swap.shift.locationId,
    beforeState: { status: swap.status },
    afterState: {
      status: "REJECTED",
      requesterId: swap.requesterId,
      targetUserId: swap.targetUserId,
      managerId: session.user.id,
      shiftId: swap.shiftId,
      proposedShiftId: swap.proposedShiftId,
    },
  });

  await emitRealtimeEvent("swap.updated", {
    locationId: swap.shift.locationId,
    swapRequestId: swap.id,
    shiftId: swap.shiftId,
    action: "reject",
  });

  return Response.json({ data: updated });
}
