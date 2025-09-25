import type { Request, Response } from 'express';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, subDays } from 'date-fns';
import { prisma } from '../db/prisma.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../utils/AppError.js';
import type { MarkAttendanceBody, GetStudentsForAttendanceQuery, GetTeacherClassesQuery } from '../schema/attendanceSchema.js';


export const getClassesForTeacher = catchAsync(async (req: Request, res: Response) => {
    const { date } = req.query as GetTeacherClassesQuery;
    const teacherId = req.user!.id;

    const targetDate = new Date(date);
    const startDate = startOfDay(targetDate);
    const endDate = endOfDay(targetDate);

    const classes = await prisma.class.findMany({
        where: {
            teacher_id: teacherId,
            start_date: {
                gte: startDate,
                lte: endDate,
            },
        },
        select: {
            id: true,
            lecture_number: true,
            subject: { select: { code: true } },
            division: {
                select: {
                    code: true,
                    batch: { select: { name: true } },
                    school: { select: { name: true } },
                    center: { select: { code: true } },
                },
            },
        },
        orderBy: {
            start_date: 'asc',
        },
    });

    const formattedClasses = classes.map(c => ({
        id: c.id,
        displayName: `${c.subject.code} - Lec ${c.lecture_number} - ${c.division.center.code}${c.division.school.name}${c.division.batch.name}${c.division.code}`,
    }));

    res.status(200).json({
        success: true,
        data: formattedClasses,
    });
});


export const getStudentsForAttendance = catchAsync(async (req: Request, res: Response) => {
    const { classIds } = req.query as GetStudentsForAttendanceQuery;
    const classIdArray = classIds.split(',');
    
    const firstClass = await prisma.class.findFirst({
        where: { id: { in: classIdArray } },
        select: { division_id: true, subject_id: true, start_date: true },
    });

    if (!firstClass) {
        throw new AppError('No valid classes found for the provided IDs.', 404);
    }

    const { division_id, subject_id, start_date } = firstClass;

    const students = await prisma.student.findMany({
        where: { division_id },
        select: { id: true, name: true, enrollment_id: true },
        orderBy: { name: 'asc' },
    });

    if (students.length === 0) {
        return res.status(200).json({ success: true, data: [] });
    }

    const studentIds = students.map(s => s.id);

    const currentAttendances = await prisma.attendance.findMany({
        where: {
            class_id: { in: classIdArray },
            student_id: { in: studentIds },
        },
    });
    
    const currentAttendanceMap = new Map(currentAttendances.map(a => [a.student_id + a.class_id, a.status]));
    
    const isToday = startOfDay(new Date()).getTime() === startOfDay(start_date).getTime();
    let lastThreeAttendancesMap = new Map<string, any[]>();

    if (isToday) {
        const previousClasses = await prisma.class.findMany({
            where: {
                subject_id,
                start_date: { lt: startOfDay(start_date) },
            },
            orderBy: { start_date: 'desc' },
            take: 3,
            select: { id: true },
        });

        if (previousClasses.length > 0) {
            const previousClassIds = previousClasses.map(c => c.id);
            const previousAttendances = await prisma.attendance.findMany({
                where: {
                    class_id: { in: previousClassIds },
                    student_id: { in: studentIds },
                },
                select: { student_id: true, status: true },
            });

            for (const attendance of previousAttendances) {
                if (!lastThreeAttendancesMap.has(attendance.student_id)) {
                    lastThreeAttendancesMap.set(attendance.student_id, []);
                }
                lastThreeAttendancesMap.get(attendance.student_id)!.push(attendance.status);
            }
        }
    }

    const responseData = students.map(student => ({
        student_id: student.id,
        name: student.name,
        enrollment_id: student.enrollment_id,
        statuses: classIdArray.reduce((acc, classId) => {
            acc[classId] = currentAttendanceMap.get(student.id + classId) || 'ABSENT'; // Default to ABSENT
            return acc;
        }, {} as Record<string, string>),
        ...(isToday && { lastThreeDaysStatus: lastThreeAttendancesMap.get(student.id) || [] }),
    }));

    res.status(200).json({
        success: true,
        data: responseData,
    });
});



export const markOrUpdateAttendance = catchAsync(async (req: Request, res: Response) => {
    const attendanceData = req.body as MarkAttendanceBody;
    const teacherId = req.user!.id;

    const classId = attendanceData[0]?.class_id;
    if (!classId) {
        throw new AppError('No class ID provided in attendance data.', 400);
    }

    const classToUpdate = await prisma.class.findUnique({
        where: { id: classId },
        select: { teacher_id: true, start_date: true },
    });

    if (!classToUpdate) throw new AppError('Class not found.', 404);
    if (classToUpdate.teacher_id !== teacherId) {
        throw new AppError('You are not authorized to mark attendance for this class.', 403);
    }

    const now = new Date();

    
    const upsertPromises = attendanceData.map(record =>
        prisma.attendance.upsert({
            where: {
                attendance_student_class_unique: {
                    student_id: record.student_id,
                    class_id: record.class_id,
                },
            },
            update: {
                status: record.status,
                marked_by: 'MANUAL',
            },
            create: {
                student_id: record.student_id,
                class_id: record.class_id,
                status: record.status,
                marked_by: 'MANUAL',
            },
        })
    );
    
    await prisma.$transaction(upsertPromises);
    
    res.status(200).json({
        success: true,
        message: 'Attendance has been successfully updated.',
    });
});