import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { emitRealtimeEvent } from "@/lib/realtime.server";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const unreadCount = await prisma.notification.count({
    where: {
      userId: session.user.id,
      readAt: null,
    },
  });

  return Response.json({
    data: notifications,
    unreadCount,
    simulatedEmailRecipient: session.user.email ?? null,
  });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const notificationId = typeof body?.notificationId === "string" ? body.notificationId : null;
  const markAll = body?.markAll === true;

  if (markAll) {
    await prisma.notification.updateMany({
      where: {
        userId: session.user.id,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    await emitRealtimeEvent("notifications.updated", {
      userId: session.user.id,
      action: "mark_all_read",
    });

    return Response.json({ status: "ok" });
  }

  if (!notificationId) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { id: true, userId: true },
  });

  if (!notification || notification.userId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });

  await emitRealtimeEvent("notifications.updated", {
    userId: session.user.id,
    notificationId,
    action: "mark_read",
  });

  return Response.json({ data: updated });
}
