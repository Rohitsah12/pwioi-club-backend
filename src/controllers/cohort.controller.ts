import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../utils/AppError.js';
import { z } from 'zod';
import xlsx from 'xlsx';

const createCohortSchema = z.object({
  name: z.string().min(1),
  school_id: z.string().uuid(),
  center_id: z.string().uuid(), 
  teacher_ids: z.array(z.string().uuid()).min(1),
  start_date: z.string().datetime(),
  end_date: z.string().datetime().optional(),
});

const updateCohortSchema = z.object({
    name: z.string().min(1).optional(),
    start_date: z.string().datetime().optional(),
    end_date: z.string().datetime().optional().nullable(),
    add_teacher_ids: z.array(z.string().uuid()).optional(),
    remove_teacher_ids: z.array(z.string().uuid()).optional(),
    add_students_by_enrollment: z.array(z.string()).optional(),
    remove_students_by_enrollment: z.array(z.string()).optional(),
});

interface StudentRow {
  name: string;
  enrollment_id: string;
}


export const createCohort = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError('Student Excel sheet is required.', 400);
  }

  const validation = createCohortSchema.safeParse(req.body);
  if (!validation.success) {
    throw new AppError('Invalid input data.', 400);
  }
  const { name, school_id, center_id, teacher_ids, start_date, end_date } = validation.data;

  const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new AppError('Excel file is empty.', 400);
  const studentData = xlsx.utils.sheet_to_json<StudentRow>(workbook.Sheets[sheetName]!);
  const studentEnrollmentIds = studentData.map(s => s.enrollment_id);

  const newCohort = await prisma.$transaction(async (tx) => {
    const cohort = await tx.cohort.create({
      data: {
        name,
        school_id,
        center_id,
        start_date: new Date(start_date),
        end_date: end_date ? new Date(end_date) : undefined,
      } as any,
    });

    await tx.teacherCohort.createMany({
      data: teacher_ids.map(teacher_id => ({
        teacher_id,
        cohort_id: cohort.id,
        specialisation: 'General',
      })),
    });

    await tx.student.updateMany({
      where: {
        enrollment_id: { in: studentEnrollmentIds },
      },
      data: {
        cohort_id: cohort.id,
      },
    });

    return cohort;
  });

  res.status(201).json({
    success: true,
    message: 'Cohort created successfully.',
    data: newCohort,
  });
});

export const getAllCohorts = catchAsync(async (req: Request, res: Response) => {
    const cohorts = await prisma.cohort.findMany({
        include: {
            school: { select: { name: true } },
            _count: {
                select: { students: true, teacherCohorts: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({
        success: true,
        data: cohorts
    });
});

export const getCohortById = catchAsync(async (req: Request, res: Response) => {
    const { cohortId } = req.params;
    const cohort = await prisma.cohort.findUnique({
        where: { id: cohortId! },
        include: {
            school: { select: { name: true } },
            teacherCohorts: {
                include: {
                    teacher: { select: { id: true, name: true, email: true } }
                }
            },
            students: {
                select: { id: true, name: true, enrollment_id: true },
                orderBy: { name: 'asc' }
            }
        }
    });

    if (!cohort) {
        throw new AppError('Cohort not found.', 404);
    }

    res.status(200).json({
        success: true,
        data: cohort
    });
});

export const getCohortsByCenter = catchAsync(async (req: Request, res: Response) => {
    const { centerId } = req.params;
    const cohorts = await prisma.cohort.findMany({
        where: { center_id: centerId !},
        include: {
            school: { select: { name: true } },
             _count: {
                select: { students: true, teacherCohorts: true }
            }
        },
        orderBy: { name: 'asc' }
    });

    res.status(200).json({
        success: true,
        data: cohorts
    });
});

export const updateCohort = catchAsync(async (req: Request, res: Response) => {
    const { cohortId } = req.params;
    const validation = updateCohortSchema.safeParse(req.body);
    if (!validation.success) {
        throw new AppError('Invalid input data.', 400);
    }
    const data = validation.data;

    const updatedCohort = await prisma.$transaction(async (tx) => {
        if (data.name || data.start_date || data.end_date) {
            await tx.cohort.update({
                where: { id: cohortId! },
                data: {
                    name: data.name,
                    start_date: data.start_date ? new Date(data.start_date) : undefined,
                    end_date: data.end_date ? new Date(data.end_date) : (data.end_date === null ? null : undefined),
                } as any
            });
        }

        if (data.add_teacher_ids && data.add_teacher_ids.length > 0) {
            await tx.teacherCohort.createMany({
                data: data.add_teacher_ids.map(id => ({ teacher_id: id, cohort_id: cohortId, specialisation: 'General' })) as any,
                skipDuplicates: true,
            });
        }

        if (data.remove_teacher_ids && data.remove_teacher_ids.length > 0) {
            await tx.teacherCohort.deleteMany({
                where: { cohort_id: cohortId!, teacher_id: { in: data.remove_teacher_ids } }
            });
        }

        if (data.add_students_by_enrollment && data.add_students_by_enrollment.length > 0) {
            await tx.student.updateMany({
                where: { enrollment_id: { in: data.add_students_by_enrollment } },
                data: { cohort_id: cohortId! }
            });
        }

        if (data.remove_students_by_enrollment && data.remove_students_by_enrollment.length > 0) {
            await tx.student.updateMany({
                where: { enrollment_id: { in: data.remove_students_by_enrollment }, cohort_id: cohortId !},
                data: { cohort_id: null }
            });
        }

        return tx.cohort.findUnique({ where: { id: cohortId! } });
    });

    res.status(200).json({
        success: true,
        message: 'Cohort updated successfully.',
        data: updatedCohort
    });
});

export const deleteCohort = catchAsync(async (req: Request, res: Response) => {
    const { cohortId } = req.params;

    await prisma.$transaction(async (tx) => {
        await tx.student.updateMany({
            where: { cohort_id: cohortId! },
            data: { cohort_id: null }
        });

        await tx.cohort.delete({
            where: { id: cohortId !}
        });
    });

    res.status(204).send();
});
