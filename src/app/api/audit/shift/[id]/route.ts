import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role === "STAFF") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const shift = await prisma.shift.findUnique({
    where: { id },
    select: { id: true, locationId: true },
  });

  if (!shift) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (session.user.role === "MANAGER") {
    const allowed = await prisma.managerLocation.findUnique({
      where: {
        userId_locationId: {
          userId: session.user.id,
          locationId: shift.locationId,
        },
      },
      select: { userId: true },
    });

    if (!allowed) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const logs = await prisma.auditLog.findMany({
    where: { shiftId: id },
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const relatedSwapRequests = await prisma.swapRequest.findMany({
    where: {
      OR: [
        { shiftId: id },
        { proposedShiftId: id },
      ],
    },
    select: { id: true },
  });

  const relatedSwapRequestIds = relatedSwapRequests.map((entry) => entry.id);

  const swapLogs = relatedSwapRequestIds.length > 0
    ? await prisma.auditLog.findMany({
        where: {
          entityType: "SWAP_REQUEST",
          entityId: { in: relatedSwapRequestIds },
        },
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      })
    : [];

  const deduped = new Map<string, (typeof logs)[number]>();
  for (const log of [...logs, ...swapLogs]) {
    if (!deduped.has(log.id)) {
      deduped.set(log.id, log);
    }
  }

  const combinedLogs = Array.from(deduped.values()).sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
  ).slice(0, 500);

  return Response.json({ data: combinedLogs });
}
