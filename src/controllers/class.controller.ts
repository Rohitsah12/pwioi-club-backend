// src/controllers/class.controller.ts

import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../utils/AppError.js';
import { googleCalendarService } from '../service/googleCalendarService.js';
import { createWeeklyScheduleSchema, updateClassSchema } from '../schema/classSchema.js';
import { addDays, format, getDay } from 'date-fns';
import { Prisma } from '@prisma/client';

// ==================== UTILITY FUNCTIONS ====================

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

// ==================== CPR HELPER FUNCTIONS ====================

/**
 * Finds the correct CprSubTopic for a given lecture number within a subject.
 */
async function findSubTopicForLecture(
    tx: Prisma.TransactionClient,
    subjectId: string,
    lectureNumber: number
): Promise<string | null> {
    const allSubTopics = await tx.cprSubTopic.findMany({
        where: {
            topic: {
                module: {
                    subject_id: subjectId,
                },
            },
        },
        orderBy: [
            { topic: { module: { order: 'asc' } } },
            { topic: { order: 'asc' } },
            { order: 'asc' },
        ],
        select: { id: true, lecture_count: true },
    });

    if (allSubTopics.length === 0) return null;

    let cumulativeLectures = 0;
    for (const subTopic of allSubTopics) {
        cumulativeLectures += subTopic.lecture_count;
        if (lectureNumber <= cumulativeLectures) {
            return subTopic.id;
        }
    }

    return null;
}

/**
 * Updates the planned_start_date and planned_end_date of a CprSubTopic
 * based on its associated classes.
 */
async function updateCprSubTopicPlannedDates(
    tx: Prisma.TransactionClient,
    subTopicId: string
) {
    const subTopic = await tx.cprSubTopic.findUnique({
        where: { id: subTopicId },
        select: { lecture_count: true },
    });

    if (!subTopic) return;

    const classes = await tx.class.findMany({
        where: { sub_topic_id: subTopicId },
        orderBy: { start_date: 'asc' },
    });

    let planned_start_date: Date | null = null;
    let planned_end_date: Date | null = null;

    if (classes.length > 0) {
        planned_start_date = classes[0]!.start_date;

        if (classes.length >= subTopic.lecture_count) {
            planned_end_date = classes[subTopic.lecture_count - 1]!.start_date;
        }
    }

    await tx.cprSubTopic.update({
        where: { id: subTopicId },
        data: { planned_start_date, planned_end_date },
    });
}

// ==================== CONTROLLERS ====================

export const createWeeklySchedule = catchAsync(async (req: Request, res: Response) => {
    const validation = createWeeklyScheduleSchema.safeParse(req.body);
    if (!validation.success) {
        throw new AppError('Validation failed', 400);
    }

    const { subject_id, room_id, start_date, end_date, schedule_items } = validation.data;

    // Fetch subject with required relations
    const subject = await prisma.subject.findUnique({
        where: { id: subject_id },
        include: {
            teacher: { select: { id: true, googleRefreshToken: true } },
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
    if (!subject.semester.division) throw new AppError('Division not found', 404);

    const room = room_id ? await prisma.room.findUnique({ where: { id: room_id } }) : null;
    if (room_id && !room) throw new AppError('Room not found', 404);

    const teacherId = subject.teacher.id;
    const divisionId = subject.semester.division.id;
    const hasCalendarIntegration = !!subject.teacher.googleRefreshToken;
    const studentEmails = subject.semester.division.students.map((s) => s.email);

    // Generate potential classes
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

            if (startDateTime < new Date()) continue; // Skip past times

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
            message: 'No valid classes to schedule in the given range.',
            data: [],
        });
    }

    // Conflict checks
    for (const pClass of potentialClasses) {
        // Room conflict
        if (room_id) {
            const roomConflict = await prisma.class.findFirst({
                where: {
                    room_id,
                    id: { not: undefined! }, // ensure not self
                    OR: [
                        {
                            start_date: { lte: pClass.start_date },
                            end_date: { gt: pClass.start_date },
                        },
                        {
                            start_date: { lt: pClass.end_date },
                            end_date: { gte: pClass.end_date },
                        },
                        {
                            start_date: { gte: pClass.start_date },
                            end_date: { lte: pClass.end_date },
                        },
                    ],
                },
            });
            if (roomConflict) {
                throw new AppError(
                    `Room conflict on ${format(pClass.start_date, 'PPP p')}`,
                    409
                );
            }
        }

        // Teacher DB conflict
        const teacherConflict = await prisma.class.findFirst({
            where: {
                teacher_id: teacherId,
                id: { not: undefined! },
                OR: [
                    {
                        start_date: { lte: pClass.start_date },
                        end_date: { gt: pClass.start_date },
                    },
                    {
                        start_date: { lt: pClass.end_date },
                        end_date: { gte: pClass.end_date },
                    },
                    {
                        start_date: { gte: pClass.start_date },
                        end_date: { lte: pClass.end_date },
                    },
                ],
            },
        });
        if (teacherConflict) {
            throw new AppError(
                `Teacher has a conflict on ${format(pClass.start_date, 'PPP p')}`,
                409
            );
        }

        // Google Calendar check
        if (hasCalendarIntegration) {
            const isAvailable = await googleCalendarService.isTimeSlotAvailable(
                teacherId,
                pClass.start_date,
                pClass.end_date
            );
            if (!isAvailable) {
                throw new AppError(
                    `Teacher is busy on Google Calendar: ${format(pClass.start_date, 'PPP p')}`,
                    409
                );
            }
        }
    }

    // Create classes with CPR integration
    const createdClasses = await prisma.$transaction(async (tx) => {
        const affectedSubTopicIds = new Set<string>();

        const newClasses = await Promise.all(
            potentialClasses.map(async (pClass) => {
                const subTopicId = await findSubTopicForLecture(tx, subject_id, pClass.lecture_number);
                if (subTopicId) affectedSubTopicIds.add(subTopicId);

                const classData = await tx.class.create({
                    data: {
                        subject_id,
                        division_id: divisionId,
                        teacher_id: teacherId,
                        room_id: room_id || undefined,
                        start_date: pClass.start_date,
                        end_date: pClass.end_date,
                        lecture_number: String(pClass.lecture_number),
                        sub_topic_id: subTopicId,
                        googleEventId: '',
                    } as any,
                });

                return { classData, subTopicId };
            })
        );

        // Update planned dates for affected sub-topics
        for (const subTopicId of affectedSubTopicIds) {
            await updateCprSubTopicPlannedDates(tx, subTopicId);
        }

        return newClasses.map(({ classData }) => classData);
    });

    // Sync with Google Calendar
    if (hasCalendarIntegration) {
        for (const cls of createdClasses) {
            try {
                const calendarEvent = {
                    summary: `${subject.name} - Lecture ${cls.lecture_number}`,
                    description: `Subject: ${subject.name}\nLecture: ${cls.lecture_number}`,
                    startDateTime: cls.start_date,
                    endDateTime: cls.end_date,
                    attendees: studentEmails,
                    ...(room && { location: room.name }),
                };

                const googleEventId = await googleCalendarService.createCalendarEvent(
                    teacherId,
                    calendarEvent
                );

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
            room: true,
            division: true,
        },
    });

    if (!existingClass) throw new AppError('Class not found', 404);

    const oldSubTopicId = existingClass.sub_topic_id;
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

    // Conflict checks if time or room changes
    if (updatePayload.start_date || updatePayload.end_date || updatePayload.room_id) {
        const newStart = updatePayload.start_date || existingClass.start_date;
        const newEnd = updatePayload.end_date || existingClass.end_date;
        const newRoomId = updatePayload.room_id ?? existingClass.room_id;

        if (newRoomId) {
            const roomConflict = await prisma.class.findFirst({
                where: {
                    room_id: newRoomId,
                    id: { not: classId! },
                    OR: [
                        { start_date: { lte: newStart }, end_date: { gt: newStart } },
                        { start_date: { lt: newEnd }, end_date: { gte: newEnd } },
                        { start_date: { gte: newStart }, end_date: { lte: newEnd } },
                    ],
                },
            });
            if (roomConflict) throw new AppError('Room is already booked', 409);
        }

        const teacherConflict = await prisma.class.findFirst({
            where: {
                teacher_id: existingClass.teacher_id,
                id: { not: classId! },
                OR: [
                    { start_date: { lte: newStart }, end_date: { gt: newStart } },
                    { start_date: { lt: newEnd }, end_date: { gte: newEnd } },
                    { start_date: { gte: newStart }, end_date: { lte: newEnd } },
                ],
            },
        });
        if (teacherConflict) throw new AppError('Teacher has a conflict', 409);
    }

    // Update class and manage CPR linkage
    const updatedClass = await prisma.$transaction(async (tx) => {
        let newSubTopicId: string | null = oldSubTopicId;

        if (updateData.lecture_number) {
            newSubTopicId = await findSubTopicForLecture(
                tx,
                existingClass.subject_id,
                Number(updateData.lecture_number)
            );
        }

        const updated = await tx.class.update({
            where: { id: classId! },
            data: {
                ...updatePayload,
                sub_topic_id: newSubTopicId,
            },
        });

        // Update old and new sub-topic dates
        if (oldSubTopicId && oldSubTopicId !== newSubTopicId) {
            await updateCprSubTopicPlannedDates(tx, oldSubTopicId);
        }
        if (newSubTopicId) {
            await updateCprSubTopicPlannedDates(tx, newSubTopicId);
        }

        return updated;
    });

    // Sync Google Calendar
    if (existingClass.googleEventId && existingClass.subject.teacher.googleRefreshToken) {
        try {
            const eventUpdate: any = {
                summary: `${existingClass.subject.name} - Lecture ${updatedClass.lecture_number}`,
            };
            if (updatePayload.start_date || updatePayload.end_date) {
                eventUpdate.startDateTime = updatedClass.start_date;
                eventUpdate.endDateTime = updatedClass.end_date;
            }
            await googleCalendarService.updateCalendarEvent(
                existingClass.subject.teacher.id,
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

export const deleteClass = catchAsync(async (req: Request, res: Response) => {
    const { classId } = req.params;

    const existingClass = await prisma.class.findUnique({
        where: { id: classId! },
        include: {
            subject: { select: { teacher: { select: { id: true, googleRefreshToken: true } } } },
        },
    });

    if (!existingClass) throw new AppError('Class not found', 404);

    const subTopicId = existingClass.sub_topic_id;

    // Delete Google Calendar event
    if (existingClass.googleEventId && existingClass.subject.teacher.googleRefreshToken) {
        try {
            await googleCalendarService.deleteCalendarEvent(
                existingClass.subject.teacher.id,
                existingClass.googleEventId
            );
        } catch (error) {
            console.error('Failed to delete Google event, proceeding with DB deletion:', error);
        }
    }

    await prisma.$transaction(async (tx) => {
        await tx.class.delete({ where: { id: classId! } });

        if (subTopicId) {
            await updateCprSubTopicPlannedDates(tx, subTopicId);
        }
    });

    res.status(204).send();
});

export const getClasses = catchAsync(async (req: Request, res: Response) => {
    const { subject_id, teacher_id, division_id, room_id, start_date, end_date } = req.query;

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
            room: { select: { name: true } },
            subTopic: {
                select: {
                    id: true,
                    name: true,
                    topic: { select: { name: true, module: { select: { name: true } } } },
                },
            },
        },
        orderBy: { start_date: 'asc' },
    });

    res.status(200).json({
        success: true,
        data: classes,
        count: classes.length,
    });
});

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
            subTopic: {
                select: {
                    id: true,
                    name: true,
                    lecture_count: true,
                    topic: {
                        select: {
                            name: true,
                            module: { select: { name: true, order: true } },
                        },
                    },
                },
            },
        },
    });

    if (!classData) throw new AppError('Class not found', 404);

    res.status(200).json({
        success: true,
        data: classData,
    });
});