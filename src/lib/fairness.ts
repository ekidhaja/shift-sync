import type { PrismaClient } from "@prisma/client";
import { getWeekStartDate, hoursBetweenDates } from "@/lib/scheduling";

export type FairnessRow = {
  userId: string;
  name: string | null;
  email: string | null;
  desiredWeeklyHours: number;
  assignedHours: number;
  variance: number;
  premiumShiftCount: number;
  fairnessScore: number;
};

function isPremiumShift(shiftStart: Date) {
  const day = shiftStart.getUTCDay();
  const hour = shiftStart.getUTCHours();
  const isWeekendPrime = day === 5 || day === 6;
  return isWeekendPrime && hour >= 17;
}

export async function getFairnessSummary(
  prisma: PrismaClient,
  args: {
    locationId?: string;
    locationIds?: string[];
    weekStartDate?: Date;
  }
) {
  const weekStart = args.weekStartDate ? getWeekStartDate(args.weekStartDate) : getWeekStartDate(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      shift: {
        startDateTime: { gte: weekStart, lt: weekEnd },
        locationId: args.locationId
          ? args.locationId
          : args.locationIds
            ? { in: args.locationIds }
            : undefined,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          desiredWeeklyHours: true,
        },
      },
      shift: {
        select: {
          startDateTime: true,
          endDateTime: true,
        },
      },
    },
  });

  const byUser = new Map<string, FairnessRow>();

  for (const assignment of assignments) {
    const existing = byUser.get(assignment.userId) ?? {
      userId: assignment.userId,
      name: assignment.user.name,
      email: assignment.user.email,
      desiredWeeklyHours: assignment.user.desiredWeeklyHours,
      assignedHours: 0,
      variance: 0,
      premiumShiftCount: 0,
      fairnessScore: 100,
    };

    existing.assignedHours += Math.max(
      0,
      hoursBetweenDates(assignment.shift.startDateTime, assignment.shift.endDateTime)
    );

    if (isPremiumShift(assignment.shift.startDateTime)) {
      existing.premiumShiftCount += 1;
    }

    byUser.set(assignment.userId, existing);
  }

  const rows = Array.from(byUser.values()).map((row) => {
    const variance = row.assignedHours - row.desiredWeeklyHours;
    const fairnessScore = Math.max(
      0,
      100 - Math.abs(variance * 2) - (row.premiumShiftCount * 5)
    );

    return {
      ...row,
      variance,
      fairnessScore,
    };
  });

  return {
    weekStartDate: weekStart,
    weekEndDate: weekEnd,
    rows,
  };
}
