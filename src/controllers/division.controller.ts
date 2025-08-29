import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";
import { AuthorRole } from "../types/postApi.js";

interface CreateDivisionRequest {
    batchId: string;
    code: string;
    startDate?: string;
    endDate: string;
}

export const createDivision = catchAsync(async (
    req: Request<{}, {}, CreateDivisionRequest>,
    res: Response
) => {
    const { batchId, code, startDate, endDate } = req.body;
    const { role, id } = req.user!;

    if (!batchId || !code || !endDate) {
        throw new AppError("batchId, code, and endDate are required", 400);
    }

    if (startDate && isNaN(Date.parse(startDate))) {
        throw new AppError("Invalid startDate format", 400);
    }

    if (isNaN(Date.parse(endDate))) {
        throw new AppError("Invalid endDate format", 400);
    }

    const batch = await prisma.batch.findUnique({
        where: { id: batchId },
        select: { center_id: true, school_id: true }
    });

    if (!batch) {
        throw new AppError("Batch not found", 404);
    }

    const { center_id: centerId, school_id: schoolId } = batch;

    if (role !== AuthorRole.ADMIN && role !== AuthorRole.SUPER_ADMIN) {
        throw new AppError("Role not permitted to create division", 403);
    }

    const divisionData = {
        batch_id: batchId,
        center_id: centerId,
        school_id: schoolId,
        code: code.trim().toUpperCase(),
        start_date: startDate ? new Date(startDate) : new Date(),
        end_date: new Date(endDate),
    };

    const division = await prisma.division.create({
        data: divisionData,
    });

    res.status(201).json({
        success: true,
        message: "Division created successfully",
        data: division,
    });
});

interface UpdateDivisionRequest {
    code?: string;
    start_date?: string;
    end_date?: string;
    current_semester?: string; // semesterId
    center_id?: string;
    school_id?: string;
}

export const updateDivision = catchAsync(async (
    req: Request,
    res: Response
) => {
    const { divisionId } = req.params as { divisionId: string };
    const updates = req.body as UpdateDivisionRequest;
    const { role, id } = req.user!;

    if (!divisionId) {
        throw new AppError("divisionId is required", 400);
    }

    const division = await prisma.division.findUnique({
        where: { id: divisionId },
        select: { id: true, center_id: true, current_semester: true }
    });

    if (!division) {
        throw new AppError("Division not found", 404);
    }

    if (role !== AuthorRole.ADMIN && role !== AuthorRole.SUPER_ADMIN) {
        throw new AppError("Role not permitted to update division", 403);
    }

    const data: any = {};

    if (updates.code !== undefined) {
        data.code = updates.code.trim().toUpperCase();
    }
    if (updates.start_date !== undefined) {
        data.start_date = new Date(updates.start_date);
    }
    if (updates.end_date !== undefined) {
        data.end_date = new Date(updates.end_date);
    }
    if (updates.center_id !== undefined || updates.school_id !== undefined) {
        throw new AppError("Changing center_id or school_id is not allowed", 400);
    }

    // --- AUTOMATION LOGIC START --- //
    // This is the core logic for automatically updating students.
    if (updates.current_semester && updates.current_semester !== division.current_semester) {
        const semester = await prisma.semester.findUnique({
            where: { id: updates.current_semester }
        });
        if (!semester) {
            throw new AppError("Specified semester does not exist", 400);
        }
        if (semester.division_id !== divisionId) {
            throw new AppError("Semester does not belong to this division", 400);
        }
        data.current_semester = updates.current_semester;

        // Use a transaction to ensure both the division and all its students are updated successfully.
        await prisma.$transaction(async (tx) => {
            // 1. Update the division itself
            await tx.division.update({
                where: { id: divisionId },
                data: { current_semester: updates.current_semester!, updatedAt: new Date() }
            });

            // 2. Update all students in this division to point to the new semester
            await tx.student.updateMany({
                where: { division_id: divisionId },
                data: { semester_id: updates.current_semester! }
            });
        });

        // Since the transaction handles the update, we can send the response.
        const updatedDivision = await prisma.division.findUnique({ where: { id: divisionId } });
        return res.status(200).json({
            success: true,
            message: "Division and all associated students have been updated to the new semester.",
            data: updatedDivision
        });
    }
    // --- AUTOMATION LOGIC END --- //

    if (Object.keys(data).length === 0) {
        return res.status(400).json({
            success: false,
            message: "No valid fields provided for update"
        });
    }

    data.updatedAt = new Date();

    const updatedDivision = await prisma.division.update({
        where: { id: divisionId },
        data
    });

    res.status(200).json({
        success: true,
        message: "Division updated successfully",
        data: updatedDivision
    });
});

export const deleteDivision = catchAsync(async (req: Request, res: Response) => {
    const { divisionId } = req.params;
    const { role, id } = req.user!;

    if (!divisionId) {
        throw new AppError("divisionId is required", 400);
    }

    const division = await prisma.division.findUnique({
        where: { id: divisionId },
        select: { center_id: true }
    });

    if (!division) {
        throw new AppError("Division not found", 404);
    }

    if (role !== AuthorRole.ADMIN && role !== AuthorRole.SUPER_ADMIN) {
        throw new AppError("Role not permitted to delete division", 403);
    }

    await prisma.division.delete({
        where: { id: divisionId }
    });

    res.status(200).json({
        success: true,
        message: "Division deleted successfully"
    });
});

export const getDivisionBatch = catchAsync(async (
    req: Request,
    res: Response
) => {
    const { batchId } = req.params;
    const { role, id } = req.user!;

    if (!batchId) {
        throw new AppError("batchId is required", 400);
    }

    const batch = await prisma.batch.findUnique({
        where: { id: batchId },
        select: { center_id: true }
    });

    if (!batch) {
        throw new AppError("Batch not found", 404);
    }

    const divisions = await prisma.division.findMany({
        where: { batch_id: batchId },
        orderBy: { code: "asc" }
    });

    res.status(200).json({
        success: true,
        count: divisions.length,
        data: divisions
    });
});

export const getDivisionBySchool = catchAsync(async (
    req: Request,
    res: Response
) => {
    const { schoolId } = req.params;
    const { role, id } = req.user!;

    if (!schoolId) {
        throw new AppError("schoolId is required", 400);
    }

    const school = await prisma.school.findUnique({
        where: { id: schoolId },
        select: { center_id: true }
    });

    if (!school) {
        throw new AppError("School not found", 404);
    }

    const divisions = await prisma.division.findMany({
        where: { school_id: schoolId },
        orderBy: { code: "asc" }
    });

    res.status(200).json({
        success: true,
        count: divisions.length,
        data: divisions
    });
});

export const getDivisionByCenter = catchAsync(async (
    req: Request,
    res: Response
) => {
    const { centerId } = req.params;
    const { role, id } = req.user!;

    if (!centerId) {
        throw new AppError("centerId is required", 400);
    }

    const divisions = await prisma.division.findMany({
        where: { center_id: centerId },
        orderBy: { code: "asc" }
    });

    res.status(200).json({
        success: true,
        count: divisions.length,
        data: divisions
    });
});

export const getDivisionDetails = catchAsync(async (
    req: Request,
    res: Response
) => {
    const { divisionId } = req.params;
    const { role, id } = req.user!;

    if (!divisionId) {
        throw new AppError("divisionId is required", 400);
    }

    const divisionExists = await prisma.division.findUnique({
        where: { id: divisionId },
        select: { id: true, center_id: true }
    });

    if (!divisionExists) {
        throw new AppError("Division not found", 404);
    }

    const division = await prisma.division.findUnique({
        where: { id: divisionId },
        include: {
            currentSemester: {
                select: {
                    id: true,
                    number: true
                }
            },
            center: {
                select: {
                    id: true,
                    name: true,
                    code: true
                }
            },
            school: {
                select: {
                    id: true,
                    name: true
                }
            },
            batch: {
                select: {
                    id: true,
                    name: true
                }
            }
        }
    });

    if (!division) {
        throw new AppError("Division not found", 404);
    }

    const studentCount = await prisma.student.count({
        where: { division_id: divisionId }
    });

    const totalSemesters = await prisma.semester.count({
        where: { division_id: divisionId }
    });

    const allSemesters = await prisma.semester.findMany({
        where: { division_id: divisionId },
        select: { number: true },
        orderBy: { number: 'desc' }
    });

    const highestSemesterNumber = allSemesters.length > 0 ? allSemesters[0]!.number : 0;

    // Get unique teachers from both classes and subjects
    const uniqueTeacherIds = new Set();
    
    const teachersFromClasses = await prisma.teacher.findMany({
        where: {
            classes: {
                some: {
                    division_id: divisionId
                }
            }
        },
        select: { id: true }
    });

    const teachersFromSubjects = await prisma.teacher.findMany({
        where: {
            subjects: {
                some: {
                    semester: {
                        division_id: divisionId
                    }
                }
            }
        },
        select: { id: true }
    });

    [...teachersFromClasses, ...teachersFromSubjects].forEach(teacher => {
        uniqueTeacherIds.add(teacher.id);
    });

    const uniqueTeacherCount = uniqueTeacherIds.size;

    res.status(200).json({
        success: true,
        message: "Division details retrieved successfully",
        data: {
            ...division,
            current_semester: {
                id: division.currentSemester?.id || null,
                number: division.currentSemester?.number || null
            },
            total_semesters: totalSemesters,
            highest_semester_reached: highestSemesterNumber,
            student_count: studentCount,
            teacher_count: uniqueTeacherCount,
            counts: {
                students: studentCount,
                teachers: uniqueTeacherCount,
                total_semesters: totalSemesters
            }
        }
    });
});