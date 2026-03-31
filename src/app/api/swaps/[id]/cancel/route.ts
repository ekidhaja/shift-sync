import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/scheduling";
import { createNotifications } from "@/lib/notifications";
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

  const swap = await prisma.swapRequest.findUnique({
    where: { id },
    include: {
      shift: { select: { locationId: true } },
    },
  });

  if (!swap) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = swap.requesterId === session.user.id;

  if (!isOwner) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!["PENDING_PEER", "PENDING_MANAGER", "APPROVED"].includes(swap.status)) {
    return Response.json(
      { error: "Invalid action", details: "Only pending or approved swaps can be canceled." },
      { status: 409 }
    );
  }

  const updated = await prisma.swapRequest.update({
    where: { id: swap.id },
    data: {
      status: "CANCELED",
      canceledAt: new Date(),
      cancelReason: "USER_CANCELED",
    },
  });

  const recipients = [swap.requesterId, swap.targetUserId].filter(
    (value): value is string => Boolean(value)
  );

  await createNotifications(
    prisma,
    recipients.map((userId) => ({
      userId,
      type: "SWAP_CANCELED",
      title: "Swap/drop canceled",
      message: "A swap/drop request was canceled.",
      shiftId: swap.shiftId,
      locationId: swap.shift.locationId,
      swapRequestId: swap.id,
    }))
  );

  await createAuditLog(prisma, {
    actorId: session.user.id,
    entityType: "SWAP_REQUEST",
    entityId: swap.id,
    action: "CANCEL_SWAP",
    shiftId: swap.shiftId,
    locationId: swap.shift.locationId,
    beforeState: { status: swap.status },
    afterState: {
      status: "CANCELED",
      cancelReason: "USER_CANCELED",
      requesterId: swap.requesterId,
      targetUserId: swap.targetUserId,
      shiftId: swap.shiftId,
      proposedShiftId: swap.proposedShiftId,
    },
  });

  await emitRealtimeEvent("swap.updated", {
    locationId: swap.shift.locationId,
    swapRequestId: swap.id,
    shiftId: swap.shiftId,
    action: "cancel",
  });

  return Response.json({ data: updated });
}
