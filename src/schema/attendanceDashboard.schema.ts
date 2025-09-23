import { z } from 'zod';

export const schoolAnalysisSchema = z.object({
  school: z.enum(['SOT', 'SOM', 'SOH']),
  from: z.coerce.date().refine((date) => !isNaN(date.getTime()), {
    message: 'The "from" date must be in YYYY-MM-DD format.',
  }),
  to: z.coerce.date().optional(),
});