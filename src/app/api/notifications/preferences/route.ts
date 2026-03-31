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
    select: { id: true },
  });

  if (!existingUser) {
    return Response.json(
      { error: "Session expired. Please sign in again." },
      { status: 401 }
    );
  }

  try {
    const preferences = await prisma.notificationPreference.upsert({
      where: { userId: session.user.id },
      update: {
        inAppEnabled: true,
        realtimeEnabled: true,
      },
      create: {
        userId: session.user.id,
        inAppEnabled: true,
        realtimeEnabled: true,
      },
    });

    return Response.json({ data: preferences });
  } catch {
    return Response.json(
      { error: "Could not load notification preferences." },
      { status: 503 }
    );
  }
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });

  if (!existingUser) {
    return Response.json(
      { error: "Session expired. Please sign in again." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);

  if (typeof body?.inAppEnabled === "boolean" || typeof body?.realtimeEnabled === "boolean") {
    return Response.json(
      { error: "In-app and realtime notifications are required and cannot be disabled." },
      { status: 400 }
    );
  }

  if (typeof body?.emailEnabled !== "boolean") {
    return Response.json(
      { error: "Invalid payload", details: "Only emailEnabled can be updated." },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.notificationPreference.upsert({
      where: { userId: session.user.id },
      update: {
        inAppEnabled: true,
        realtimeEnabled: true,
        emailEnabled: body.emailEnabled,
      },
      create: {
        userId: session.user.id,
        inAppEnabled: true,
        realtimeEnabled: true,
        emailEnabled: body.emailEnabled,
      },
    });

    return Response.json({ data: updated });
  } catch {
    return Response.json(
      { error: "Could not update notification preferences." },
      { status: 503 }
    );
  }
}
