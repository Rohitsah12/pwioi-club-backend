import { z } from 'zod';

export const schoolAnalysisSchema = z.object({
  school: z.enum(['SOT', 'SOM', 'SOH']),
  from: z.coerce.date().refine((date) => !isNaN(date.getTime()), {
    message: 'The "from" date must be in YYYY-MM-DD format.',
  }),
  to: z.coerce.date().optional(),
});

export const divisionAnalysisSchema = z.object({
  divisionId: z.string().uuid({
    message: 'A valid divisionId is required.',
  }),
  from: z.coerce.date().refine((date) => !isNaN(date.getTime()), {
    message: 'The "from" date must be in YYYY-MM-DD format.',
  }),
  to: z.coerce.date().optional(),
  threshold: z.coerce.number().int().min(0).max(100, 'Threshold must be between 0 and 100').positive({
    message: 'A threshold percentage is required.',
  }),
});

export const leaderboardSchema = z.object({
  divisionId: z.string().uuid("Division ID must be a valid UUID"),
  from: z.string().transform((str) => new Date(str)).refine((date) => !isNaN(date.getTime()), {
    message: "Invalid 'from' date format. Use YYYY-MM-DD format.",
  }),
  to: z.string().transform((str) => new Date(str)).refine((date) => !isNaN(date.getTime()), {
    message: "Invalid 'to' date format. Use YYYY-MM-DD format.",
  }).optional(),
});