import type { NotificationType, PrismaClient } from "@prisma/client";
import { emitRealtimeEvent } from "@/lib/realtime.server";

export async function createNotification(
  prisma: PrismaClient,
  args: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    data?: unknown;
    shiftId?: string;
    locationId?: string;
    swapRequestId?: string;
  }
) {
  const created = await prisma.notification.create({
    data: {
      userId: args.userId,
      type: args.type,
      title: args.title,
      message: args.message,
      data: args.data as never,
      shiftId: args.shiftId,
      locationId: args.locationId,
      swapRequestId: args.swapRequestId,
    },
  });

  await emitRealtimeEvent("notifications.updated", {
    userId: args.userId,
    action: "created",
    notificationId: created.id,
  });

  return created;
}

export async function createNotifications(
  prisma: PrismaClient,
  notifications: Array<{
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    data?: unknown;
    shiftId?: string;
    locationId?: string;
    swapRequestId?: string;
  }>
) {
  if (notifications.length === 0) {
    return;
  }

  await prisma.notification.createMany({
    data: notifications.map((entry) => ({
      userId: entry.userId,
      type: entry.type,
      title: entry.title,
      message: entry.message,
      data: entry.data as never,
      shiftId: entry.shiftId,
      locationId: entry.locationId,
      swapRequestId: entry.swapRequestId,
    })),
  });

  const uniqueUserIds = Array.from(new Set(notifications.map((entry) => entry.userId)));
  await Promise.all(
    uniqueUserIds.map((userId) => emitRealtimeEvent("notifications.updated", {
      userId,
      action: "created",
    }))
  );
}
