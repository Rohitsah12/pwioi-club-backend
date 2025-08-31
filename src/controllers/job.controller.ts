import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";
import { WorkMode, JobType } from "@prisma/client";


const jobSchema = z.object({
  title: z.string().min(1, "Title is required"),
  location: z.string().min(1, "Location is required"),
  company_name: z.string().min(1, "Company name is required"),
  work_mode: z.nativeEnum(WorkMode),
  type: z.nativeEnum(JobType),
  jd_link: z.string().url("JD link must be a valid URL").optional(),

  vacancy: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.coerce.number().int().positive().optional()
  ),

  eligibility: z.string().optional(),
  description: z.string().optional(),
  closing_date: z.string().datetime("Closing date must be a valid ISO date string").optional(),
});

const updateJobSchema = jobSchema.partial();


export const createJob = catchAsync(async (req: Request, res: Response) => {
  const validation = jobSchema.safeParse(req.body);
  if (!validation.success) {
    throw new AppError(`Validation failed: ${validation.error.message}`, 400);
  }

  const { closing_date, ...rest } = validation.data;
  const jobData: any = { ...rest };

  if (closing_date) {
    jobData.closing_date = new Date(closing_date);
  }

  const newJob = await prisma.job.create({
    data: jobData,
  });

  res.status(201).json({
    success: true,
    message: "Job created successfully",
    data: newJob,
  });
});


export const getAllJob = catchAsync(async (req: Request, res: Response) => {
  const jobs = await prisma.job.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  res.status(200).json({
    success: true,
    count: jobs.length,
    data: jobs,
  });
});


export const getJob = catchAsync(async (req: Request, res: Response) => {
  const { jobId } = req.params;

  const job = await prisma.job.findUnique({
    where: { id: jobId! },
  });

  if (!job) {
    throw new AppError(`Job with ID ${jobId} not found`, 404);
  }

  res.status(200).json({
    success: true,
    data: job,
  });
});


export const updateJob = catchAsync(async (req: Request, res: Response) => {
  const { jobId } = req.params; // Assuming route is changed to /:jobId
  if (!jobId) {
    throw new AppError("Job ID is required in the URL.", 400);
  }
  
  const validation = updateJobSchema.safeParse(req.body);
  if (!validation.success) {
    throw new AppError(`Validation failed: ${validation.error.message}`, 400);
  }

  const { closing_date, ...rest } = validation.data;
  const updateData: any = { ...rest };

  if (closing_date) {
    updateData.closing_date = new Date(closing_date);
  }

  try {
    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      message: "Job updated successfully",
      data: updatedJob,
    });
  } catch (error) {
    throw new AppError(`Job with ID ${jobId} not found or failed to update.`, 404);
  }
});


export const deleteJob = catchAsync(async (req: Request, res: Response) => {
  const { jobId } = req.params;
  if (!jobId) {
    throw new AppError("Job ID is required in the URL.", 400);
  }

  try {
    await prisma.job.delete({
      where: { id: jobId },
    });

    res.status(204).send(); 
  } catch (error) {
    throw new AppError(`Job with ID ${jobId} not found or failed to delete.`, 404);
  }
});