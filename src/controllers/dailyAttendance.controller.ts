import type { Request, Response } from 'express';
import { startOfDay, endOfDay } from 'date-fns';
import { prisma } from '../db/prisma.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../utils/AppError.js';

interface GetAttendanceQuery {
    centercode?: string;
    date?: string;
}

interface Student {
    enrollment_id: string;
    student_name: string;
    status: string;
}

interface ClassData {
    students: Student[];
}

interface Division {
    division_name: string;
    division_id: string;
    classes: { [classKey: string]: ClassData };
}

interface CenterData {
    center_name: string;
    center_location: string;
    date: string;
    divisions: { [divisionCode: string]: Division };
    message?: string;
}

interface AttendanceResponse {
    [centerKey: string]: CenterData;
}

export const getAttendanceByCenter = catchAsync(async (req: Request, res: Response) => {
    const { centercode, date } = req.query as GetAttendanceQuery;

    // Validate required parameters
    if (!centercode || !date) {
        throw new AppError('Missing required parameters: centercode and date', 400);
    }

    // Parse date to get start and end of day
    const queryDate = new Date(date);
    const startDate = startOfDay(queryDate);
    const endDate = endOfDay(queryDate);

    // Convert centercode to number for comparison
    const centerCode = parseInt(centercode);
    if (isNaN(centerCode)) {
        throw new AppError('Invalid centercode format. Must be a number.', 400);
    }

    // Get center with divisions and their classes for the specified date
    const centerData = await prisma.center.findFirst({
        where: {
            code: centerCode
        },
        include: {
            divisions: {
                include: {
                    classes: {
                        where: {
                            start_date: {
                                gte: startDate,
                                lte: endDate
                            }
                        },
                        include: {
                            attendances: {
                                include: {
                                    student: {
                                        select: {
                                            enrollment_id: true,
                                            name: true
                                        }
                                    }
                                }
                            },
                            subject: {
                                select: {
                                    name: true
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    if (!centerData) {
        throw new AppError(`Center with code ${centercode} not found`, 404);
    }

    // Structure the response data
    const centerKey = `centercode-${centercode}`;
    const response: AttendanceResponse = {
        [centerKey]: {
            center_name: centerData.name,
            center_location: centerData.location,
            date: date,
            divisions: {}
        }
    };

    // Process each division
    centerData.divisions.forEach(division => {
        if (division.classes.length > 0) {
            response[centerKey]!.divisions[division.code] = {
                division_name: division.code,
                division_id: division.id,
                classes: division.classes.reduce((acc: { [classKey: string]: ClassData }, classItem) => {
                    // Format date as YYYY-MM-DD
                    const classDate = new Date(classItem.start_date).toISOString().split('T')[0];
                    
                    // Create class identifier: subjectname-lecturenumber-date
                    const classKey = `${classItem.subject.name}-${classItem.lecture_number}-${classDate}`;
                    
                    acc[classKey] = {
                        students: classItem.attendances.map(attendance => ({
                            enrollment_id: attendance.student.enrollment_id,
                            student_name: attendance.student.name,
                            status: attendance.status
                        }))
                    };
                    
                    return acc;
                }, {})
            };
        }
    });

    // If no divisions have classes for the date, add message
    const centerResponse = response[centerKey];
    if (Object.keys(centerResponse!.divisions).length === 0) {
        centerResponse!.divisions = {};
        centerResponse!.message = "No classes found for the specified date";
    }

    res.status(200).json({
        success: true,
        data: response
    });
});