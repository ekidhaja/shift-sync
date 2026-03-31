import type { PrismaClient } from "@prisma/client";
import {
  hoursBetweenDates,
  isShiftWithinAvailability,
  rangesOverlap,
  type AssignmentAlternative,
  type AssignmentViolation,
} from "@/lib/scheduling";

export async function evaluateAssignmentConstraints(
  prisma: PrismaClient,
  args: {
    shiftId: string;
    userId: string;
  }
): Promise<{ violations: AssignmentViolation[]; alternatives: AssignmentAlternative[] }> {
  const shift = await prisma.shift.findUnique({
    where: { id: args.shiftId },
    include: {
      location: { select: { id: true, timezone: true } },
      requiredSkill: { select: { id: true, name: true } },
    },
  });

  if (!shift) {
    return {
      violations: [{ code: "UNAVAILABLE", message: "Shift not found." }],
      alternatives: [],
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    include: {
      skills: { select: { skillId: true } },
      certifications: { select: { locationId: true } },
      availabilities: {
        where: { locationId: shift.locationId },
      },
    },
  });

  if (!user) {
    return {
      violations: [{ code: "UNAVAILABLE", message: "Staff member not found." }],
      alternatives: [],
    };
  }

  const violations: AssignmentViolation[] = [];

  const hasSkill = user.skills.some((entry) => entry.skillId === shift.requiredSkillId);
  if (!hasSkill) {
    violations.push({
      code: "MISSING_SKILL",
      message: `Missing required skill: ${shift.requiredSkill.name}.`,
    });
  }

  const hasCertification = user.certifications.some(
    (entry) => entry.locationId === shift.locationId
  );
  if (!hasCertification) {
    violations.push({
      code: "MISSING_CERTIFICATION",
      message: "Staff member is not certified for this location.",
    });
  }

  const existingAssignments = await prisma.shiftAssignment.findMany({
    where: {
      userId: args.userId,
      shiftId: { not: shift.id },
    },
    include: {
      shift: {
        select: {
          id: true,
          startDateTime: true,
          endDateTime: true,
          location: { select: { name: true } },
        },
      },
    },
  });

  const overlapAssignment = existingAssignments.find((assignment) =>
    rangesOverlap(
      shift.startDateTime,
      shift.endDateTime,
      assignment.shift.startDateTime,
      assignment.shift.endDateTime
    )
  );

  if (overlapAssignment) {
    violations.push({
      code: "OVERLAP",
      message: `Shift overlaps with existing assignment at ${overlapAssignment.shift.location.name}.`,
    });
  }

  const restViolation = existingAssignments.find((assignment) => {
    const gapAfter = hoursBetweenDates(assignment.shift.endDateTime, shift.startDateTime);
    const gapBefore = hoursBetweenDates(shift.endDateTime, assignment.shift.startDateTime);

    const afterIsRelevant = assignment.shift.endDateTime <= shift.startDateTime && gapAfter < 10;
    const beforeIsRelevant = shift.endDateTime <= assignment.shift.startDateTime && gapBefore < 10;

    return afterIsRelevant || beforeIsRelevant;
  });

  if (restViolation) {
    violations.push({
      code: "REST_WINDOW",
      message: "Minimum 10-hour rest rule violated for this staff member.",
    });
  }

  const hasAvailability = isShiftWithinAvailability(
    user.availabilities,
    shift.startDateTime,
    shift.endDateTime,
    shift.location.timezone
  );

  if (!hasAvailability) {
    violations.push({
      code: "UNAVAILABLE",
      message: "Staff member is unavailable during this shift window.",
    });
  }

  const alternatives = violations.length > 0
    ? await findAssignmentAlternatives(prisma, {
        shiftId: shift.id,
      })
    : [];

  return { violations, alternatives };
}

export async function findAssignmentAlternatives(
  prisma: PrismaClient,
  args: {
    shiftId: string;
    limit?: number;
  }
): Promise<AssignmentAlternative[]> {
  const shift = await prisma.shift.findUnique({
    where: { id: args.shiftId },
    include: {
      location: { select: { id: true, timezone: true } },
      requiredSkill: { select: { id: true } },
    },
  });

  if (!shift) {
    return [];
  }

  const candidates = await prisma.user.findMany({
    where: {
      role: "STAFF",
      skills: {
        some: {
          skillId: shift.requiredSkillId,
        },
      },
      certifications: {
        some: {
          locationId: shift.locationId,
        },
      },
    },
    include: {
      availabilities: {
        where: { locationId: shift.locationId },
      },
      assignedShifts: {
        include: {
          shift: {
            select: {
              id: true,
              startDateTime: true,
              endDateTime: true,
            },
          },
        },
      },
    },
    take: args.limit ?? 5,
  });

  return candidates
    .map((candidate) => {
      const reasons: string[] = [];

      const overlap = candidate.assignedShifts.some((assignment) =>
        rangesOverlap(
          shift.startDateTime,
          shift.endDateTime,
          assignment.shift.startDateTime,
          assignment.shift.endDateTime
        )
      );

      if (overlap) {
        reasons.push("Overlapping shift");
      }

      const restViolation = candidate.assignedShifts.some((assignment) => {
        const gapAfter = hoursBetweenDates(assignment.shift.endDateTime, shift.startDateTime);
        const gapBefore = hoursBetweenDates(shift.endDateTime, assignment.shift.startDateTime);
        return (
          (assignment.shift.endDateTime <= shift.startDateTime && gapAfter < 10)
          || (shift.endDateTime <= assignment.shift.startDateTime && gapBefore < 10)
        );
      });

      if (restViolation) {
        reasons.push("10-hour rest violation");
      }

      const available = isShiftWithinAvailability(
        candidate.availabilities,
        shift.startDateTime,
        shift.endDateTime,
        shift.location.timezone
      );

      if (!available) {
        reasons.push("Unavailable in this window");
      }

      return {
        userId: candidate.id,
        name: candidate.name,
        email: candidate.email,
        reasons,
      };
    })
    .filter((candidate) => candidate.reasons.length === 0);
}
