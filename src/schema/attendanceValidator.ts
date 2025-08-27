import { z } from 'zod';


export const attendanceAnalyticsQuerySchema = z.object({
  centerId: z.string().uuid().optional(),
  schoolId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
  semesterId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
});