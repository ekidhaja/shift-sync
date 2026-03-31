import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/scheduling";
import { createNotification, createNotifications } from "@/lib/notifications";
import { emitRealtimeEvent } from "@/lib/realtime.server";
import {
  expireOldSwapRequests,
  getDropExpiryDate,
  getPendingSwapCount,
  isPastDropExpiry,
} from "@/lib/swaps";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await expireOldSwapRequests(prisma);

  if (session.user.role === "STAFF") {
    const requests = await prisma.swapRequest.findMany({
      where: {
        OR: [
          { requesterId: session.user.id },
          { targetUserId: session.user.id },
        ],
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        targetUser: { select: { id: true, name: true, email: true } },
        manager: { select: { id: true, name: true, email: true } },
        shift: {
          select: {
            id: true,
            locationId: true,
            startDateTime: true,
            endDateTime: true,
            location: { select: { name: true, timezone: true } },
          },
        },
        proposedShift: {
          select: {
            id: true,
            startDateTime: true,
            endDateTime: true,
            location: { select: { name: true, timezone: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ data: requests });
  }

  const managedLocationIds = session.user.role === "MANAGER"
    ? (await prisma.managerLocation.findMany({
        where: { userId: session.user.id },
        select: { locationId: true },
      })).map((entry) => entry.locationId)
    : undefined;

  const requests = await prisma.swapRequest.findMany({
    where: {
      status: "PENDING_MANAGER",
      shift: {
        locationId: managedLocationIds ? { in: managedLocationIds } : undefined,
      },
    },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      targetUser: { select: { id: true, name: true, email: true } },
      shift: {
        select: {
          id: true,
          locationId: true,
          startDateTime: true,
          endDateTime: true,
          location: { select: { name: true, timezone: true } },
        },
      },
      proposedShift: {
        select: {
          id: true,
          startDateTime: true,
          endDateTime: true,
          location: { select: { name: true, timezone: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ data: requests });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "STAFF") {
    return Response.json(
      { error: "Forbidden", details: "Only staff can create swap or drop requests." },
      { status: 403 }
    );
  }

  const pendingCount = await getPendingSwapCount(prisma, session.user.id);
  if (pendingCount >= 3) {
    return Response.json(
      { error: "Pending request limit reached", details: "You can have at most 3 pending swap/drop requests." },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => null);
  const type = body?.type === "DROP" || body?.type === "SWAP" ? body.type : null;
  const shiftId = typeof body?.shiftId === "string" ? body.shiftId : null;
  const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId : null;
  const proposedShiftId = typeof body?.proposedShiftId === "string" ? body.proposedShiftId : null;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : null;

  if (!type || !shiftId) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const requesterAssignment = await prisma.shiftAssignment.findFirst({
    where: {
      userId: session.user.id,
      shiftId,
    },
    include: {
      shift: {
        include: {
          location: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!requesterAssignment) {
    return Response.json(
      { error: "Invalid request", details: "You must be assigned to the shift to request swap/drop." },
      { status: 409 }
    );
  }

  if (isPastDropExpiry(requesterAssignment.shift.startDateTime)) {
    return Response.json(
      { error: "Drop expiry reached", details: "Drop requests expire 24 hours before shift start." },
      { status: 409 }
    );
  }

  if (type === "DROP") {
    const dropRequest = await prisma.swapRequest.create({
      data: {
        type: "DROP",
        status: "PENDING_MANAGER",
        requesterId: session.user.id,
        shiftId,
        reason,
        expiresAt: getDropExpiryDate(requesterAssignment.shift.startDateTime),
      },
    });

    const managers = await prisma.managerLocation.findMany({
      where: { locationId: requesterAssignment.shift.locationId },
      select: { userId: true },
    });

    await createNotifications(
      prisma,
      managers.map((manager) => ({
        userId: manager.userId,
        type: "DROP_REQUEST",
        title: "New drop request",
        message: `${session.user.name ?? "A staff member"} requested shift drop approval.`,
        shiftId,
        locationId: requesterAssignment.shift.locationId,
        swapRequestId: dropRequest.id,
      }))
    );

    await createAuditLog(prisma, {
      actorId: session.user.id,
      entityType: "SWAP_REQUEST",
      entityId: dropRequest.id,
      action: "REQUEST_SWAP",
      shiftId,
      locationId: requesterAssignment.shift.locationId,
      afterState: {
        type: "DROP",
        status: "PENDING_MANAGER",
        shiftId,
        requesterId: session.user.id,
      },
    });

    await emitRealtimeEvent("swap.updated", {
      locationId: requesterAssignment.shift.locationId,
      swapRequestId: dropRequest.id,
      shiftId,
      action: "create_drop",
    });

    return Response.json({ data: dropRequest }, { status: 201 });
  }

  if (!targetUserId || !proposedShiftId) {
    return Response.json(
      { error: "Invalid payload", details: "Swap requests require targetUserId and proposedShiftId." },
      { status: 400 }
    );
  }

  const targetAssignment = await prisma.shiftAssignment.findFirst({
    where: {
      userId: targetUserId,
      shiftId: proposedShiftId,
    },
  });

  if (!targetAssignment) {
    return Response.json(
      { error: "Invalid swap", details: "Target staff must be assigned to proposed shift." },
      { status: 409 }
    );
  }

  const swapRequest = await prisma.swapRequest.create({
    data: {
      type: "SWAP",
      status: "PENDING_PEER",
      requesterId: session.user.id,
      targetUserId,
      shiftId,
      proposedShiftId,
      reason,
      expiresAt: getDropExpiryDate(requesterAssignment.shift.startDateTime),
    },
  });

  await createNotification(prisma, {
    userId: targetUserId,
    type: "SWAP_REQUEST",
    title: "Swap request pending your response",
    message: `${session.user.name ?? "A staff member"} requested a shift swap with you.`,
    shiftId,
    locationId: requesterAssignment.shift.locationId,
    swapRequestId: swapRequest.id,
  });

  await createAuditLog(prisma, {
    actorId: session.user.id,
    entityType: "SWAP_REQUEST",
    entityId: swapRequest.id,
    action: "REQUEST_SWAP",
    shiftId,
    locationId: requesterAssignment.shift.locationId,
    afterState: {
      type: "SWAP",
      status: "PENDING_PEER",
      shiftId,
      proposedShiftId,
      requesterId: session.user.id,
      targetUserId,
    },
  });

  await emitRealtimeEvent("swap.updated", {
    locationId: requesterAssignment.shift.locationId,
    swapRequestId: swapRequest.id,
    shiftId,
    action: "create_swap",
  });

  return Response.json({ data: swapRequest }, { status: 201 });
}
