import { z } from 'zod';
import { SchoolName } from '@prisma/client'; 

export const schoolSummarySchema = z.object({
  centerId: z.string().uuid(),
  schoolId: z.string().uuid(),
});

export const schoolDetailsSchema = z.object({
    school: z.nativeEnum(SchoolName), 
    from: z.coerce.date(),   
    to: z.coerce.date().optional(),
});

export const divisionProgressSchema = z.object({
    divisionId: z.string().uuid('Invalid Division ID format.'),
    from: z.coerce.date(),
    to: z.coerce.date().optional(),
});


export const laggingAnalysisSchema = z.object({
    divisionId: z.string().uuid('Invalid Division ID format.'),
    from: z.coerce.date(),
    to: z.coerce.date().optional(),
});
