import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { evaluateAssignmentConstraints } from "@/lib/scheduling-rules";
import { getCompliancePreviewForShift } from "@/lib/compliance";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "STAFF") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();

  const shifts = await prisma.shift.findMany({
    where: {
      status: "PUBLISHED",
      endDateTime: { gte: now },
      assignments: {
        none: {
          userId: session.user.id,
        },
      },
    },
    include: {
      location: { select: { name: true, timezone: true } },
      requiredSkill: { select: { name: true } },
      assignments: {
        select: {
          id: true,
        },
      },
    },
    orderBy: { startDateTime: "asc" },
  });

  const claimableShifts = [];

  for (const shift of shifts) {
    const openSpots = Math.max(0, shift.headcount - shift.assignments.length);
    if (openSpots <= 0) {
      continue;
    }

    const { violations } = await evaluateAssignmentConstraints(prisma, {
      shiftId: shift.id,
      userId: session.user.id,
    });

    if (violations.length > 0) {
      continue;
    }

    const compliance = await getCompliancePreviewForShift(prisma, {
      userId: session.user.id,
      shiftId: shift.id,
    });

    const hasBlockingComplianceIssue =
      compliance?.issues.some((issue) => issue.severity === "block" || issue.severity === "requires_override")
      ?? false;

    if (hasBlockingComplianceIssue) {
      continue;
    }

    claimableShifts.push({
      ...shift,
      openSpots,
      temporalStatus: shift.endDateTime < now ? "PAST" : "UPCOMING",
    });
  }

  return Response.json({ data: claimableShifts });
}
