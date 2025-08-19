import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";
import { AuthorRole } from "../types/postApi.js";

interface CreateSemesterRequest {
    divisionId: string;
    number: number;
    startDate: string;
    endDate: string;
}

export const createSemester = catchAsync(async (
    req: Request<{}, {}, CreateSemesterRequest>,
    res: Response
) => {
    const { divisionId, number, startDate, endDate } = req.body;
    const { role } = req.user!;

    if (!divisionId || !number || !startDate || !endDate) {
        throw new AppError("divisionId, number, startDate and endDate are required", 400);
    }

    if (isNaN(number) || number < 1) {
        throw new AppError("number must be a positive integer", 400);
    }

    if (isNaN(Date.parse(startDate)) || isNaN(Date.parse(endDate))) {
        throw new AppError("Invalid date format for startDate or endDate", 400);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
        throw new AppError("startDate must be before endDate", 400);
    }

    const division = await prisma.division.findUnique({
        where: { id: divisionId },
        select: {
            id: true,
            center_id: true,
            start_date: true,
            end_date: true
        }
    });

    if (!division) {
        throw new AppError("Division not found", 404);
    }

    if (!division.start_date || !division.end_date) {
        throw new AppError("Division start_date and end_date must be defined", 400);
    }

    if (start < division.start_date || end > division.end_date) {
        throw new AppError("Semester dates must be within the division's start_date and end_date", 400);
    }

    // Allow both ADMIN and SUPER_ADMIN full access
    if (role !== AuthorRole.ADMIN && role !== AuthorRole.SUPER_ADMIN) {
        throw new AppError("Role not permitted to create semester", 403);
    }

    const existingSemester = await prisma.semester.findFirst({
        where: { division_id: divisionId, number }
    });

    if (existingSemester) {
        throw new AppError(`Semester number ${number} already exists in this division`, 400);
    }

    const semester = await prisma.semester.create({
        data: {
            division_id: divisionId,
            number,
            start_date: start,
            end_date: end
        }
    });

    res.status(201).json({
        success: true,
        message: "Semester created successfully",
        data: semester
    });
});

export const getAllSemester = catchAsync(async (
    req: Request,
    res: Response
) => {
    const { divisionId } = req.params;
    const { role, sub } = req.user!;

    if (!divisionId) {
        throw new AppError("divisionId is required", 400);
    }

    // Fetch division and its center_id for validation
    const division = await prisma.division.findUnique({
        where: { id: divisionId },
        select: { center_id: true }
    });

    if (!division) {
        throw new AppError("Division not found", 404);
    }

    // Allow ADMIN and SUPER_ADMIN full access, keep TEACHER restriction
    if (role === AuthorRole.TEACHER) {
        const teacher = await prisma.teacher.findUnique({
            where: { id: sub },
            select: { center_id: true }
        });

        if (!teacher) {
            throw new AppError("Teacher not found", 404);
        }

        if (teacher.center_id !== division.center_id) {
            throw new AppError("Not authorized to access semesters of this division", 403);
        }
    } else if (role !== AuthorRole.ADMIN && role !== AuthorRole.SUPER_ADMIN) {
        throw new AppError("Role not permitted to access semesters", 403);
    }

    const semesters = await prisma.semester.findMany({
        where: { division_id: divisionId },
        orderBy: { number: "asc" }
    });

    res.status(200).json({
        success: true,
        count: semesters.length,
        data: semesters
    });
});

interface UpdateSemesterRequest {
    number?: number;
    startDate?: string; // ISO string
    endDate?: string;   // ISO string
}

export const updateSemester = catchAsync(async (
    req: Request,
    res: Response
) => {
    const semesterIdParam = req.params.semesterId;
    const { number, startDate, endDate } = req.body as UpdateSemesterRequest;
    const { role } = req.user!;

    if (!semesterIdParam || typeof semesterIdParam !== 'string') {
        throw new AppError("semesterId is required", 400);
    }

    const semesterId: string = semesterIdParam;

    const semester = await prisma.semester.findUnique({
        where: { id: semesterId },
        select: { division_id: true, number: true, start_date: true, end_date: true }
    });

    if (!semester) {
        throw new AppError("Semester not found", 404);
    }

    const division = await prisma.division.findUnique({
        where: { id: semester.division_id },
        select: { start_date: true, end_date: true, center_id: true }
    });

    if (!division) {
        throw new AppError("Division not found", 404);
    }

    // Allow both ADMIN and SUPER_ADMIN full access
    if (role !== AuthorRole.ADMIN && role !== AuthorRole.SUPER_ADMIN) {
        throw new AppError("Role not permitted to update semester", 403);
    }

    const updateData: any = {};

    if (number !== undefined) {
        if (!Number.isInteger(number) || number < 1) {
            throw new AppError("number must be a positive integer", 400);
        }

        if (number !== semester.number) {
            const existing = await prisma.semester.findFirst({
                where: {
                    division_id: semester.division_id,
                    number,
                    NOT: { id: semesterId }
                }
            });
            if (existing) {
                throw new AppError(`Semester number ${number} already exists in this division`, 400);
            }
        }

        updateData.number = number;
    }

    if (startDate !== undefined) {
        if (isNaN(Date.parse(startDate))) {
            throw new AppError("Invalid startDate format", 400);
        }
        const start = new Date(startDate);
        if (division.start_date && start < division.start_date) {
            throw new AppError("startDate cannot be before division start_date", 400);
        }
        updateData.start_date = start;
    }

    if (endDate !== undefined) {
        if (isNaN(Date.parse(endDate))) {
            throw new AppError("Invalid endDate format", 400);
        }
        const end = new Date(endDate);
        if (division.end_date && end > division.end_date) {
            throw new AppError("endDate cannot be after division end_date", 400);
        }
        updateData.end_date = end;
    }

    if (
        updateData.start_date !== undefined &&
        updateData.end_date !== undefined &&
        updateData.start_date >= updateData.end_date
    ) {
        throw new AppError("startDate must be before endDate", 400);
    }

    if (
        updateData.start_date !== undefined &&
        updateData.end_date === undefined &&
        semester.end_date &&
        updateData.start_date >= semester.end_date
    ) {
        throw new AppError("startDate must be before endDate", 400);
    }

    if (
        updateData.end_date !== undefined &&
        updateData.start_date === undefined &&
        semester.start_date &&
        semester.start_date >= updateData.end_date
    ) {
        throw new AppError("startDate must be before endDate", 400);
    }

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
            success: false,
            message: "No valid fields provided for update"
        });
    }

    updateData.updatedAt = new Date();

    const updatedSemester = await prisma.semester.update({
        where: { id: semesterId },
        data: updateData
    });

    res.status(200).json({
        success: true,
        message: "Semester updated successfully",
        data: updatedSemester
    });
});

export const deleteDivision = catchAsync(async (
    req: Request,
    res: Response
) => {
    const { divisionId } = req.params;
    const { role } = req.user!;

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

export const deleteSemester = catchAsync(async (
    req: Request,
    res: Response
) => {
    const { semesterId } = req.params;
    const { role } = req.user!;

    if (!semesterId) {
        throw new AppError("semesterId is required", 400);
    }

    const semester = await prisma.semester.findUnique({
        where: { id: semesterId },
        select: { division_id: true, end_date: true }
    });

    if (!semester) {
        throw new AppError("Semester not found", 404);
    }

    if (semester.end_date && new Date() > semester.end_date) {
        throw new AppError("Cannot delete a semester that has already ended", 400);
    }

    const division = await prisma.division.findUnique({
        where: { id: semester.division_id },
        select: { center_id: true }
    });

    if (!division) {
        throw new AppError("Division not found", 404);
    }

    // Allow both ADMIN and SUPER_ADMIN full access
    if (role !== AuthorRole.ADMIN && role !== AuthorRole.SUPER_ADMIN) {
        throw new AppError("Role not permitted to delete semester", 403);
    }

    // Proceed to delete semester
    await prisma.semester.delete({
        where: { id: semesterId }
    });

    res.status(200).json({
        success: true,
        message: "Semester deleted successfully"
    });
});

export const getSemesterDetails = catchAsync(async (
  req: Request,
  res: Response
) => {
  const { semesterId } = req.params;
  const { role } = req.user!;

  if (!semesterId) {
    throw new AppError("semesterId is required", 400);
  }

  // Fetch semester with division and subjects relations
  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    include: {
      division: { select: { center_id: true } },
      subjects: true // fetch subjects directly related to semester
    }
  });

  if (!semester) {
    throw new AppError("Semester not found", 404);
  }

  // Check if division exists (null safety)
  if (!semester.division) {
    throw new AppError("Semester division not found", 404);
  }

  // Allow both ADMIN and SUPER_ADMIN full access
  if (role !== AuthorRole.ADMIN && role !== AuthorRole.SUPER_ADMIN) {
    throw new AppError("Role not permitted to access semester details", 403);
  }

  // Count of students in semester (assuming student has semester_id)
  const studentCount = await prisma.student.count({
    where: { semester_id: semesterId }
  });

  // Count subjects directly related to this semester
  const subjectCount = semester.subjects.length;

  res.status(200).json({
    success: true,
    message: "Semester details retrieved successfully",
    data: {
      ...semester,
      student_count: studentCount,
      subject_count: subjectCount
    }
  });
});
