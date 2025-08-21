import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";

const mentorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("A valid email is required"),
  phone: z.string().min(1, "Phone number is required"),
  linkedin: z.string().url("LinkedIn must be a valid URL").optional(),
  designation: z.string().optional(),
  company: z.string().optional(),
});

const updateMentorSchema = mentorSchema.partial(); // All fields are optional for updates



export const AddMentor = catchAsync(async (req: Request, res: Response) => {
  const validation = mentorSchema.safeParse(req.body);
  if (!validation.success) {
    throw new AppError(`Validation failed: ${validation.error.message}`, 400);
  }
  const mentorData = validation.data;

  const existingMentor = await prisma.mentor.findFirst({
    where: {
      OR: [{ email: mentorData.email }, { phone: mentorData.phone }],
    },
  });

  if (existingMentor) {
    throw new AppError("A mentor with this email or phone number already exists.", 409);
  }

  const newMentor = await prisma.mentor.create({
    data: mentorData as any,
  });

  res.status(201).json({
    success: true,
    message: "Mentor added successfully",
    data: newMentor,
  });
});


export const getAllMentor = catchAsync(async (req: Request, res: Response) => {
  const mentors = await prisma.mentor.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  res.status(200).json({
    success: true,
    count: mentors.length,
    data: mentors,
  });
});


export const getMentor = catchAsync(async (req: Request, res: Response) => {
  const { mentorId } = req.params;

  const mentor = await prisma.mentor.findUnique({
    where: { id: mentorId! },
  });

  if (!mentor) {
    throw new AppError(`Mentor with ID ${mentorId} not found`, 404);
  }

  res.status(200).json({
    success: true,
    data: mentor,
  });
});


export const updateMentor = catchAsync(async (req: Request, res: Response) => {
  const { mentorId } = req.params;
  const validation = updateMentorSchema.safeParse(req.body);

  if (!validation.success) {
    throw new AppError(`Validation failed: ${validation.error.message}`, 400);
  }
  const updateData = validation.data;
  
  if (updateData.email || updateData.phone) {
      const existingMentor = await prisma.mentor.findFirst({
          where: {
              OR: [{ email: updateData.email !}, { phone: updateData.phone! }],
              id: { not: mentorId! } 
          }
      });
      if (existingMentor) {
          throw new AppError("The new email or phone number is already in use.", 409);
      }
  }

  try {
    const updatedMentor = await prisma.mentor.update({
      where: { id: mentorId! },
      data: updateData as any,
    });

    res.status(200).json({
      success: true,
      message: "Mentor updated successfully",
      data: updatedMentor,
    });
  } catch (error) {
    throw new AppError(`Mentor with ID ${mentorId} not found or failed to update.`, 404);
  }
});


export const deleteMentor = catchAsync(async (req: Request, res: Response) => {
  const { mentorId } = req.params;

  try {
    await prisma.mentor.delete({
      where: { id: mentorId! },
    });

    res.status(204).send(); // Standard for successful deletion
  } catch (error) {
    throw new AppError(`Mentor with ID ${mentorId} not found or failed to delete.`, 404);
  }
});