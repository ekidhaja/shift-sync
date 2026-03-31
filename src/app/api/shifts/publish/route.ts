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

async function assertLocationAccess(
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

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const locationId = typeof body?.locationId === "string" ? body.locationId : null;
  const weekStartDate = toDate(body?.weekStartDate);
  const publish = typeof body?.publish === "boolean" ? body.publish : true;

  if (!locationId || !weekStartDate) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const allowed = await assertLocationAccess(session.user.id, session.user.role, locationId);
  if (!allowed) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const scheduleWeek = await prisma.scheduleWeek.upsert({
    where: {
      locationId_weekStartDate: {
        locationId,
        weekStartDate,
      },
    },
    update: {
      isPublished: publish,
      publishedAt: publish ? new Date() : null,
    },
    create: {
      locationId,
      weekStartDate,
      isPublished: publish,
      publishedAt: publish ? new Date() : null,
    },
  });

  const shifts = await prisma.shift.findMany({
    where: {
      scheduleWeekId: scheduleWeek.id,
    },
    select: {
      id: true,
      startDateTime: true,
    },
  });

  if (!publish) {
    const blockedShift = shifts.find((shift: { id: string; startDateTime: Date }) => {
      const cutoffBoundary = shift.startDateTime.getTime() - (scheduleWeek.cutoffHours * 60 * 60 * 1000);
      return Date.now() >= cutoffBoundary;
    });

    if (blockedShift) {
      return Response.json(
        {
          error: "Publish cutoff reached",
          details: "Cannot unpublish a schedule once any shift is within cutoff.",
        },
        { status: 409 }
      );
    }
  }

  await prisma.shift.updateMany({
    where: { scheduleWeekId: scheduleWeek.id },
    data: {
      status: publish ? "PUBLISHED" : "DRAFT",
      publishedAt: publish ? new Date() : null,
    },
  });

  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      shift: {
        scheduleWeekId: scheduleWeek.id,
      },
    },
    select: {
      userId: true,
      shiftId: true,
    },
  });

  await createNotifications(
    prisma,
    assignments.map((entry) => ({
      userId: entry.userId,
      type: "SCHEDULE_UPDATED" as const,
      title: publish ? "Schedule published" : "Schedule unpublished",
      message: publish
        ? "Your schedule for this week has been published."
        : "A previously published schedule was reverted to draft.",
      shiftId: entry.shiftId,
      locationId,
    }))
  );

  await createAuditLog(prisma, {
    actorId: session.user.id,
    entityType: "SCHEDULE_WEEK",
    entityId: scheduleWeek.id,
    action: publish ? "PUBLISH" : "UNPUBLISH",
    locationId,
    afterState: {
      locationId,
      weekStartDate,
      isPublished: publish,
    },
  });

  await emitRealtimeEvent("schedule.updated", {
    locationId,
    scheduleWeekId: scheduleWeek.id,
    action: publish ? "publish" : "unpublish",
  });

  return Response.json({ data: scheduleWeek });
}
