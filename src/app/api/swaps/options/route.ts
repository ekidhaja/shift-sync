import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ShiftOption = {
  id: string;
  startDateTime: Date;
  endDateTime: Date;
  location: {
    id: string;
    name: string;
    timezone: string;
  };
};

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "STAFF") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();

  const assignedShifts = await prisma.shiftAssignment.findMany({
    where: {
      userId: session.user.id,
      shift: {
        endDateTime: { gte: now },
      },
    },
    select: {
      shift: {
        select: {
          id: true,
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
      },
    },
    orderBy: {
      shift: {
        startDateTime: "asc",
      },
    },
  });

  const myShifts = assignedShifts.map((entry) => entry.shift);

  const peerAssignments = await prisma.shiftAssignment.findMany({
    where: {
      userId: { not: session.user.id },
      shift: {
        endDateTime: { gte: now },
      },
      user: {
        role: "STAFF",
      },
    },
    select: {
      userId: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      shift: {
        select: {
          id: true,
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
      },
    },
    orderBy: [
      {
        user: {
          name: "asc",
        },
      },
      {
        shift: {
          startDateTime: "asc",
        },
      },
    ],
  });

  const peerMap = new Map<string, {
    id: string;
    name: string | null;
    email: string | null;
    shifts: ShiftOption[];
  }>();

  for (const assignment of peerAssignments) {
    const existing = peerMap.get(assignment.userId);

    if (existing) {
      existing.shifts.push(assignment.shift);
      continue;
    }

    peerMap.set(assignment.userId, {
      id: assignment.user.id,
      name: assignment.user.name,
      email: assignment.user.email,
      shifts: [assignment.shift],
    });
  }

  const peers = Array.from(peerMap.values());

  return Response.json({
    data: {
      myShifts,
      peers,
    },
  });
}
