import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditOwnAvailability } from "@/lib/rbac";
import { createNotifications } from "@/lib/notifications";
import { emitRealtimeEvent } from "@/lib/realtime.server";

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "P1001") {
    return "Database connection is temporarily unavailable. Please try again shortly.";
  }

  return "Could not delete availability right now.";
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

  if (!canEditOwnAvailability(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let availability: { userId: string; locationId: string } | null = null;
  try {
    availability = await prisma.availability.findUnique({
      where: { id },
      select: { userId: true, locationId: true },
    });
  } catch (error) {
    return Response.json(
      { error: getErrorMessage(error) },
      { status: 503 }
    );
  }

  if (!availability || availability.userId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await prisma.availability.delete({ where: { id } });

    const managerLinks = await prisma.managerLocation.findMany({
      where: {
        locationId: availability.locationId,
      },
      include: {
        location: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await createNotifications(
      prisma,
      managerLinks.map((entry) => ({
        userId: entry.userId,
        type: "GENERAL" as const,
        title: "Staff availability updated",
        message: `${session.user.name ?? "A staff member"} updated availability for ${entry.location.name}.`,
        locationId: entry.location.id,
        data: {
          staffUserId: session.user.id,
          action: "deleted",
        },
      }))
    );

    await emitRealtimeEvent("availability.updated", {
      action: "deleted",
      userId: session.user.id,
      locationId: availability.locationId,
    });
  } catch (error) {
    return Response.json(
      { error: getErrorMessage(error) },
      { status: 503 }
    );
  }

  return Response.json({ status: "deleted" });
}
