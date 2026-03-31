import type { PrismaClient } from "@prisma/client";
import { getWeekStartDate, hoursBetweenDates } from "@/lib/scheduling";

type ComplianceSeverity = "warning" | "block" | "requires_override";

export type ComplianceIssue = {
	code:
		| "WEEKLY_35_WARNING"
		| "WEEKLY_40_TRACKING"
		| "DAILY_8_WARNING"
		| "DAILY_12_BLOCK"
		| "CONSECUTIVE_6_WARNING"
		| "CONSECUTIVE_7_OVERRIDE";
	severity: ComplianceSeverity;
	message: string;
};

export type CompliancePreview = {
	projectedWeeklyHours: number;
	projectedDailyHours: number;
	projectedConsecutiveDays: number;
	issues: ComplianceIssue[];
};

function startOfUtcDay(date: Date) {
	const normalized = new Date(date);
	normalized.setUTCHours(0, 0, 0, 0);
	return normalized;
}

function endOfUtcDay(date: Date) {
	const normalized = startOfUtcDay(date);
	normalized.setUTCDate(normalized.getUTCDate() + 1);
	return normalized;
}

function dateKey(date: Date) {
	return startOfUtcDay(date).toISOString().slice(0, 10);
}

function calculateConsecutiveDays(workedDayKeys: Set<string>, targetDay: Date) {
	let count = 0;
	const cursor = startOfUtcDay(targetDay);

	while (workedDayKeys.has(dateKey(cursor))) {
		count += 1;
		cursor.setUTCDate(cursor.getUTCDate() - 1);
	}

	return count;
}

export async function getCompliancePreviewForShift(
	prisma: PrismaClient,
	args: {
		userId: string;
		shiftId: string;
	}
): Promise<CompliancePreview | null> {
	const shift = await prisma.shift.findUnique({
		where: { id: args.shiftId },
		select: {
			id: true,
			startDateTime: true,
			endDateTime: true,
		},
	});

	if (!shift) {
		return null;
	}

	const shiftHours = Math.max(0, hoursBetweenDates(shift.startDateTime, shift.endDateTime));
	const weekStart = getWeekStartDate(shift.startDateTime);
	const weekEnd = new Date(weekStart);
	weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

	const existingAssignments = await prisma.shiftAssignment.findMany({
		where: {
			userId: args.userId,
			shift: {
				startDateTime: { gte: weekStart, lt: weekEnd },
			},
		},
		include: {
			shift: {
				select: {
					startDateTime: true,
					endDateTime: true,
				},
			},
		},
	});

	const weeklyHours = existingAssignments.reduce((total, assignment) => {
		return total + Math.max(0, hoursBetweenDates(assignment.shift.startDateTime, assignment.shift.endDateTime));
	}, 0);

	const targetDayStart = startOfUtcDay(shift.startDateTime);
	const targetDayEnd = endOfUtcDay(shift.startDateTime);

	const sameDayAssignments = await prisma.shiftAssignment.findMany({
		where: {
			userId: args.userId,
			shift: {
				startDateTime: { gte: targetDayStart, lt: targetDayEnd },
			},
		},
		include: {
			shift: {
				select: {
					startDateTime: true,
					endDateTime: true,
				},
			},
		},
	});

	const dailyHours = sameDayAssignments.reduce((total, assignment) => {
		return total + Math.max(0, hoursBetweenDates(assignment.shift.startDateTime, assignment.shift.endDateTime));
	}, 0);

	const rangeStart = startOfUtcDay(shift.startDateTime);
	rangeStart.setUTCDate(rangeStart.getUTCDate() - 6);
	const rangeEnd = endOfUtcDay(shift.startDateTime);

	const nearbyAssignments = await prisma.shiftAssignment.findMany({
		where: {
			userId: args.userId,
			shift: {
				startDateTime: { gte: rangeStart, lt: rangeEnd },
			},
		},
		include: {
			shift: {
				select: {
					startDateTime: true,
				},
			},
		},
	});

	const workedDayKeys = new Set<string>(nearbyAssignments.map((entry) => dateKey(entry.shift.startDateTime)));
	workedDayKeys.add(dateKey(shift.startDateTime));

	const projectedWeeklyHours = weeklyHours + shiftHours;
	const projectedDailyHours = dailyHours + shiftHours;
	const projectedConsecutiveDays = calculateConsecutiveDays(workedDayKeys, shift.startDateTime);

	const issues: ComplianceIssue[] = [];

	if (projectedWeeklyHours >= 35) {
		issues.push({
			code: projectedWeeklyHours >= 40 ? "WEEKLY_40_TRACKING" : "WEEKLY_35_WARNING",
			severity: "warning",
			message:
				projectedWeeklyHours >= 40
					? "Projected weekly hours exceed 40 and should be tracked closely."
					: "Projected weekly hours exceed 35 and may lead to overtime.",
		});
	}

	if (projectedDailyHours > 8) {
		issues.push({
			code: projectedDailyHours > 12 ? "DAILY_12_BLOCK" : "DAILY_8_WARNING",
			severity: projectedDailyHours > 12 ? "block" : "warning",
			message:
				projectedDailyHours > 12
					? "Projected daily hours exceed 12 and assignment is blocked."
					: "Projected daily hours exceed 8 and require manager review.",
		});
	}

	if (projectedConsecutiveDays >= 6) {
		issues.push({
			code: projectedConsecutiveDays >= 7 ? "CONSECUTIVE_7_OVERRIDE" : "CONSECUTIVE_6_WARNING",
			severity: projectedConsecutiveDays >= 7 ? "requires_override" : "warning",
			message:
				projectedConsecutiveDays >= 7
					? "Seventh consecutive day requires an explicit override reason."
					: "Sixth consecutive day should be reviewed for fatigue risk.",
		});
	}

	return {
		projectedWeeklyHours,
		projectedDailyHours,
		projectedConsecutiveDays,
		issues,
	};
}
