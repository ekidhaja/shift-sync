import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCompliancePreviewForShift } from "@/lib/compliance";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const shiftId = typeof body?.shiftId === "string" ? body.shiftId : null;
  const userId = typeof body?.userId === "string" ? body.userId : session.user.id;

  if (!shiftId) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: { id: true, locationId: true },
  });

  if (!shift) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (session.user.role === "MANAGER") {
    const link = await prisma.managerLocation.findUnique({
      where: {
        userId_locationId: {
          userId: session.user.id,
          locationId: shift.locationId,
        },
      },
      select: { userId: true },
    });

    if (!link) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const preview = await getCompliancePreviewForShift(prisma, {
    userId,
    shiftId: shift.id,
  });

  if (!preview) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ data: preview });
}
