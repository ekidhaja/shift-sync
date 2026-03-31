import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AvailabilityForm } from "@/components/availability-form";
import {
  Card,
  CardContent,
  CardHeader,
  InlineAlert,
  ManagerAvailabilityTimeline,
} from "@/components";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  noStore();

  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  let locations: Array<{ id: string; name: string }> = [];
  let loadError: string | null = null;

  const isStaff = session.user.role === "STAFF";
  const isManager = session.user.role === "MANAGER";
  const isAdmin = session.user.role === "ADMIN";

  if (isStaff) {
    try {
      const staffUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          certifications: {
            select: {
              location: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: {
              location: {
                name: "asc",
              },
            },
          },
        },
      });

      const seen = new Set<string>();
      locations = (staffUser?.certifications ?? [])
        .map((entry) => entry.location)
        .filter((location) => {
          if (seen.has(location.id)) {
            return false;
          }
          seen.add(location.id);
          return true;
        });
    } catch {
      loadError = "Availability is temporarily unavailable. Please refresh in a moment.";
    }
  }

  const fallbackLocation = locations[0]?.id;

  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold text-zinc-900">Availability</h1>
        <p className="text-sm text-zinc-600">
          {isStaff
            ? "Define recurring windows or one-off exceptions."
            : "View staff availability with location and staff filters."}
        </p>
      </CardHeader>
      <CardContent>
        {!isStaff && !isManager && !isAdmin ? (
          <InlineAlert variant="error">Availability management is not enabled for this role.</InlineAlert>
        ) : isManager || isAdmin ? (
          <ManagerAvailabilityTimeline />
        ) : loadError ? (
          <InlineAlert variant="error">{loadError}</InlineAlert>
        ) : fallbackLocation ? (
          <AvailabilityForm
            locationId={fallbackLocation}
            locations={locations}
            submitPath="/api/availability"
            submitMethod="POST"
          />
        ) : (
          <p className="text-sm text-zinc-600">No locations available yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
