import { z } from "zod";

export const profileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  desiredWeeklyHours: z.number().int().min(0).max(80).optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
