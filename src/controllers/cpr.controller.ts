import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../utils/AppError.js';
import { z } from 'zod';
import xlsx from 'xlsx';

const uploadCprSchema = z.object({
  subject_id: z.string().uuid(),
});

interface CprRow {
  Module: string;
  Topic: string;
  'Sub Topic': string;
  'Lecture Count': number;
}

export const uploadCprSheet = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError('No Excel file uploaded.', 400);
  }

  const validation = uploadCprSchema.safeParse(req.body);
  if (!validation.success) {
    throw new AppError('Invalid subject_id provided.', 400);
  }
  const { subject_id } = validation.data;

  // 1. Parse the Excel file
  const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
      throw new AppError('The uploaded Excel file is empty or invalid.', 400);
  }
  const jsonData = xlsx.utils.sheet_to_json<CprRow>(workbook.Sheets[sheetName]!);

  // 2. Process and structure the data
  const cprData: Map<string, Map<string, { name: string; lecture_count: number }[]>> = new Map();
  for (const row of jsonData) {
    const moduleName = row.Module?.trim();
    const topicName = row.Topic?.trim();
    const subTopicName = row['Sub Topic']?.trim();
    const lectureCount = row['Lecture Count'];

    if (!moduleName || !topicName || !subTopicName || !lectureCount) {
      console.warn('Skipping invalid row:', row);
      continue; // Skip rows with missing essential data
    }

    if (!cprData.has(moduleName)) {
      cprData.set(moduleName, new Map());
    }
    const topics = cprData.get(moduleName)!;

    if (!topics.has(topicName)) {
      topics.set(topicName, []);
    }
    const subTopics = topics.get(topicName)!;

    subTopics.push({ name: subTopicName, lecture_count: lectureCount });
  }

  // 3. Perform database operations in a transaction
  await prisma.$transaction(async (tx) => {
    // a. Delete all existing CPR data for this subject to ensure a clean slate
    await tx.cprModule.deleteMany({ where: { subject_id } });

    // b. Create the new CPR structure from the parsed data
    let moduleOrder = 1;
    for (const [moduleName, topics] of cprData.entries()) {
      const newModule = await tx.cprModule.create({
        data: {
          name: moduleName,
          order: moduleOrder++,
          subject_id: subject_id,
        },
      });

      let topicOrder = 1;
      for (const [topicName, subTopics] of topics.entries()) {
        const newTopic = await tx.cprTopic.create({
          data: {
            name: topicName,
            order: topicOrder++,
            module_id: newModule.id,
          },
        });

        let subTopicOrder = 1;
        for (const subTopic of subTopics) {
          await tx.cprSubTopic.create({
            data: {
              name: subTopic.name,
              order: subTopicOrder++,
              lecture_count: subTopic.lecture_count,
              topic_id: newTopic.id,
            },
          });
        }
      }
    }
  });

  res.status(201).json({
    success: true,
    message: 'CPR sheet uploaded and processed successfully.',
  });
});

export const getCprBySubject = catchAsync(async (req: Request, res: Response) => {
  const { subjectId } = req.params;

  // Validate that the subject exists
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId! },
    select: { id: true, name: true, code: true }
  });

  if (!subject) {
    throw new AppError('Subject not found', 404);
  }

  // Fetch the complete CPR structure for the subject
  const cprModules = await prisma.cprModule.findMany({
    where: { subject_id: subjectId! },
    orderBy: { order: 'asc' },
    include: {
      topics: {
        orderBy: { order: 'asc' },
        include: {
          subTopics: {
            orderBy: { order: 'asc' },
            select: {
              id: true,
              name: true,
              order: true,
              lecture_count: true,
              status: true,
              planned_start_date: true,
              planned_end_date: true,
              actual_start_date: true,
              actual_end_date: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });

  // Calculate summary statistics
  const totalSubTopics = cprModules.reduce((total, module) => 
    total + module.topics.reduce((topicTotal, topic) => 
      topicTotal + topic.subTopics.length, 0), 0
  );

  const totalLectures = cprModules.reduce((total, module) => 
    total + module.topics.reduce((topicTotal, topic) => 
      topicTotal + topic.subTopics.reduce((subTopicTotal, subTopic) => 
        subTopicTotal + subTopic.lecture_count, 0), 0), 0
  );

  const completedSubTopics = cprModules.reduce((total, module) => 
    total + module.topics.reduce((topicTotal, topic) => 
      topicTotal + topic.subTopics.filter(subTopic => 
        subTopic.status === 'COMPLETED').length, 0), 0
  );

  const inProgressSubTopics = cprModules.reduce((total, module) => 
    total + module.topics.reduce((topicTotal, topic) => 
      topicTotal + topic.subTopics.filter(subTopic => 
        subTopic.status === 'IN_PROGRESS').length, 0), 0
  );

  const pendingSubTopics = cprModules.reduce((total, module) => 
    total + module.topics.reduce((topicTotal, topic) => 
      topicTotal + topic.subTopics.filter(subTopic => 
        subTopic.status === 'PENDING').length, 0), 0
  );

  const summary = {
    total_modules: cprModules.length,
    total_topics: cprModules.reduce((total, module) => total + module.topics.length, 0),
    total_sub_topics: totalSubTopics,
    total_lectures: totalLectures,
    completed_sub_topics: completedSubTopics,
    in_progress_sub_topics: inProgressSubTopics,
    pending_sub_topics: pendingSubTopics,
    completion_percentage: totalSubTopics > 0 ? Math.round((completedSubTopics / totalSubTopics) * 100) : 0,
  };

  res.status(200).json({
    success: true,
    data: {
      subject,
      summary,
      modules: cprModules,
    },
  });
});

export const deleteCprBySubject = catchAsync(async (req: Request, res: Response) => {
  const { subjectId } = req.params;

  // Validate that the subject exists
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId! },
    select: { id: true, name: true }
  });

  if (!subject) {
    throw new AppError('Subject not found', 404);
  }

  // Check if CPR data exists for this subject
  const existingModules = await prisma.cprModule.findMany({
    where: { subject_id: subjectId! },
    select: { id: true }
  });

  if (existingModules.length === 0) {
    throw new AppError('No CPR data found for this subject', 404);
  }

  // Delete all CPR data for the subject in a transaction
  await prisma.$transaction(async (tx) => {
    // First, we need to clear the sub_topic_id references in the Class table
    // to avoid foreign key constraint violations
    await tx.class.updateMany({
      where: {
        subject_id: subjectId!,
        sub_topic_id: { not: null }
      },
      data: {
        sub_topic_id: null
      }
    });

    // Now delete the CPR modules (cascade will handle topics and sub-topics)
    await tx.cprModule.deleteMany({
      where: { subject_id: subjectId! }
    });
  });

  res.status(200).json({
    success: true,
    message: `CPR data for subject "${subject.name}" has been successfully deleted.`,
  });
});