import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  });

  if (!existingUser) {
    return Response.json(
      { error: "Session expired. Please sign in again." },
      { status: 401 }
    );
  }

  if (existingUser.role !== "ADMIN" && existingUser.role !== "MANAGER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const managedLocationIds = existingUser.role === "MANAGER"
    ? (await prisma.managerLocation.findMany({
        where: { userId: existingUser.id },
        select: { locationId: true },
      })).map((entry) => entry.locationId)
    : undefined;

  const locationWhere = managedLocationIds
    ? { id: { in: managedLocationIds } }
    : undefined;

  const rawLocations = await prisma.location.findMany({
    where: locationWhere,
    orderBy: { name: "asc" },
    select: { id: true, name: true, timezone: true },
  });

  const locationMap = new Map<string, { id: string; name: string; timezone: string }>();
  for (const location of rawLocations) {
    const key = `${location.name.trim().toLowerCase()}::${location.timezone.trim().toLowerCase()}`;
    if (!locationMap.has(key)) {
      locationMap.set(key, location);
    }
  }

  const locations = Array.from(locationMap.values());

  const skills = await prisma.skill.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
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
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      certifications: {
        select: { locationId: true },
      },
      skills: {
        select: { skillId: true },
      },
    },
  });

  return Response.json({
    data: {
      locations,
      skills,
      staff,
    },
  });
}
