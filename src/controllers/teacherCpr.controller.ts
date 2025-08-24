import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../utils/AppError.js';
import { z } from 'zod';

const updateStatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'COMPLETED']),
});

export const updateSubTopicStatus = catchAsync(async (req: Request, res: Response) => {
  const { subTopicId } = req.params;
  const validation = updateStatusSchema.safeParse(req.body);
  if (!validation.success) {
    throw new AppError('Invalid status provided', 400);
  }
  const { status } = validation.data;

  const subTopic = await prisma.cprSubTopic.findUnique({
    where: { id: subTopicId! },
  });

  if (!subTopic) {
    throw new AppError('Sub-topic not found', 404);
  }

  const updateData: any = { status };

  if (status === 'IN_PROGRESS' && !subTopic.actual_start_date) {
    updateData.actual_start_date = new Date();
  } else if (status === 'COMPLETED') {
    if (!subTopic.actual_start_date) {
        updateData.actual_start_date = new Date();
    }
    updateData.actual_end_date = new Date();
  }

  const updatedSubTopic = await prisma.cprSubTopic.update({
    where: { id: subTopicId! },
    data: updateData,
  });

  res.status(200).json({
    success: true,
    message: 'Status updated successfully.',
    data: updatedSubTopic,
  });
});
