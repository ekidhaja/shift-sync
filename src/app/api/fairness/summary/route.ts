import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFairnessSummary } from "@/lib/fairness";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const locationId = url.searchParams.get("locationId") ?? undefined;
  const weekStartDate = url.searchParams.get("weekStartDate");
  const managedLocationIds = session.user.role === "MANAGER"
    ? (await prisma.managerLocation.findMany({
        where: { userId: session.user.id },
        select: { locationId: true },
      })).map((entry) => entry.locationId)
    : undefined;

  if (session.user.role === "MANAGER" && locationId) {
    const link = await prisma.managerLocation.findUnique({
      where: {
        userId_locationId: {
          userId: session.user.id,
          locationId,
        },
      },
    });

    if (!link) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const summary = await getFairnessSummary(prisma, {
    locationId,
    locationIds: session.user.role === "MANAGER" && !locationId ? managedLocationIds : undefined,
    weekStartDate: weekStartDate ? new Date(weekStartDate) : undefined,
  });

  return Response.json({ data: summary });
}
