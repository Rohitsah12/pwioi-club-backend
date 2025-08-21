// src/controllers/policy.controller.ts

import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";


const createPolicySchema = z.object({
  name: z.string().min(1, "Policy name is required"),
  pdf_url: z.string().url("A valid PDF URL is required"),
  effective_date: z.string().datetime("Effective date must be a valid ISO date string"),
  center_id: z.string().uuid("A valid center UUID is required"),
  policy_version: z.string().min(1, "Policy version is required"),
  is_active: z.boolean().optional(),
});

const updatePolicySchema = createPolicySchema.partial(); // All fields are optional for updates

export const createPolicy = catchAsync(async (req: Request, res: Response) => {
  const validation = createPolicySchema.safeParse(req.body);
  if (!validation.success) {
    throw new AppError(`Validation failed: ${validation.error.message}`, 400);
  }
  const { effective_date, center_id, ...rest } = validation.data;

  const center = await prisma.center.findUnique({
    where: { id: center_id },
  });
  if (!center) {
    throw new AppError(`Center with ID ${center_id} not found`, 404);
  }

  const newPolicy = await prisma.policy.create({
    data: {
      ...rest,
      center_id,
      effective_date: new Date(effective_date), // Convert string to Date object
    } as any,
  });

  res.status(201).json({
    success: true,
    message: "Policy created successfully",
    data: newPolicy,
  });
});

/**
 * @desc    Get all policies for a specific center
 * @route   GET /api/v1/policies/center/:centerId
 * @access  Private (Admins, Ops)
 */
export const getAllPolicy = catchAsync(async (req: Request, res: Response) => {
  const { centerId } = req.params;

  const policies = await prisma.policy.findMany({
    where: {
      center_id: centerId!,
    },
    orderBy: {
      effective_date: "desc",
    },
  });

  res.status(200).json({
    success: true,
    count: policies.length,
    data: policies,
  });
});

/**
 * @desc    Get a single policy by its ID
 * @route   GET /api/v1/policies/:policyId
 * @access  Private (Admins, Ops)
 */
export const getByPolicyId = catchAsync(async (req: Request, res: Response) => {
  const { policyId } = req.params;

  const policy = await prisma.policy.findUnique({
    where: { id: policyId! },
  });

  if (!policy) {
    throw new AppError(`Policy with ID ${policyId} not found`, 404);
  }

  res.status(200).json({
    success: true,
    data: policy,
  });
});

/**
 * @desc    Update an existing policy
 * @route   PUT /api/v1/policies/:policyId
 * @access  Private (Admins, Ops)
 */
export const updatePolicy = catchAsync(async (req: Request, res: Response) => {
  const { policyId } = req.params;
  const validation = updatePolicySchema.safeParse(req.body);

  if (!validation.success) {
    throw new AppError(`Validation failed: ${validation.error.message}`, 400);
  }

  const { effective_date, ...rest } = validation.data;
  const updateData: any = { ...rest };

  // Convert date string to Date object if it's being updated
  if (effective_date) {
    updateData.effective_date = new Date(effective_date);
  }
  
  try {
    const updatedPolicy = await prisma.policy.update({
      where: { id: policyId! },
      data: updateData,
    });
  
    res.status(200).json({
      success: true,
      message: "Policy updated successfully",
      data: updatedPolicy,
    });
  } catch (error) {
     // Catch error if the policy to update doesn't exist
    throw new AppError(`Policy with ID ${policyId} not found or failed to update.`, 404);
  }
});

/**
 * @desc    Delete a policy by its ID
 * @route   DELETE /api/v1/policies/:policyId
 * @access  Private (Admins, Ops)
 */
export const deletePolicy = catchAsync(async (req: Request, res: Response) => {
  const { policyId } = req.params;

  try {
    await prisma.policy.delete({
      where: { id: policyId! },
    });
  
    res.status(204).send(); // 204 No Content is standard for successful deletion
  } catch (error) {
    // Catch error if the policy to delete doesn't exist
    throw new AppError(`Policy with ID ${policyId} not found or failed to delete.`, 404);
  }
});