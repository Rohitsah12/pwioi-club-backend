import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/AppError.js";
import { AuthorRole } from "../types/postApi.js";
import { catchAsync } from "../utils/catchAsync.js";

interface CreateSchoolsBody {
  centerId: string;
  schoolNames: string[];
}

export const createSchools = catchAsync(async (req: Request<{}, {}, CreateSchoolsBody>, res: Response, next: NextFunction) => {
  const { centerId, schoolNames } = req.body;
  const { role } = req.user!;

  if (!centerId || !Array.isArray(schoolNames) || schoolNames.length === 0) {
    throw new AppError("centerId and non-empty schoolNames array are required", 400);
  }

  const upperCaseNames = schoolNames.map(name => name.trim().toUpperCase());
  const validSchoolNames = ["SOT", "SOM", "SOH"];

  for (const name of upperCaseNames) {
    if (!validSchoolNames.includes(name)) {
      throw new AppError(`Invalid school name: ${name}`, 400);
    }
  }

  // ADMIN and SUPER_ADMIN can add schools to any center
  if (role === AuthorRole.SUPER_ADMIN || role === AuthorRole.ADMIN) {
    // check center exists
    const center = await prisma.center.findUnique({
      where: { id: centerId }
    });
    if (!center) throw new AppError("Center not found", 404);
  } else {
    throw new AppError("Role not allowed to add schools", 403);
  }

  const schoolsToCreate = upperCaseNames.map(name => ({
    center_id: centerId,
    name: name as "SOT" | "SOM" | "SOH"
  }));

  try {
    await prisma.school.createMany({
      data: schoolsToCreate
    });
  } catch (err: any) {
    if (err.code === "P2002") {
      return next(new AppError("A school with this name already exists in the same center", 400));
    }
    throw err;
  }

  const schools = await prisma.school.findMany({
    where: { center_id: centerId },
    orderBy: { name: "asc" }
  });

  res.status(201).json({
    success: true,
    message: "Schools added successfully",
    data: schools
  });
});

export const getAllSchools = catchAsync(async (
  req: Request,
  res: Response
) => {
  const { centerId } = req.params;
  if (!centerId) {
    throw new AppError("centerId required", 400);
  }
  const { role, id } = req.user!;

  // ADMIN and SUPER_ADMIN can access all centers' schools
  if (role === AuthorRole.SUPER_ADMIN || role === AuthorRole.ADMIN) {
    const schools = await prisma.school.findMany({
      where: { center_id: centerId },
      orderBy: { name: "asc" },
      select: { id: true, name: true }
    });
    return res.status(200).json({ success: true, count: schools.length, data: schools });
  }

  // Teacher can only access their own center
  if (role === AuthorRole.TEACHER) {
    const teacher = await prisma.teacher.findUnique({
      where: { id: id },
      select: { center_id: true }
    });
    if (!teacher) throw new AppError("Teacher not found", 404);
    if (teacher.center_id !== centerId) {
      throw new AppError("Not authorized to access schools of this center", 403);
    }
    const schools = await prisma.school.findMany({
      where: { center_id: centerId },
      orderBy: { name: "asc" },
      select: { id: true, name: true }
    });
    return res.status(200).json({ success: true, count: schools.length, data: schools });
  }

  throw new AppError("Role not permitted", 403);
});

export const deleteSchool = catchAsync(async (req: Request, res: Response) => {
  const { schoolId } = req.params;
  if (!schoolId) throw new AppError("schoolId is required", 400);

  const { role } = req.user!;

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true, center_id: true }
  });
  if (!school) throw new AppError("School not found", 404);

  const center = await prisma.center.findUnique({
    where: { id: school.center_id }
  });
  if (!center) throw new AppError("Center not found", 404);

  // ADMIN and SUPER_ADMIN can delete schools in any center
  if (role !== AuthorRole.SUPER_ADMIN && role !== AuthorRole.ADMIN) {
    throw new AppError("Role not permitted to delete schools", 403);
  }

  await prisma.school.delete({ where: { id: schoolId } });
  res.status(200).json({
    success: true,
    message: "School deleted successfully"
  });
});

export const getSchoolStats = catchAsync(async (
  req: Request,
  res: Response
) => {
  const { schoolId } = req.params;
  if (!schoolId) {
    throw new AppError("School Id required", 400)
  }
  const { role } = req.user!;

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      id: true,
      center_id: true,
      batches: true,
      students: true,
      teacherSchools: {
        select: {
          teacher: true
        }
      }
    }
  });

  if (!school) {
    throw new AppError("School not found", 404);
  }

  // ADMIN and SUPER_ADMIN can get stats in any center
  if (role !== AuthorRole.SUPER_ADMIN && role !== AuthorRole.ADMIN) {
    throw new AppError("Role not permitted to access school stats", 403);
  }

  const [batchCount, divisionCount, studentCount, teacherCount] = await Promise.all([
    prisma.batch.count({ where: { school_id: schoolId } }),
    prisma.division.count({ where: { school_id: schoolId } }),
    prisma.student.count({ where: { school_id: schoolId } }),
    prisma.teacherSchool.count({ where: { school_id: schoolId } })
  ]);

  res.status(200).json({
    success: true,
    data: {
      batches: batchCount,
      divisions: divisionCount,
      students: studentCount,
      teachers: teacherCount
    }
  });
});

export const updateSchool = catchAsync(async (
  req: Request,
  res: Response
) => {
  const { schoolId } = req.params;
  const updates = req.body;
  const { role } = req.user!;

  if (!schoolId) {
    throw new AppError("schoolId is required", 400);
  }
  if (updates.name !== undefined && typeof updates.name !== "string") {
    throw new AppError("Invalid name field", 400);
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true, center_id: true, name: true }
  });

  if (!school) {
    throw new AppError("School not found", 404);
  }

  // ADMIN and SUPER_ADMIN can update schools in any center
  if (role !== AuthorRole.SUPER_ADMIN && role !== AuthorRole.ADMIN) {
    throw new AppError("Role not permitted to update school", 403);
  }

  if (updates.name) {
    updates.name = updates.name.trim();
    if (updates.name === "") {
      throw new AppError("Name cannot be empty", 400);
    }
  }

  // Perform update
  const updatedSchool = await prisma.school.update({
    where: { id: schoolId },
    data: {
      ...updates,
      updatedAt: new Date()
    }
  });

  res.status(200).json({
    success: true,
    message: "School updated successfully",
    data: updatedSchool
  });
});
