import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge, Card, CardContent, CardHeader, InlineAlert } from "@/components";
import { ProfileForm } from "@/components/profile-form";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  let user: {
    name: string | null;
    role: "ADMIN" | "MANAGER" | "STAFF";
    desiredWeeklyHours: number;
    skills: Array<{ skill: { name: string } }>;
    certifications: Array<{ location: { name: string } }>;
    managerLocations: Array<{ location: { name: string } }>;
  } | null = null;
  let loadError: string | null = null;

  try {
    user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        role: true,
        desiredWeeklyHours: true,
        skills: {
          select: {
            skill: {
              select: {
                name: true,
              },
            },
          },
          orderBy: {
            skill: {
              name: "asc",
            },
          },
        },
        certifications: {
          select: {
            location: {
              select: {
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
        managerLocations: {
          select: {
            location: {
              select: {
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
  } catch {
    loadError = "Profile is temporarily unavailable. Please refresh in a moment.";
  }

  const skillNames = user?.skills.map((entry) => entry.skill.name) ?? [];
  const certifiedLocationNames = user?.certifications.map((entry) => entry.location.name) ?? [];
  const managerLocationNames = user?.managerLocations.map((entry) => entry.location.name) ?? [];

  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold text-zinc-900">Profile</h1>
        <p className="text-sm text-zinc-600">
          Update your personal information and weekly hours.
        </p>
      </CardHeader>
      <CardContent>
        {loadError ? (
          <InlineAlert variant="error">{loadError}</InlineAlert>
        ) : (
          <div className="space-y-6">
            <ProfileForm
              initialValues={user ?? undefined}
              submitPath="/api/profile"
              submitMethod="PATCH"
              showDesiredWeeklyHours={user?.role === "STAFF"}
            />

            <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Skills (read-only)</h2>
                <p className="text-xs text-zinc-600">Managed by staffing administration.</p>
              </div>

              {skillNames.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {skillNames.map((skillName) => (
                    <Badge key={skillName}>{skillName}</Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-600">No skills assigned yet.</p>
              )}

              <div className="pt-2">
                <h2 className="text-sm font-semibold text-zinc-900">Location certifications (read-only)</h2>
                <p className="text-xs text-zinc-600">Managed by staffing administration.</p>
              </div>

              {certifiedLocationNames.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {certifiedLocationNames.map((locationName) => (
                    <Badge key={locationName} tone="success">{locationName}</Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-600">No location certifications assigned yet.</p>
              )}

              <div className="pt-2">
                <h2 className="text-sm font-semibold text-zinc-900">Role scope (read-only)</h2>
                <p className="text-xs text-zinc-600">Visibility and management scope for your role.</p>
              </div>

              {user?.role === "ADMIN" ? (
                <p className="text-sm text-zinc-700">Global scope: all locations.</p>
              ) : user?.role === "MANAGER" ? (
                managerLocationNames.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {managerLocationNames.map((locationName) => (
                      <Badge key={locationName} tone="success">{locationName}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-600">No manager location assignments yet.</p>
                )
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
