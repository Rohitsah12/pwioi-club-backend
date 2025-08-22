// src/controllers/ops.controller.ts

import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";
import { RoleType } from "@prisma/client";

const addOpsSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("A valid email is required"),
  phone: z.string().min(1, "Phone number is required"),
  designation: z.string().optional(),
  linkedin: z.string().url("LinkedIn must be a valid URL").optional(),
});

const updateOpsSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  email: z.string().email("A valid email is required").optional(),
  phone: z.string().min(1, "Phone number is required").optional(),
  designation: z.string().optional(),
  linkedin: z.string().url("LinkedIn must be a valid URL").optional(),
});

// Convert update object into Prisma-compatible input
const toPrismaUpdateInput = (data: z.infer<typeof updateOpsSchema>) => {
  const result: Record<string, any> = {};
  if (data.name !== undefined) result.name = { set: data.name };
  if (data.email !== undefined) result.email = { set: data.email };
  if (data.phone !== undefined) result.phone = { set: data.phone };
  if (data.designation !== undefined) result.designation = { set: data.designation };
  if (data.linkedin !== undefined) result.linkedin = { set: data.linkedin };
  return result;
};

export const AddOps = catchAsync(async (req: Request, res: Response) => {
  const validation = addOpsSchema.safeParse(req.body);
  if (!validation.success) {
    throw new AppError(`Validation failed: ${validation.error.message}`, 400);
  }
  const opsData = validation.data;

  const existingAdmin = await prisma.admin.findFirst({
    where: {
      OR: [{ email: opsData.email }, { phone: opsData.phone }],
    },
  });

  if (existingAdmin) {
    throw new AppError("An admin with this email or phone number already exists.", 409);
  }

  const opsRole = await prisma.roleAdmin.upsert({
    where: { role: RoleType.OPS },
    update: {},
    create: { role: RoleType.OPS },
  });

  const newOpsMember = await prisma.admin.create({
    data: {
      name: opsData.name,
      email: opsData.email,
      phone: opsData.phone,
      designation: opsData.designation,
      linkedin: opsData.linkedin,
      role_id: opsRole.id,
    } as any,
    include: { role: true },
  });

  res.status(201).json({
    success: true,
    message: "Ops team member added successfully",
    data: newOpsMember,
  });
});

export const getAllOps = catchAsync(async (req: Request, res: Response) => {
  const opsMembers = await prisma.admin.findMany({
    where: { role: { role: RoleType.OPS } },
    include: { role: true },
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json({
    success: true,
    count: opsMembers.length,
    data: opsMembers,
  });
});

export const getOps = catchAsync(async (req: Request, res: Response) => {
  const { opsId } = req.params;

  if (!opsId) {
    throw new AppError("Ops ID is required", 400);
  }

  const opsMember = await prisma.admin.findFirst({
    where: { id: opsId, role: { role: RoleType.OPS } },
    include: {
      role: true,
      behaviours: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          student: {
            select: { id: true, name: true, enrollment_id: true },
          },
        },
      },
      clubOfficials: {
        include: {
          club: {
            select: { id: true, name: true, category: true },
          },
        },
      },
    },
  });

  if (!opsMember) {
    throw new AppError(`Ops team member with ID ${opsId} not found`, 404);
  }

  res.status(200).json({
    success: true,
    data: opsMember,
  });
});

export const updateOps = catchAsync(async (req: Request, res: Response) => {
  const { opsId } = req.params;
  const validation = updateOpsSchema.safeParse(req.body);

  if (!opsId) {
    throw new AppError("Ops ID is required", 400);
  }

  if (!validation.success) {
    throw new AppError(`Validation failed: ${validation.error.message}`, 400);
  }

  const updateData = validation.data;

  const existingOps = await prisma.admin.findFirst({
    where: { id: opsId, role: { role: RoleType.OPS } },
  });

  if (!existingOps) {
    throw new AppError(`Ops team member with ID ${opsId} not found`, 404);
  }

  if (updateData.email || updateData.phone) {
    const conflictConditions: any[] = [];
    if (updateData.email) conflictConditions.push({ email: updateData.email });
    if (updateData.phone) conflictConditions.push({ phone: updateData.phone });

    const existingAdmin = await prisma.admin.findFirst({
      where: { AND: [{ id: { not: opsId } }, { OR: conflictConditions }] },
    });

    if (existingAdmin) {
      throw new AppError("An admin with this email or phone number already exists.", 409);
    }
  }

  const updatedOpsMember = await prisma.admin.update({
    where: { id: opsId },
    data: toPrismaUpdateInput(updateData),
    include: { role: true },
  });

  res.status(200).json({
    success: true,
    message: "Ops team member updated successfully",
    data: updatedOpsMember,
  });
});

export const deleteOps = catchAsync(async (req: Request, res: Response) => {
  const { opsId } = req.params;

  if (!opsId) {
    throw new AppError("Ops ID is required", 400);
  }

  const existingOps = await prisma.admin.findFirst({
    where: { id: opsId, role: { role: RoleType.OPS } },
  });

  if (!existingOps) {
    throw new AppError(`Ops team member with ID ${opsId} not found`, 404);
  }

  await prisma.admin.delete({ where: { id: opsId } });

  res.status(204).json({
    success: true,
    message: "Ops team member deleted successfully",
  });
});

export const getOpsStats = catchAsync(async (req: Request, res: Response) => {
  const totalOpsMembers = await prisma.admin.count({
    where: { role: { role: RoleType.OPS } },
  });

  const opsWithClubOfficials = await prisma.admin.count({
    where: { role: { role: RoleType.OPS }, clubOfficials: { some: {} } },
  });

  const recentlyAddedOps = await prisma.admin.count({
    where: {
      role: { role: RoleType.OPS },
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  });

  const opsWithRecentActivity = await prisma.admin.count({
    where: {
      role: { role: RoleType.OPS },
      lastLoginAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  res.status(200).json({
    success: true,
    data: {
      totalOpsMembers,
      opsWithClubOfficials,
      recentlyAddedOps,
      opsWithRecentActivity,
    },
  });
});
