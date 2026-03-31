import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const managedLocationIds = session.user.role === "MANAGER"
    ? (await prisma.managerLocation.findMany({
        where: { userId: session.user.id },
        select: { locationId: true },
      })).map((entry) => entry.locationId)
    : undefined;

  const locations = await prisma.location.findMany({
    where: managedLocationIds ? { id: { in: managedLocationIds } } : undefined,
    select: { id: true, name: true, timezone: true },
    orderBy: { name: "asc" },
  });

  const staff = await prisma.user.findMany({
    where: {
      role: "STAFF",
      certifications: managedLocationIds
        ? {
            some: {
              locationId: { in: managedLocationIds },
            },
          }
        : undefined,
    },
    select: {
      id: true,
      name: true,
      email: true,
      certifications: {
        select: {
          locationId: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const shifts = await prisma.shift.findMany({
    where: {
      locationId: managedLocationIds ? { in: managedLocationIds } : undefined,
    },
    select: {
      id: true,
      locationId: true,
      startDateTime: true,
      endDateTime: true,
      location: {
        select: {
          id: true,
          name: true,
          timezone: true,
        },
      },
    },
    orderBy: { startDateTime: "desc" },
    take: 300,
  });

  return Response.json({
    data: {
      locations,
      staff,
      shifts,
    },
  });
}
