import { z } from "zod";

const dateTimeString = z.string().min(1).refine(
  (value) => !Number.isNaN(new Date(value).getTime()),
  "Invalid date/time format"
);

const locationFieldsSchema = z.object({
  locationId: z.string().min(1).optional(),
  locationIds: z.array(z.string().min(1)).min(1).optional(),
});

const recurringSchema = z.object({
  type: z.literal("RECURRING"),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfWeeks: z.array(z.number().int().min(0).max(6)).min(1).optional(),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
}).merge(locationFieldsSchema);

const exceptionSchema = z.object({
  type: z.literal("EXCEPTION"),
  startDateTime: dateTimeString,
  endDateTime: dateTimeString,
}).merge(locationFieldsSchema);

export const availabilitySchema = z.union([
  recurringSchema,
  exceptionSchema,
]).superRefine((value, context) => {
  if (!value.locationId && (!value.locationIds || value.locationIds.length === 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one location must be selected",
      path: ["locationIds"],
    });
  }

  if (value.type === "RECURRING" && value.endMinute <= value.startMinute) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End time must be after start time",
      path: ["endMinute"],
    });
  }

  if (
    value.type === "RECURRING"
    && (typeof value.dayOfWeek !== "number")
    && (!value.dayOfWeeks || value.dayOfWeeks.length === 0)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one day must be selected",
      path: ["dayOfWeeks"],
    });
  }

  if (value.type !== "EXCEPTION") {
    return;
  }

  if (new Date(value.endDateTime).getTime() <= new Date(value.startDateTime).getTime()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End date/time must be after start date/time",
      path: ["endDateTime"],
    });
  }
});

export type AvailabilityInput = z.infer<typeof availabilitySchema>;
