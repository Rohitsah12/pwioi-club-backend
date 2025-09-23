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

interface Batch {
    batch_name: string;
    batch_id: string;
    divisions: { [divisionCode: string]: Division };
}

interface School {
    school_name: string;
    school_id: string;
    batches: { [batchName: string]: Batch };
}

interface CenterData {
    center_name: string;
    center_location: string;
    date: string;
    schools: { [schoolName: string]: School };
    message?: string;
}

interface AttendanceResponse {
    [centerKey: string]: CenterData;
}

export const getAttendanceByCenter = catchAsync(async (req: Request, res: Response) => {
    const { centercode, date } = req.query as GetAttendanceQuery;

    if (!centercode || !date) {
        throw new AppError('Missing required parameters: centercode and date', 400);
    }

    const queryDate = new Date(date);
    const startDate = startOfDay(queryDate);
    const endDate = endOfDay(queryDate);

    const centerCode = parseInt(centercode);
    if (isNaN(centerCode)) {
        throw new AppError('Invalid centercode format. Must be a number.', 400);
    }

    const centerData = await prisma.center.findFirst({
        where: {
            code: centerCode
        },
        include: {
            schools: {
                include: {
                    batches: {
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
            schools: {}
        }
    };

    let hasAnyClasses = false;

    // Process each school
    centerData.schools.forEach(school => {
        const schoolKey = school.name;
        
        response[centerKey]!.schools[schoolKey] = {
            school_name: school.name,
            school_id: school.id,
            batches: {}
        };

        // Process each batch in the school
        school.batches.forEach(batch => {
            const batchKey = batch.name;
            
            response[centerKey]!.schools[schoolKey]!.batches[batchKey] = {
                batch_name: batch.name,
                batch_id: batch.id,
                divisions: {}
            };

            // Process each division in the batch
            batch.divisions.forEach(division => {
                if (division.classes.length > 0) {
                    hasAnyClasses = true;
                    
                    response[centerKey]!.schools[schoolKey]!.batches[batchKey]!.divisions[division.code] = {
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

            // Remove batch if it has no divisions with classes
            if (Object.keys(response[centerKey]!.schools[schoolKey]!.batches[batchKey]!.divisions).length === 0) {
                delete response[centerKey]!.schools[schoolKey]!.batches[batchKey];
            }
        });

        // Remove school if it has no batches with classes
        if (Object.keys(response[centerKey]!.schools[schoolKey]!.batches).length === 0) {
            delete response[centerKey]!.schools[schoolKey];
        }
    });

    // If no classes found for the date, add message
    if (!hasAnyClasses) {
        response[centerKey]!.message = "No classes found for the specified date";
    }

    res.status(200).json({
        success: true,
        data: response
    });
});