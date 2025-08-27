import { z } from 'zod';
import { ExamType } from '@prisma/client';

export const examAnalyticsQuerySchema = z.object({
  semesterId: z.string().uuid({ message: 'A valid semesterId is required.' }),
  subjectId: z.string().uuid().optional(),
  examType: z.nativeEnum(ExamType).optional(),
  examId: z.string().uuid().optional(),
});