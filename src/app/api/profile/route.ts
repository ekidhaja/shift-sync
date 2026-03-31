import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { profileSchema } from "@/lib/validation/profile";

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "code" in error && error.code === "P1001") {
    return "Database connection is temporarily unavailable. Please try again shortly.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
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
      },
    });

    if (!user) {
      return Response.json({ error: "Session expired. Please sign in again." }, { status: 401 });
    }

    return Response.json({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        desiredWeeklyHours: user.desiredWeeklyHours,
        skills: user.skills.map((entry) => entry.skill.name),
        certifiedLocations: user.certifications.map((entry) => entry.location.name),
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: "Could not load profile.",
        details: getErrorMessage(error, "Failed to load profile data."),
      },
      { status: 503 }
    );
  }
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = profileSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: parsed.data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        desiredWeeklyHours: true,
      },
    });

    return Response.json({ data: user });
  } catch (error) {
    return Response.json(
      {
        error: "Could not save profile.",
        details: getErrorMessage(error, "Failed to update profile."),
      },
      { status: 503 }
    );
  }
}
