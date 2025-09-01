import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../utils/AppError.js';
import { googleCalendarService } from '../service/googleCalendarService.js';
import { createWeeklyScheduleSchema, updateClassSchema } from '../schema/classSchema.js';
import { addDays, format, getDay } from 'date-fns';
import { recalculateCprPlannedDatesForSubject } from './cpr.controller.js';


function parseDateTime(date: Date, time: string): Date {
    const timeParts = time.split(':');
    const hours = parseInt(timeParts[0]!, 10);
    const minutes = parseInt(timeParts[1]!, 10);

    if (isNaN(hours) || isNaN(minutes)) {
        throw new AppError('Invalid time format', 400);
    }

    const newDate = new Date(date);
    newDate.setHours(hours, minutes, 0, 0);
    return newDate;
}

const dayNameToIndex: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
};

function getDaysInInterval(start: Date, end: Date): Date[] {
    const days: Date[] = [];
    let currentDay = new Date(start);

    while (currentDay <= end) {
        days.push(new Date(currentDay));
        currentDay = addDays(currentDay, 1);
    }

    return days;
}



export const createWeeklySchedule = catchAsync(async (req: Request, res: Response) => {
    const validation = createWeeklyScheduleSchema.safeParse(req.body);
    if (!validation.success) {
        throw new AppError('Validation failed', 400);
    }

    const { subject_id, room_id, start_date, end_date, schedule_items } = validation.data;

    const subject = await prisma.subject.findUnique({
        where: { id: subject_id },
        include: {
            teacher: { select: { id: true, email: true } },
            semester: {
                include: {
                    division: {
                        include: { students: { select: { email: true } } },
                    },
                },
            },
        },
    });

    if (!subject) throw new AppError('Subject not found', 404);
    if (!subject.semester.division) throw new AppError('Division not found for the subject', 404);
    if (!subject.teacher) throw new AppError('Teacher not assigned to the subject', 404);

    const room = room_id ? await prisma.room.findUnique({ where: { id: room_id } }) : null;
    if (room_id && !room) throw new AppError('Room not found', 404);

    const teacherId = subject.teacher.id;
    const teacherEmail = subject.teacher.email;
    const divisionId = subject.semester.division.id;
    const studentEmails = subject.semester.division.students.map((s) => s.email);
    const hasCalendarIntegration = !!process.env.GOOGLE_ACADEMICS_REFRESH_TOKEN;

    // 2. Generate all potential class time slots
    const potentialClasses: Array<{
        start_date: Date;
        end_date: Date;
        lecture_number: number;
    }> = [];

    const interval = getDaysInInterval(new Date(start_date), new Date(end_date));
    for (const day of interval) {
        const dayIndex = getDay(day);
        const dayName = Object.keys(dayNameToIndex).find((key) => dayNameToIndex[key] === dayIndex);
        if (!dayName) continue;

        const schedulesForDay = schedule_items.filter((item) => item.day_of_week === dayName);
        for (const schedule of schedulesForDay) {
            const startDateTime = parseDateTime(day, schedule.start_time);
            const endDateTime = parseDateTime(day, schedule.end_time);

            if (startDateTime < new Date()) continue; // Skip past classes

            potentialClasses.push({
                start_date: startDateTime,
                end_date: endDateTime,
                lecture_number: schedule.lecture_number,
            });
        }
    }

    if (potentialClasses.length === 0) {
        return res.status(200).json({
            success: true,
            message: 'No valid classes to schedule in the given date range.',
            data: [],
        });
    }

    // 3. Perform internal conflict checks (No Google Calendar checks)
    for (const pClass of potentialClasses) {
        const conflictWhere = {
            OR: [
                { start_date: { lte: pClass.start_date }, end_date: { gt: pClass.start_date } },
                { start_date: { lt: pClass.end_date }, end_date: { gte: pClass.end_date } },
                { start_date: { gte: pClass.start_date }, end_date: { lte: pClass.end_date } },
            ],
        };

        if (room_id) {
            const roomConflict = await prisma.class.findFirst({ where: { room_id, ...conflictWhere } });
            if (roomConflict) throw new AppError(`Room conflict on ${format(pClass.start_date, 'PPP p')}`, 409);
        }

        const teacherConflict = await prisma.class.findFirst({ where: { teacher_id: teacherId, ...conflictWhere } });
        if (teacherConflict) throw new AppError(`Teacher has a schedule conflict on ${format(pClass.start_date, 'PPP p')}`, 409);
    }

    // 4. Create all classes in a database transaction
    const createdClasses = await prisma.$transaction(async (tx) => {
        const newClassesData = potentialClasses.map(pClass => ({
            subject_id,
            division_id: divisionId,
            teacher_id: teacherId,
            room_id: room_id || undefined,
            start_date: pClass.start_date,
            end_date: pClass.end_date,
            lecture_number: String(pClass.lecture_number),
            googleEventId: '',
        }));

        await tx.class.createMany({ data: newClassesData as any });
        const createdClassRecords = await tx.class.findMany({
            where: {
                subject_id,
                division_id: divisionId,
                start_date: { in: potentialClasses.map(p => p.start_date) }
            }
        });
        await recalculateCprPlannedDatesForSubject(tx, subject_id);
        return createdClassRecords;
    });

    // 5. Create Google Calendar events for each new class
    if (hasCalendarIntegration) {
        for (const cls of createdClasses) {
            try {
                const calendarEvent = {
                    summary: `${subject.name} - Lecture ${cls.lecture_number}`,
                    description: `Subject: ${subject.name}\nLecture: ${cls.lecture_number}`,
                    startDateTime: cls.start_date,
                    endDateTime: cls.end_date,
                    teacherEmail: teacherEmail,
                    attendees: studentEmails,
                    ...(room && { location: room.name }),
                };

                const googleEventId = await googleCalendarService.createCalendarEvent(calendarEvent);
                await prisma.class.update({
                    where: { id: cls.id },
                    data: { googleEventId },
                });
            } catch (error) {
                console.error(`Failed to create Google event for class ${cls.id}:`, error);
            }
        }
    }

    res.status(201).json({
        success: true,
        message: `Successfully created ${createdClasses.length} classes.`,
        data: createdClasses,
    });
});

/**
 * Updates a single class.
 */
export const updateClass = catchAsync(async (req: Request, res: Response) => {
    const { classId } = req.params;
    const validation = updateClassSchema.safeParse(req.body);
    if (!validation.success) {
        throw new AppError('Validation failed', 400);
    }
    const updateData = validation.data;

    const existingClass = await prisma.class.findUnique({
        where: { id: classId! },
        include: {
            subject: { include: { teacher: true } },
            division: { include: { students: { select: { email: true } } } },
        },
    });

    if (!existingClass) throw new AppError('Class not found', 404);

    const updatePayload: any = {};
    if (updateData.lecture_number !== undefined) updatePayload.lecture_number = String(updateData.lecture_number);
    if (updateData.start_date !== undefined) updatePayload.start_date = new Date(updateData.start_date);
    if (updateData.end_date !== undefined) updatePayload.end_date = new Date(updateData.end_date);
    if (updateData.room_id !== undefined) updatePayload.room_id = updateData.room_id;

    if (Object.keys(updatePayload).length > 0) {
        const newStart = updatePayload.start_date || existingClass.start_date;
        const newEnd = updatePayload.end_date || existingClass.end_date;
        const newRoomId = updatePayload.room_id ?? existingClass.room_id;

        const conflictWhere = {
            id: { not: classId! },
            OR: [
                { start_date: { lte: newStart }, end_date: { gt: newStart } },
                { start_date: { lt: newEnd }, end_date: { gte: newEnd } },
                { start_date: { gte: newStart }, end_date: { lte: newEnd } },
            ],
        };

        if (newRoomId) {
            const roomConflict = await prisma.class.findFirst({ where: { room_id: newRoomId, ...conflictWhere } });
            if (roomConflict) throw new AppError('Room is already booked for this time slot', 409);
        }

        const teacherConflict = await prisma.class.findFirst({ where: { teacher_id: existingClass.teacher_id, ...conflictWhere } });
        if (teacherConflict) throw new AppError('Teacher has a conflict with this time slot', 409);
    }

    const updatedClass = await prisma.$transaction(async (tx) => {
        const updated = await tx.class.update({
            where: { id: classId! },
            data: updatePayload,
        });
        await recalculateCprPlannedDatesForSubject(tx, existingClass.subject_id);
        return updated;
    });

    const hasCalendarIntegration = !!process.env.GOOGLE_ACADEMICS_REFRESH_TOKEN;
    if (existingClass.googleEventId && hasCalendarIntegration) {
        try {
            const eventUpdate: any = {
                summary: `${existingClass.subject.name} - Lecture ${updatedClass.lecture_number}`,
                teacherEmail: existingClass.subject.teacher.email,
                attendees: existingClass.division.students.map(s => s.email),
            };
            if (updatePayload.start_date) eventUpdate.startDateTime = updatedClass.start_date;
            if (updatePayload.end_date) eventUpdate.endDateTime = updatedClass.end_date;

            await googleCalendarService.updateCalendarEvent(
                existingClass.googleEventId,
                eventUpdate
            );
        } catch (error) {
            console.error('Failed to update Google Calendar event:', error);
        }
    }

    res.status(200).json({
        success: true,
        message: 'Class updated successfully',
        data: updatedClass,
    });
});

/**
 * Deletes a single class.
 */
export const deleteClass = catchAsync(async (req: Request, res: Response) => {
    const { classId } = req.params;

    const existingClass = await prisma.class.findUnique({
        where: { id: classId! },
        select: { id: true, googleEventId: true, subject_id: true },
    });

    if (!existingClass) throw new AppError('Class not found', 404);

    const hasCalendarIntegration = !!process.env.GOOGLE_ACADEMICS_REFRESH_TOKEN;
    if (existingClass.googleEventId && hasCalendarIntegration) {
        try {
            await googleCalendarService.deleteCalendarEvent(existingClass.googleEventId);
        } catch (error) {
            console.error('Failed to delete Google event, proceeding with DB deletion:', error);
        }
    }

    await prisma.$transaction(async (tx) => {
        await tx.class.delete({ where: { id: classId! } });
        await recalculateCprPlannedDatesForSubject(tx, existingClass.subject_id);
    });

    res.status(204).send();
});

/**
 * Retrieves a list of classes based on query filters.
 */
export const getClasses = catchAsync(async (req: Request, res: Response) => {
    const { subject_id, teacher_id, division_id, room_id, start_date, end_date } = req.query;

    const whereClause: any = {};
    if (subject_id) whereClause.subject_id = subject_id as string;
    if (teacher_id) whereClause.teacher_id = teacher_id as string;
    if (division_id) whereClause.division_id = division_id as string;
    if (room_id) whereClause.room_id = room_id as string;

    if (start_date || end_date) {
        whereClause.start_date = {};
        if (start_date) whereClause.start_date.gte = new Date(start_date as string);
        if (end_date) whereClause.start_date.lte = new Date(end_date as string);
    }

    const classes = await prisma.class.findMany({
        where: whereClause,
        include: {
            subject: { select: { name: true, code: true } },
            teacher: { select: { name: true, email: true } },
            division: { select: { code: true } },
            room: { select: { name: true } },
        },
        orderBy: { start_date: 'asc' },
    });

    res.status(200).json({
        success: true,
        data: classes,
        count: classes.length,
    });
});

/**
 * Retrieves details for a single class.
 */
export const getClass = catchAsync(async (req: Request, res: Response) => {
    const { classId } = req.params;

    const classData = await prisma.class.findUnique({
        where: { id: classId! },
        include: {
            subject: { select: { name: true, code: true, credits: true } },
            teacher: { select: { name: true, email: true } },
            division: { select: { code: true } },
            room: { select: { name: true } },
            attendances: {
                include: {
                    student: { select: { name: true, email: true } },
                },
            },
        },
    });

    if (!classData) throw new AppError('Class not found', 404);

    const subTopics = await prisma.cprSubTopic.findMany({
        where: {
            lecture_number: parseInt(classData.lecture_number, 10),
            topic: { module: { subject_id: classData.subject_id } }
        },
        orderBy: { order: 'asc' },
        select: {
            id: true,
            name: true,
            status: true,
            topic: { select: { name: true, module: { select: { name: true } } } }
        }
    });

    res.status(200).json({
        success: true,
        data: {
            ...classData,
            subTopics,
        },
    });
});