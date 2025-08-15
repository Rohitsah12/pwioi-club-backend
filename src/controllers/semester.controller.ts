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
  const { role, sub } = req.user!;

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

  if (role === AuthorRole.ADMIN) {
    const center = await prisma.center.findUnique({
      where: { id: division.center_id },
      select: { business_head: true, academic_head: true }
    });

    if (!center) {
      throw new AppError("Center not found", 404);
    }

    if (center.business_head !== sub && center.academic_head !== sub) {
      throw new AppError("Not authorized to create semester in this division", 403);
    }
  } else if (role !== AuthorRole.SUPER_ADMIN) {
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
