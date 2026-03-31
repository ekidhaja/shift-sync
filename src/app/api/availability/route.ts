import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { availabilitySchema } from "@/lib/validation/availability";
import { canEditOwnAvailability } from "@/lib/rbac";
import { createNotifications } from "@/lib/notifications";
import { emitRealtimeEvent } from "@/lib/realtime.server";

type RecurringAvailabilityPayload = {
  type: "RECURRING";
  dayOfWeek?: number;
  dayOfWeeks?: number[];
  startMinute: number;
  endMinute: number;
  locationId?: string;
  locationIds?: string[];
};

type ExceptionAvailabilityPayload = {
  type: "EXCEPTION";
  startDateTime: string;
  endDateTime: string;
  locationId?: string;
  locationIds?: string[];
};

type AvailabilityPayload = RecurringAvailabilityPayload | ExceptionAvailabilityPayload;

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "code" in error && error.code === "P1001") {
    return "Database connection is temporarily unavailable. Please try again shortly.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function normalizeLocationIds(payload: AvailabilityPayload) {
  if (Array.isArray(payload.locationIds) && payload.locationIds.length > 0) {
    return Array.from(new Set(payload.locationIds));
  }

  if (payload.locationId) {
    return [payload.locationId];
  }

  return [];
}

function normalizeDayOfWeeks(payload: RecurringAvailabilityPayload) {
  if (Array.isArray(payload.dayOfWeeks) && payload.dayOfWeeks.length > 0) {
    return Array.from(new Set(payload.dayOfWeeks));
  }

  if (typeof payload.dayOfWeek === "number") {
    return [payload.dayOfWeek];
  }

  return [];
}

async function notifyManagersAboutAvailability(
  userId: string,
  userName: string | null | undefined,
  locationIds: string[],
  action: "created" | "updated"
) {
  if (locationIds.length === 0) {
    return;
  }

  const managerLinks = await prisma.managerLocation.findMany({
    where: {
      locationId: { in: locationIds },
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
      message: `${userName ?? "A staff member"} ${action} availability for ${entry.location.name}.`,
      locationId: entry.location.id,
      data: {
        staffUserId: userId,
        action,
      },
    }))
  );
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canEditOwnAvailability(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const certifiedLocations = await prisma.locationCertification.findMany({
      where: { userId: session.user.id },
      select: { locationId: true },
    });
    const certifiedLocationIds = certifiedLocations.map((entry) => entry.locationId);

    const availability = await prisma.availability.findMany({
      where: {
        userId: session.user.id,
        locationId: { in: certifiedLocationIds },
      },
      select: {
        id: true,
        type: true,
        dayOfWeek: true,
        startMinute: true,
        endMinute: true,
        startDateTime: true,
        endDateTime: true,
        locationId: true,
        location: {
          select: {
            name: true,
            timezone: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    return Response.json({
      data: availability.map((entry) => ({
        id: entry.id,
        type: entry.type,
        dayOfWeek: entry.dayOfWeek,
        startMinute: entry.startMinute,
        endMinute: entry.endMinute,
        startDateTime: entry.startDateTime?.toISOString() ?? null,
        endDateTime: entry.endDateTime?.toISOString() ?? null,
        locationId: entry.locationId,
        locationName: entry.location.name,
        locationTimezone: entry.location.timezone,
      })),
    });
  } catch (error) {
    return Response.json(
      {
        error: "Could not load availability.",
        details: getErrorMessage(error, "Failed to query availability data."),
      },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canEditOwnAvailability(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const parsed = availabilitySchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const payload = parsed.data as AvailabilityPayload;
  const locationIds = normalizeLocationIds(payload);

  if (locationIds.length === 0) {
    return Response.json(
      { error: "At least one location must be selected." },
      { status: 400 }
    );
  }

  const certifiedLocations = await prisma.locationCertification.findMany({
    where: { userId: session.user.id },
    select: { locationId: true },
  });
  const certifiedLocationIds = new Set(certifiedLocations.map((entry) => entry.locationId));

  const unauthorizedLocations = locationIds.filter((locationId) => !certifiedLocationIds.has(locationId));
  if (unauthorizedLocations.length > 0) {
    return Response.json(
      {
        error: "Forbidden",
        details: "You can only manage availability for your certified locations.",
      },
      { status: 403 }
    );
  }

  try {
    if (payload.type === "RECURRING") {
      const dayOfWeeks = normalizeDayOfWeeks(payload);

      if (dayOfWeeks.length === 0) {
        return Response.json(
          { error: "At least one day must be selected." },
          { status: 400 }
        );
      }

      const conflictingRecurring = await prisma.availability.findMany({
        where: {
          userId: session.user.id,
          type: "RECURRING",
          dayOfWeek: { in: dayOfWeeks },
          locationId: { in: locationIds },
          startMinute: { lt: payload.endMinute },
          endMinute: { gt: payload.startMinute },
        },
        select: {
          location: {
            select: { name: true },
          },
        },
      });

      if (conflictingRecurring.length > 0) {
        const conflictLocations = Array.from(new Set(conflictingRecurring.map((entry) => entry.location.name)));
        return Response.json(
          {
            error: "Availability conflict detected.",
            details: `Recurring availability overlaps an existing entry for: ${conflictLocations.join(", ")}.`,
          },
          { status: 409 }
        );
      }

      const createdEntries = await prisma.$transaction(
        locationIds.flatMap((locationId) =>
          dayOfWeeks.map((dayOfWeek) =>
            prisma.availability.create({
              data: {
                userId: session.user.id,
                type: payload.type,
                dayOfWeek,
                startMinute: payload.startMinute,
                endMinute: payload.endMinute,
                locationId,
              },
            })
          )
        )
      );

      await notifyManagersAboutAvailability(
        session.user.id,
        session.user.name,
        locationIds,
        "created"
      );

      await emitRealtimeEvent("availability.updated", {
        action: "created",
        userId: session.user.id,
        locationIds,
      });

      return Response.json({ data: createdEntries }, { status: 201 });
    }

    const exceptionStart = new Date(payload.startDateTime);
    const exceptionEnd = new Date(payload.endDateTime);

    const conflictingExceptions = await prisma.availability.findMany({
      where: {
        userId: session.user.id,
        type: "EXCEPTION",
        locationId: { in: locationIds },
        startDateTime: { lt: exceptionEnd },
        endDateTime: { gt: exceptionStart },
      },
      select: {
        location: {
          select: { name: true },
        },
      },
    });

    if (conflictingExceptions.length > 0) {
      const conflictLocations = Array.from(new Set(conflictingExceptions.map((entry) => entry.location.name)));
      return Response.json(
        {
          error: "Availability conflict detected.",
          details: `Exception availability overlaps an existing entry for: ${conflictLocations.join(", ")}.`,
        },
        { status: 409 }
      );
    }

    const createdEntries = await prisma.$transaction(
      locationIds.map((locationId) =>
        prisma.availability.create({
          data: {
            userId: session.user.id,
            type: payload.type,
            startDateTime: exceptionStart,
            endDateTime: exceptionEnd,
            locationId,
          },
        })
      )
    );

    await notifyManagersAboutAvailability(
      session.user.id,
      session.user.name,
      locationIds,
      "created"
    );

    await emitRealtimeEvent("availability.updated", {
      action: "created",
      userId: session.user.id,
      locationIds,
    });

    return Response.json({ data: createdEntries }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: "Could not save availability.",
        details: getErrorMessage(error, "Failed to create availability entry."),
      },
      { status: 503 }
    );
  }
}
