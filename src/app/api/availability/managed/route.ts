import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewManagedAvailability } from "@/lib/rbac";

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "code" in error && error.code === "P1001") {
    return "Database connection is temporarily unavailable. Please try again shortly.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canViewManagedAvailability(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const requestUrl = new URL(request.url);
  const requestedLocationId = requestUrl.searchParams.get("locationId") ?? "";
  const requestedUserId = requestUrl.searchParams.get("userId") ?? "";

  try {
    let allowedLocationIds: string[] = [];

    if (session.user.role === "ADMIN") {
      const allLocations = await prisma.location.findMany({
        select: { id: true },
      });
      allowedLocationIds = allLocations.map((entry) => entry.id);
    } else {
      const managerLocations = await prisma.managerLocation.findMany({
        where: { userId: session.user.id },
        select: { locationId: true },
      });
      allowedLocationIds = managerLocations.map((entry) => entry.locationId);
    }

    if (allowedLocationIds.length === 0) {
      return Response.json({ data: [], filters: { locations: [], users: [] } });
    }

    const scopedLocationIds = requestedLocationId
      ? allowedLocationIds.filter((locationId) => locationId === requestedLocationId)
      : allowedLocationIds;

    if (requestedLocationId && scopedLocationIds.length === 0) {
      return Response.json({ error: "Forbidden location scope." }, { status: 403 });
    }

    if (scopedLocationIds.length === 0) {
      return Response.json({ data: [], filters: { locations: [], users: [] } });
    }

    const [locationOptions, userOptions] = await Promise.all([
      prisma.location.findMany({
        where: { id: { in: allowedLocationIds } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.user.findMany({
        where: {
          role: "STAFF",
          availabilities: {
            some: {
              locationId: { in: scopedLocationIds },
            },
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
        orderBy: [{ name: "asc" }, { email: "asc" }],
      }),
    ]);

    const availabilityEntries = await prisma.availability.findMany({
      where: {
        locationId: { in: scopedLocationIds },
        ...(requestedUserId ? { userId: requestedUserId } : {}),
      },
      select: {
        id: true,
        type: true,
        dayOfWeek: true,
        startMinute: true,
        endMinute: true,
        startDateTime: true,
        endDateTime: true,
        userId: true,
        user: {
          select: {
            name: true,
            email: true,
            role: true,
          },
        },
        locationId: true,
        location: {
          select: {
            name: true,
            timezone: true,
          },
        },
      },
      orderBy: [{ location: { name: "asc" } }, { createdAt: "desc" }],
    });

    const filteredEntries = availabilityEntries
      .filter((entry) => entry.user.role === "STAFF")
      .map((entry) => ({
        id: entry.id,
        type: entry.type,
        dayOfWeek: entry.dayOfWeek,
        startMinute: entry.startMinute,
        endMinute: entry.endMinute,
        startDateTime: entry.startDateTime?.toISOString() ?? null,
        endDateTime: entry.endDateTime?.toISOString() ?? null,
        userId: entry.userId,
        userName: entry.user.name,
        userEmail: entry.user.email,
        locationId: entry.locationId,
        locationName: entry.location.name,
        locationTimezone: entry.location.timezone,
      }));

    return Response.json({
      data: filteredEntries,
      filters: {
        locations: locationOptions,
        users: userOptions,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: "Could not load managed availability.",
        details: getErrorMessage(error, "Failed to query managed availability."),
      },
      { status: 503 }
    );
  }
}
