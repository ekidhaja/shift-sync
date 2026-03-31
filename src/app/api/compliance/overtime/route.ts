import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { getWeekStartDate, hoursBetweenDates } from "@/lib/scheduling";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const locationId = url.searchParams.get("locationId");
  const dateParam = url.searchParams.get("weekStartDate");
  const weekStart = getWeekStartDate(dateParam ? new Date(dateParam) : new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const managedLocationIds = session.user.role === "MANAGER"
    ? (await prisma.managerLocation.findMany({
        where: { userId: session.user.id },
        select: { locationId: true },
      })).map((entry) => entry.locationId)
    : undefined;

  if (
    session.user.role === "MANAGER"
    && locationId
    && !managedLocationIds?.includes(locationId)
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      shift: {
        startDateTime: { gte: weekStart, lt: weekEnd },
        locationId: locationId
          ? locationId
          : managedLocationIds
            ? { in: managedLocationIds }
            : undefined,
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      shift: {
        select: {
          id: true,
          startDateTime: true,
          endDateTime: true,
          location: { select: { id: true, name: true } },
        },
      },
    },
  });

  const byUser = new Map<string, { userId: string; name: string | null; email: string | null; totalHours: number }>();

  for (const assignment of assignments) {
    const current = byUser.get(assignment.userId) ?? {
      userId: assignment.userId,
      name: assignment.user.name,
      email: assignment.user.email,
      totalHours: 0,
    };

    current.totalHours += Math.max(
      0,
      hoursBetweenDates(assignment.shift.startDateTime, assignment.shift.endDateTime)
    );
    byUser.set(assignment.userId, current);
  }

  const overtimeRisk = Array.from(byUser.values()).filter((entry) => entry.totalHours >= 35);

  if (overtimeRisk.length > 0) {
    const existingAlert = await prisma.notification.findFirst({
      where: {
        userId: session.user.id,
        type: "CONFLICT_ALERT",
        createdAt: {
          gte: weekStart,
          lt: weekEnd,
        },
      },
      select: { id: true },
    });

    if (!existingAlert) {
      await createNotification(prisma, {
        userId: session.user.id,
        type: "CONFLICT_ALERT",
        title: "Overtime risk detected",
        message: `${overtimeRisk.length} staff member(s) are approaching overtime this week.`,
        locationId: locationId ?? undefined,
        data: {
          weekStartDate: weekStart,
          weekEndDate: weekEnd,
          staffCount: overtimeRisk.length,
        },
      });
    }
  }

  return Response.json({
    data: {
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      overtimeRisk,
    },
  });
}
