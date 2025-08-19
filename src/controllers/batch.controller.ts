import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/AppError.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AuthorRole } from "../types/postApi.js";

interface CreateBatchRequest {
  schoolId: string;
  name: string;
}

export const createBatch = catchAsync(async (
  req: Request<{}, {}, CreateBatchRequest>,
  res: Response
) => {
  let { schoolId, name } = req.body;
  const { role } = req.user!;

  if (!schoolId || !name) {
    throw new AppError("schoolId and batch name are required", 400);
  }

  name = name.trim().toUpperCase();

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { center_id: true }
  });
  if (!school) {
    throw new AppError("School not found", 404);
  }
  const centerId = school.center_id;

  const existingBatch = await prisma.batch.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      center_id: centerId,
      school_id: schoolId
    },
  });
  if (existingBatch) {
    throw new AppError("Batch name already exists for this school in the center", 400);
  }

  if (role !== AuthorRole.ADMIN && role !== AuthorRole.SUPER_ADMIN) {
    throw new AppError("Role not permitted to create batch", 403);
  }

  const batch = await prisma.batch.create({
    data: {
      name,
      center_id: centerId,
      school_id: schoolId,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  });

  res.status(201).json({
    success: true,
    message: "Batch created successfully",
    data: batch
  });
});


export const getAllBatchesSchoolwise = catchAsync(async (
  req: Request,
  res: Response
) => {
  const { schoolId } = req.params;
  if (!schoolId) {
    throw new AppError("schoolId Required", 400);
  }
  const { role } = req.user!;

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { center_id: true }
  });
  if (!school) throw new AppError("School not found", 404);

  if (role === AuthorRole.ADMIN || role === AuthorRole.SUPER_ADMIN) {
    const batches = await prisma.batch.findMany({
      where: { school_id: schoolId },
      orderBy: { createdAt: "desc" }
    });
    return res.status(200).json({ success: true, count: batches.length, data: batches });
  }

  throw new AppError("Role not permitted", 403);
});


export const deleteBatch = catchAsync(async (
  req: Request,
  res: Response
) => {
  const { batchId } = req.params;
  if (!batchId) {
    throw new AppError("BatchId required", 400);
  }
  const { role } = req.user!;

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { id: true }
  });
  if (!batch) {
    throw new AppError("Batch not found", 404);
  }

  if (role !== AuthorRole.ADMIN && role !== AuthorRole.SUPER_ADMIN) {
    throw new AppError("Role not permitted to delete batch", 403);
  }

  await prisma.batch.delete({ where: { id: batchId } });

  res.status(200).json({
    success: true,
    message: "Batch deleted successfully"
  });
});


export const updateBatch = catchAsync(async (
  req: Request,
  res: Response
) => {
  const { batchId } = req.params;
  if (!batchId) {
    throw new AppError("batchId is required", 400);
  }

  let { name } = req.body;
  const { role } = req.user!;

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim() === "") {
      throw new AppError("Batch name must be a non-empty string", 400);
    }
    name = name.trim().toUpperCase();
  } else {
    return res.status(400).json({
      success: false,
      message: "No fields provided to update"
    });
  }

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { id: true, center_id: true, school_id: true, name: true }
  });

  if (!batch) {
    throw new AppError("Batch not found", 404);
  }

  if (role !== AuthorRole.ADMIN && role !== AuthorRole.SUPER_ADMIN) {
    throw new AppError("Role not permitted to update batch", 403);
  }

  if (batch.name.toUpperCase() === name) {
    return res.status(200).json({
      success: true,
      message: "Batch name unchanged",
      data: batch
    });
  }

  const existingBatch = await prisma.batch.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      center_id: batch.center_id,
      school_id: batch.school_id,
      NOT: { id: batchId }
    }
  });

  if (existingBatch) {
    throw new AppError("Another batch with the same name exists in this school and center", 400);
  }

  const updatedBatch = await prisma.batch.update({
    where: { id: batchId },
    data: { name, updatedAt: new Date() }
  });

  res.status(200).json({
    success: true,
    message: "Batch updated successfully",
    data: updatedBatch
  });
});


export const getBatchDetails = catchAsync(async (
  req: Request,
  res: Response
) => {
  const { batchId } = req.params;
  if (!batchId) {
    throw new AppError("BatchId required", 400);
  }
  const { role } = req.user!;

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      name: true,
      center_id: true,
      school_id: true,
      createdAt: true,
      updatedAt: true,
      center: {
        select: { id: true, name: true }
      },
      school: {
        select: { id: true, name: true }
      }
    }
  });

  if (!batch) {
    throw new AppError("Batch not found", 404);
  }

  const [studentCount, divisionCount] = await Promise.all([
    prisma.student.count({ where: { batch_id: batchId } }),
    prisma.division.count({ where: { batch_id: batchId } }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      batch,
      stats: {
        totalStudents: studentCount,
        totalDivisions: divisionCount
      }
    }
  });
});
