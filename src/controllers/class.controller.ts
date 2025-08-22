// src/controllers/class.controller.ts

import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../utils/AppError.js';
import { googleCalendarService } from '../service/googleCalendarService.js';
import { createWeeklyScheduleSchema, updateClassSchema } from '../schema/classSchema.js';
import { addDays, format, getDay, startOfDay } from 'date-fns';

// ==================== UTILITY FUNCTIONS ====================

function parseDateTime(date: Date, time: string): Date {
    const timeParts = time.split(':');
    const hours = parseInt(timeParts[0] as string, 10);
    const minutes = parseInt(timeParts[1] as string, 10);

    if (isNaN(hours) || isNaN(minutes)) {
        throw new Error('Invalid time format');
    }

    const newDate = new Date(date);
    newDate.setHours(hours, minutes, 0, 0);
    return newDate;
}

// Fixed type for dayNameToIndex
const dayNameToIndex: Record<string, number> = {
    'Sunday': 0,
    'Monday': 1,
    'Tuesday': 2,
    'Wednesday': 3,
    'Thursday': 4,
    'Friday': 5,
    'Saturday': 6
};

// Helper function to get days in interval (since eachDayOfInterval might not be available)
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

    // 1. Fetch Subject with Teacher, Division, and Students details
    const subject = await prisma.subject.findUnique({
        where: { id: subject_id },
        include: {
            teacher: { select: { id: true, googleRefreshToken: true } },
            semester: {
                include: {
                    division: {
                        include: {
                            students: { select: { email: true } }
                        }
                    }
                }
            },
        }
    });

    if (!subject) throw new AppError('Subject not found', 404);
    if (!subject.semester.division) throw new AppError('Subject division not found', 404);

    const room = room_id ? await prisma.room.findUnique({ where: { id: room_id } }) : null;
    if (room_id && !room) throw new AppError('Room not found', 404);

    const teacherId = subject.teacher.id;
    const divisionId = subject.semester.division.id;
    const hasCalendarIntegration = !!subject.teacher.googleRefreshToken;
    const studentEmails = subject.semester.division.students.map(s => s.email);

    // 2. Generate all potential class instances to be created
    const potentialClasses = [];
    const interval = getDaysInInterval(new Date(start_date), new Date(end_date));

    for (const day of interval) {
        const dayIndex = getDay(day); // Sunday is 0, Monday is 1, etc.
        const dayName = Object.keys(dayNameToIndex).find(key => dayNameToIndex[key] === dayIndex);

        if (!dayName) continue;

        const schedulesForDay = schedule_items.filter(item => item.day_of_week === dayName);

        for (const schedule of schedulesForDay) {
            const startDateTime = parseDateTime(day, schedule.start_time);
            const endDateTime = parseDateTime(day, schedule.end_time);

            // Basic validation: Cannot schedule in the past
            if (startDateTime < new Date()) {
                continue; // Skip past slots
            }

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
            message: 'No classes to schedule in the given date range.',
            data: []
        });
    }

    // 3. Validate all potential classes for conflicts (DB and Google Calendar)
    for (const pClass of potentialClasses) {
        // Check Room availability (DB) - check if room is already booked for overlapping times
        if (room_id) {
            const conflictingClasses = await prisma.class.findMany({
                where: {
                    room_id,
                    OR: [
                        {
                            AND: [
                                { start_date: { lte: pClass.start_date } },
                                { end_date: { gt: pClass.start_date } }
                            ]
                        },
                        {
                            AND: [
                                { start_date: { lt: pClass.end_date } },
                                { end_date: { gte: pClass.end_date } }
                            ]
                        },
                        {
                            AND: [
                                { start_date: { gte: pClass.start_date } },
                                { end_date: { lte: pClass.end_date } }
                            ]
                        }
                    ]
                }
            });

            if (conflictingClasses.length > 0) {
                throw new AppError(
                    `Room is already booked on ${format(pClass.start_date, 'yyyy-MM-dd HH:mm')}`,
                    409
                );
            }
        }

        // Check Teacher availability (Google Calendar)
        if (hasCalendarIntegration) {
            const isAvailable = await googleCalendarService.isTimeSlotAvailable(
                teacherId,
                pClass.start_date,
                pClass.end_date
            );
            if (!isAvailable) {
                throw new AppError(
                    `Teacher is unavailable on ${format(pClass.start_date, 'yyyy-MM-dd HH:mm')}`,
                    409
                );
            }
        }

        // Check Teacher database conflicts
        const teacherConflicts = await prisma.class.findMany({
            where: {
                teacher_id: teacherId,
                OR: [
                    {
                        AND: [
                            { start_date: { lte: pClass.start_date } },
                            { end_date: { gt: pClass.start_date } }
                        ]
                    },
                    {
                        AND: [
                            { start_date: { lt: pClass.end_date } },
                            { end_date: { gte: pClass.end_date } }
                        ]
                    },
                    {
                        AND: [
                            { start_date: { gte: pClass.start_date } },
                            { end_date: { lte: pClass.end_date } }
                        ]
                    }
                ]
            }
        });

        if (teacherConflicts.length > 0) {
            throw new AppError(
                `Teacher has conflicting class on ${format(pClass.start_date, 'yyyy-MM-dd HH:mm')}`,
                409
            );
        }
    }

    // 4. Create all classes in the database within a transaction
    const createdClasses = await prisma.$transaction(
        potentialClasses.map(pClass => prisma.class.create({
            data: {
                lecture_number: pClass.lecture_number,
                subject_id,
                division_id: divisionId,
                teacher_id: teacherId,
                 ...(room_id && { room_id }),
                start_date: pClass.start_date,
                end_date: pClass.end_date,
                googleEventId: '', // Will be updated after Google Calendar event creation
            }
        }))
    );

    // 5. Create Google Calendar events for each class
    if (hasCalendarIntegration) {
        for (const newClass of createdClasses) {
            try {
                const eventDetails = {
                    summary: `${subject.name} - Lecture ${newClass.lecture_number}`,
                    description: `Subject: ${subject.name}\nLecture: ${newClass.lecture_number}`,
                    location: room?.name, // Fixed: removed undefined possibility
                    startDateTime: newClass.start_date,
                    endDateTime: newClass.end_date,
                    attendees: studentEmails,
                };

                // Only add location if room exists
                const calendarEvent: any = {
                    summary: eventDetails.summary,
                    description: eventDetails.description,
                    startDateTime: eventDetails.startDateTime,
                    endDateTime: eventDetails.endDateTime,
                    attendees: eventDetails.attendees,
                };

                if (room) {
                    calendarEvent.location = room.name;
                }

                const googleEventId = await googleCalendarService.createCalendarEvent(teacherId, calendarEvent);

                await prisma.class.update({
                    where: { id: newClass.id },
                    data: { googleEventId }
                });
            } catch (error) {
                console.error(`Failed to create Google Calendar event for class ${newClass.id}:`, error);
                // Continue without failing the entire operation
            }
        }
    }

    res.status(201).json({
        success: true,
        message: `Successfully created ${createdClasses.length} classes.`,
        data: createdClasses,
    });
});


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
            subject: {
                include: { teacher: true }
            },
            room: true,
            division: true
        }
    });

    if (!existingClass) throw new AppError('Class not found', 404);

    const updatePayload: any = {};

    if (updateData.lecture_number !== undefined) {
        updatePayload.lecture_number = updateData.lecture_number;
    }
    if (updateData.start_date !== undefined) {
        updatePayload.start_date = new Date(updateData.start_date);
    }
    if (updateData.end_date !== undefined) {
        updatePayload.end_date = new Date(updateData.end_date);
    }
    if (updateData.room_id !== undefined) {
        updatePayload.room_id = updateData.room_id;
    }
    if (updateData.googleEventId !== undefined) {
        updatePayload.googleEventId = updateData.googleEventId;
    }

    // Check for conflicts if time or room is being updated
    if (updatePayload.start_date || updatePayload.end_date || updatePayload.room_id) {
        const newStartDate = updatePayload.start_date || existingClass.start_date;
        const newEndDate = updatePayload.end_date || existingClass.end_date;
        const newRoomId = updatePayload.room_id !== undefined ? updatePayload.room_id : existingClass.room_id;

        // Check room conflicts
        if (newRoomId) {
            const roomConflicts = await prisma.class.findMany({
                where: {
                    room_id: newRoomId,
                    id: { not: classId! },
                    OR: [
                        {
                            AND: [
                                { start_date: { lte: newStartDate } },
                                { end_date: { gt: newStartDate } }
                            ]
                        },
                        {
                            AND: [
                                { start_date: { lt: newEndDate } },
                                { end_date: { gte: newEndDate } }
                            ]
                        },
                        {
                            AND: [
                                { start_date: { gte: newStartDate } },
                                { end_date: { lte: newEndDate } }
                            ]
                        }
                    ]
                }
            });

            if (roomConflicts.length > 0) {
                throw new AppError('Room is already booked for the specified time', 409);
            }
        }

        // Check teacher conflicts
        const teacherConflicts = await prisma.class.findMany({
            where: {
                teacher_id: existingClass.teacher_id,
                id: { not: classId! },
                OR: [
                    {
                        AND: [
                            { start_date: { lte: newStartDate } },
                            { end_date: { gt: newStartDate } }
                        ]
                    },
                    {
                        AND: [
                            { start_date: { lt: newEndDate } },
                            { end_date: { gte: newEndDate } }
                        ]
                    },
                    {
                        AND: [
                            { start_date: { gte: newStartDate } },
                            { end_date: { lte: newEndDate } }
                        ]
                    }
                ]
            }
        });

        if (teacherConflicts.length > 0) {
            throw new AppError('Teacher has conflicting class for the specified time', 409);
        }
    }

    // Update the class
    const updatedClass = await prisma.class.update({
        where: { id: classId! },
        data: updatePayload
    });

    // Sync with Google Calendar if it exists
    if (existingClass.googleEventId && existingClass.subject.teacher.googleRefreshToken) {
        try {
            const eventUpdateData: any = {
                summary: `${existingClass.subject.name} - Lecture ${updatedClass.lecture_number}`,
            };

            if (updatePayload.start_date || updatePayload.end_date) {
                eventUpdateData.startDateTime = updatedClass.start_date;
                eventUpdateData.endDateTime = updatedClass.end_date;
            }

            await googleCalendarService.updateCalendarEvent(
                existingClass.subject.teacher.id,
                existingClass.googleEventId,
                eventUpdateData
            );
        } catch (error) {
            console.error('Failed to update Google Calendar event:', error);
            // Continue without failing the operation
        }
    }

    res.status(200).json({
        success: true,
        message: 'Class updated successfully',
        data: updatedClass
    });
});

/**
 * @desc    Delete a single class
 * @route   DELETE /api/v1/classes/:classId
 * @access  Private (SUPER_ADMIN, ADMIN, OPS, BATCHOPS, TEACHER)
 */
export const deleteClass = catchAsync(async (req: Request, res: Response) => {
    const { classId } = req.params;

    const existingClass = await prisma.class.findUnique({
        where: { id: classId! },
        include: {
            subject: {
                select: {
                    teacher: {
                        select: { id: true, googleRefreshToken: true }
                    }
                }
            }
        }
    });

    if (!existingClass) throw new AppError('Class not found', 404);

    // [Add your authorization logic here]

    // Delete from Google Calendar first
    if (existingClass.googleEventId && existingClass.subject.teacher.googleRefreshToken) {
        try {
            await googleCalendarService.deleteCalendarEvent(
                existingClass.subject.teacher.id,
                existingClass.googleEventId
            );
        } catch (error) {
            console.error(`Could not delete Google event ${existingClass.googleEventId}. Proceeding with DB deletion.`, error);
            // Continue with database deletion even if Google Calendar deletion fails
        }
    }

    await prisma.class.delete({ where: { id: classId! } });

    res.status(204).send();
});


export const getClasses = catchAsync(async (req: Request, res: Response) => {
    const {
        subject_id,
        teacher_id,
        division_id,
        room_id,
        start_date,
        end_date
    } = req.query;

    const whereClause: any = {};

    if (subject_id) whereClause.subject_id = subject_id;
    if (teacher_id) whereClause.teacher_id = teacher_id;
    if (division_id) whereClause.division_id = division_id;
    if (room_id) whereClause.room_id = room_id;

    if (start_date || end_date) {
        whereClause.AND = [];
        if (start_date) {
            whereClause.AND.push({ start_date: { gte: new Date(start_date as string) } });
        }
        if (end_date) {
            whereClause.AND.push({ end_date: { lte: new Date(end_date as string) } });
        }
    }

    const classes = await prisma.class.findMany({
        where: whereClause,
        include: {
            subject: { select: { name: true, code: true } },
            teacher: { select: { name: true, email: true } },
            division: { select: { code: true } },
            room: { select: { name: true } }
        },
        orderBy: { start_date: 'asc' }
    });

    res.status(200).json({
        success: true,
        data: classes,
        count: classes.length
    });
});

/**
 * @desc    Get a single class by ID
 * @route   GET /api/v1/classes/:classId
 * @access  Private
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
                    student: { select: { name: true, email: true } }
                }
            }
        }
    });

    if (!classData) throw new AppError('Class not found', 404);

    res.status(200).json({
        success: true,
        data: classData
    });
});