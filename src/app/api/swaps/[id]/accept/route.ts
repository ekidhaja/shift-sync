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

  if (swap.status !== "PENDING_PEER" || swap.targetUserId !== session.user.id) {
    return Response.json(
      { error: "Invalid action", details: "Only target staff can accept a pending peer swap." },
      { status: 409 }
    );
  }

  const updated = await prisma.swapRequest.update({
    where: { id: swap.id },
    data: {
      status: "PENDING_MANAGER",
    },
  });

  const managers = await prisma.managerLocation.findMany({
    where: { locationId: swap.shift.locationId },
    select: { userId: true },
  });

  await createNotifications(
    prisma,
    managers.map((manager) => ({
      userId: manager.userId,
      type: "SWAP_ACCEPTED",
      title: "Swap awaiting manager approval",
      message: "A staff swap has been accepted and needs manager approval.",
      shiftId: swap.shiftId,
      locationId: swap.shift.locationId,
      swapRequestId: swap.id,
    }))
  );

  await createAuditLog(prisma, {
    actorId: session.user.id,
    entityType: "SWAP_REQUEST",
    entityId: swap.id,
    action: "ACCEPT_SWAP",
    shiftId: swap.shiftId,
    locationId: swap.shift.locationId,
    beforeState: { status: swap.status },
    afterState: {
      status: "PENDING_MANAGER",
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
    action: "accept",
  });

  return Response.json({ data: updated });
}
