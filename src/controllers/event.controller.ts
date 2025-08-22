// src/controllers/event.controller.ts

import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";
import { EventType } from "@prisma/client";


const eventSchema = z.object({
  name: z.string().min(1, "Event name is required"),
  organiser: z.string().min(1, "Organiser is required"),
  venue: z.string().min(1, "Venue is required"),
  type: z.nativeEnum(EventType),
  start_date: z.string().datetime("Start date must be a valid ISO date string"),
  end_date: z.string().datetime("End date must be a valid ISO date string").optional(),
  description: z.string().optional(),
  is_visible: z.boolean().optional(),
  thumbnail: z.string().url("Thumbnail must be a valid URL").optional(),
});

const updateEventSchema = eventSchema.partial(); // All fields are optional for updates


export const createEvents = catchAsync(async (req: Request, res: Response) => {
  const validation = eventSchema.safeParse(req.body);
  if (!validation.success) {
    throw new AppError(`Validation failed: ${validation.error.message}`, 400);
  }

  const { start_date, end_date, ...rest } = validation.data;
  const eventData: any = {
    ...rest,
    start_date: new Date(start_date), // Convert string to Date
  };

  if (end_date) {
    eventData.end_date = new Date(end_date);
  }

  const newEvent = await prisma.event.create({
    data: eventData,
  });

  res.status(201).json({
    success: true,
    message: "Event created successfully",
    data: newEvent,
  });
});


export const getALlEvents = catchAsync(async (req: Request, res: Response) => {
  const events = await prisma.event.findMany({
    orderBy: {
      start_date: "desc",
    },
  });

  res.status(200).json({
    success: true,
    count: events.length,
    data: events,
  });
});


export const getEvents = catchAsync(async (req: Request, res: Response) => {
  const { eventId } = req.params;

  const event = await prisma.event.findUnique({
    where: { id: eventId! },
  });

  if (!event) {
    throw new AppError(`Event with ID ${eventId} not found`, 404);
  }

  res.status(200).json({
    success: true,
    data: event,
  });
});


export const updateEvents = catchAsync(async (req: Request, res: Response) => {
  const { eventId } = req.params;
  const validation = updateEventSchema.safeParse(req.body);

  if (!validation.success) {
    throw new AppError(`Validation failed: ${validation.error.message}`, 400);
  }

  const { start_date, end_date, ...rest } = validation.data;
  const updateData: any = { ...rest };

  if (start_date) {
    updateData.start_date = new Date(start_date);
  }
  if (end_date) {
    updateData.end_date = new Date(end_date);
  }

  try {
    const updatedEvent = await prisma.event.update({
      where: { id: eventId! },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      message: "Event updated successfully",
      data: updatedEvent,
    });
  } catch (error) {
    throw new AppError(`Event with ID ${eventId} not found or failed to update.`, 404);
  }
});


export const deleteEvents = catchAsync(async (req: Request, res: Response) => {
  const { eventId } = req.params;

  try {
    await prisma.event.delete({
      where: { id: eventId!},
    });

    res.status(204).send(); 
  } catch (error) {
    throw new AppError(`Event with ID ${eventId} not found or failed to delete.`, 404);
  }
});