import { z } from 'zod';
import { AttendanceStatus } from '@prisma/client';

export const getTeacherClassesSchema = z.object({
  query: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  }),
});

export const getStudentsForAttendanceSchema = z.object({
  query: z.object({
    classIds: z.string().min(1, "At least one class ID is required"),
  }),
});

export const markAttendanceSchema = z.object({
  body: z.array(
    z.object({
      student_id: z.string().uuid("Invalid student ID"),
      class_id: z.string().uuid("Invalid class ID"),
      status: z.nativeEnum(AttendanceStatus),
    })
  ).min(1, "Attendance data cannot be empty"),
});

export const markAttendanceSchemaWithCustomError = z.object({
  body: z.array(
    z.object({
      student_id: z.string().uuid("Invalid student ID"),
      class_id: z.string().uuid("Invalid class ID"),
      status: z.nativeEnum(AttendanceStatus).refine(
        (val) => Object.values(AttendanceStatus).includes(val),
        { message: "Status must be either PRESENT or ABSENT" }
      ),
    })
  ).min(1, "Attendance data cannot be empty"),
});

export type GetTeacherClassesQuery = z.infer<typeof getTeacherClassesSchema>['query'];
export type GetStudentsForAttendanceQuery = z.infer<typeof getStudentsForAttendanceSchema>['query'];
export type MarkAttendanceBody = z.infer<typeof markAttendanceSchema>['body'];