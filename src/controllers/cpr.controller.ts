import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../utils/AppError.js';
import { z } from 'zod';
import xlsx from 'xlsx';
import { Prisma } from '@prisma/client';

const uploadCprSchema = z.object({
  subject_id: z.string().uuid(),
});

// Interface for the new Excel row format
interface CprRow {
  Module: string;
  Topic: string;
  'Sub Topic': string;
  'Lecture Number': number;
}

/**
 * Recalculates and updates the planned start and end dates for all CprSubTopics
 * for a given subject based on the current class schedule.
 * This function should be called within a transaction whenever classes are changed.
 */
export async function recalculateCprPlannedDatesForSubject(
  tx: Prisma.TransactionClient,
  subjectId: string
) {
  // 1. Reset all planned dates for the subject's sub-topics
  await tx.cprSubTopic.updateMany({
    where: {
      topic: {
        module: {
          subject_id: subjectId,
        },
      },
    },
    data: {
      planned_start_date: null,
      planned_end_date: null,
    },
  });

  // 2. Find the earliest class start date for each lecture number
  const earliestClassDates = await tx.class.groupBy({
    by: ['lecture_number'],
    where: {
      subject_id: subjectId,
    },
    _min: {
      start_date: true,
    },
  });

  // 3. Update sub-topics with the new planned dates
  for (const group of earliestClassDates) {
    const lectureNumber = parseInt(group.lecture_number, 10);
    const plannedDate = group._min.start_date;

    if (!isNaN(lectureNumber) && plannedDate) {
      await tx.cprSubTopic.updateMany({
        where: {
          lecture_number: lectureNumber,
          topic: {
            module: {
              subject_id: subjectId,
            },
          },
        },
        data: {
          planned_start_date: plannedDate,
          planned_end_date: plannedDate, // Both dates are the same as it's for a single lecture day
        },
      });
    }
  }
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
  const cprData: Map<string, Map<string, { name: string; lecture_number: number }[]>> = new Map();
  for (const row of jsonData) {
    const moduleName = row.Module?.trim();
    const topicName = row.Topic?.trim();
    const subTopicName = row['Sub Topic']?.trim();
    const lectureNumber = row['Lecture Number'];

    if (!moduleName || !topicName || !subTopicName || lectureNumber === undefined) {
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

    subTopics.push({ name: subTopicName, lecture_number: lectureNumber });
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
              lecture_number: subTopic.lecture_number, // Use lecture_number
              topic_id: newTopic.id,
            },
          });
        }
      }
    }
    
    // c. After creating the new CPR structure, recalculate planned dates based on existing classes
    await recalculateCprPlannedDatesForSubject(tx, subject_id);
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
              lecture_number: true, // Select lecture_number
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
  const allSubTopics = cprModules.flatMap(m => m.topics.flatMap(t => t.subTopics));
  const totalSubTopics = allSubTopics.length;
  
  const completedSubTopics = allSubTopics.filter(st => st.status === 'COMPLETED').length;
  const inProgressSubTopics = allSubTopics.filter(st => st.status === 'IN_PROGRESS').length;
  const pendingSubTopics = allSubTopics.filter(st => st.status === 'PENDING').length;
  
  // Total lectures is now the highest lecture number defined in the CPR
  const totalLectures = allSubTopics.reduce((max, st) => Math.max(max, st.lecture_number), 0);

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

    const subject = await prisma.subject.findUnique({
        where: { id: subjectId! },
        select: { id: true, name: true }
    });

    if (!subject) {
        throw new AppError('Subject not found', 404);
    }

    const moduleCount = await prisma.cprModule.count({
        where: { subject_id: subjectId! }
    });

    if (moduleCount === 0) {
        throw new AppError('No CPR data found for this subject to delete.', 404);
    }

    // Deleting modules will cascade to topics and sub-topics automatically
    await prisma.cprModule.deleteMany({
        where: { subject_id: subjectId! }
    });

    res.status(200).json({
        success: true,
        message: `CPR data for subject "${subject.name}" has been successfully deleted.`,
    });
});