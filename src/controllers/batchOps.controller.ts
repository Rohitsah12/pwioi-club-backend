import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";
import { RoleType } from "@prisma/client";

const addBatchOpsSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("A valid email is required"),
  phone: z.string().min(1, "Phone number is required"),
  designation: z.string().optional(),
  linkedin: z.string().url("LinkedIn must be a valid URL").optional(),
});

const updateBatchOpsSchema = addBatchOpsSchema.partial();

// Convert to Prisma update input
const toPrismaUpdateInput = (data: z.infer<typeof updateBatchOpsSchema>) => {
  const result: Record<string, any> = {};
  if (data.name !== undefined) result.name = { set: data.name };
  if (data.email !== undefined) result.email = { set: data.email };
  if (data.phone !== undefined) result.phone = { set: data.phone };
  if (data.designation !== undefined) result.designation = { set: data.designation };
  if (data.linkedin !== undefined) result.linkedin = { set: data.linkedin };
  return result;
};

const safeAdminSelect = {
  name: true,
  email: true,
  phone: true,
  designation: true,
};

export const AddBatchOps = catchAsync(async (req: Request, res: Response) => {
  const validation = addBatchOpsSchema.safeParse(req.body);
  if (!validation.success) throw new AppError(`Validation failed: ${validation.error.message}`, 400);

  const batchOpsData = validation.data;

  const existingAdmin = await prisma.admin.findFirst({
    where: { OR: [{ email: batchOpsData.email }, { phone: batchOpsData.phone }] },
  });
  if (existingAdmin) throw new AppError("An admin with this email or phone number already exists.", 409);

  const batchOpsRole = await prisma.roleAdmin.upsert({
    where: { role: RoleType.BATCHOPS },
    update: {},
    create: { role: RoleType.BATCHOPS },
  });

  const newBatchOpsMember = await prisma.admin.create({
    data: { ...batchOpsData, role_id: batchOpsRole.id } as any,
    select: safeAdminSelect,
  });

  res.status(201).json({ success: true, message: "BatchOps team member added successfully", data: newBatchOpsMember });
});

export const getALLBatchOps = catchAsync(async (req: Request, res: Response) => {
  const batchOpsMembers = await prisma.admin.findMany({
    where: { role: { role: RoleType.BATCHOPS } },
    select: safeAdminSelect,
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({ success: true, count: batchOpsMembers.length, data: batchOpsMembers });
});

export const getBatchOps = catchAsync(async (req: Request, res: Response) => {
  const { batchOpsId } = req.params;
  if (!batchOpsId) throw new AppError("BatchOps ID is required", 400);

  const batchOpsMember = await prisma.admin.findFirst({
    where: { id: batchOpsId, role: { role: RoleType.BATCHOPS } },
    select: safeAdminSelect,
  });

  if (!batchOpsMember) throw new AppError(`BatchOps team member with ID ${batchOpsId} not found`, 404);

  res.status(200).json({ success: true, data: batchOpsMember });
});

export const UpdateBatchOps = catchAsync(async (req: Request, res: Response) => {
  const { batchOpsId } = req.params;
  if (!batchOpsId) throw new AppError("BatchOps ID is required", 400);

  const validation = updateBatchOpsSchema.safeParse(req.body);
  if (!validation.success) throw new AppError(`Validation failed: ${validation.error.message}`, 400);

  const updateData = validation.data;

  const existingBatchOps = await prisma.admin.findFirst({
    where: { id: batchOpsId, role: { role: RoleType.BATCHOPS } },
  });
  if (!existingBatchOps) throw new AppError(`BatchOps team member with ID ${batchOpsId} not found`, 404);

  if (updateData.email || updateData.phone) {
    const conflictConditions: any[] = [];
    if (updateData.email) conflictConditions.push({ email: updateData.email });
    if (updateData.phone) conflictConditions.push({ phone: updateData.phone });

    const existingAdmin = await prisma.admin.findFirst({
      where: { AND: [{ id: { not: batchOpsId } }, { OR: conflictConditions }] },
    });
    if (existingAdmin) throw new AppError("An admin with this email or phone number already exists.", 409);
  }

  const updatedBatchOpsMember = await prisma.admin.update({
    where: { id: batchOpsId },
    data: toPrismaUpdateInput(updateData),
    select: safeAdminSelect,
  });

  res.status(200).json({ success: true, message: "BatchOps team member updated successfully", data: updatedBatchOpsMember });
});

export const deleteBatchOps = catchAsync(async (req: Request, res: Response) => {
  const { batchOpsId } = req.params;
  if (!batchOpsId) throw new AppError("BatchOps ID is required", 400);

  const existingBatchOps = await prisma.admin.findFirst({
    where: { id: batchOpsId, role: { role: RoleType.BATCHOPS } },
  });
  if (!existingBatchOps) throw new AppError(`BatchOps team member with ID ${batchOpsId} not found`, 404);

  await prisma.admin.delete({ where: { id: batchOpsId } });

  res.status(204).json({ success: true, message: "BatchOps team member deleted successfully" });
});
