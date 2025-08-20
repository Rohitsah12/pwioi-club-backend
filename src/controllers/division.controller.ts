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

    // Allow both ADMIN and SUPER_ADMIN full access
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
    start_date?: string;      // ISO string
    end_date?: string;        // ISO string
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
        select: { id: true, center_id: true }
    });

    if (!division) {
        throw new AppError("Division not found", 404);
    }

    // Allow both ADMIN and SUPER_ADMIN full access
    if (role !== AuthorRole.ADMIN && role !== AuthorRole.SUPER_ADMIN) {
        throw new AppError("Role not permitted to update division", 403);
    }

    const data: any = {};

    if (updates.code !== undefined) {
        if (typeof updates.code !== "string" || updates.code.trim() === "") {
            throw new AppError("code must be a non-empty string", 400);
        }
        data.code = updates.code.trim().toUpperCase();
    }

    if (updates.start_date !== undefined) {
        if (isNaN(Date.parse(updates.start_date))) {
            throw new AppError("Invalid start_date format", 400);
        }
        data.start_date = new Date(updates.start_date);
    }

    if (updates.end_date !== undefined) {
        if (isNaN(Date.parse(updates.end_date))) {
            throw new AppError("Invalid end_date format", 400);
        }
        data.end_date = new Date(updates.end_date);
    }

    if (updates.center_id !== undefined) {
        throw new AppError("Changing center_id is not allowed", 400);
    }

    if (updates.school_id !== undefined) {
        throw new AppError("Changing school_id is not allowed", 400);
    }

    if (updates.current_semester !== undefined) {
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
    }

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

    // Fetch the division with center info for authorization
    const division = await prisma.division.findUnique({
        where: { id: divisionId },
        select: { center_id: true }
    });

    if (!division) {
        throw new AppError("Division not found", 404);
    }

    // Allow both ADMIN and SUPER_ADMIN full access
    if (role !== AuthorRole.ADMIN && role !== AuthorRole.SUPER_ADMIN) {
        throw new AppError("Role not permitted to delete division", 403);
    }

    // Proceed to delete the division
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

    const centerId = batch.center_id;

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

    // Get school with center_id
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


    // Fetch division details without relations
    const division = await prisma.division.findUnique({
        where: { id: divisionId },
    });

    if (!division) {
        throw new AppError("Division not found", 404);
    }

    const studentCount = await prisma.student.count({
        where: { division_id: divisionId }
    });

    res.status(200).json({
        success: true,
        message: "Division details retrieved successfully",
        data: {
            ...division,
            student_count: studentCount
        }
    });
});
