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


interface CprRow {
  Module: string;
  Topic: string;
  'Sub Topic': string;
  'Lecture Number': number;
}


async function calculateCprSummary(subjectId: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const subject = await tx.subject.findUnique({
    where: { id: subjectId },
    select: {
      id: true,
      name: true,
      code: true,
      teacher: { select: { name: true } }
    }
  });

  if (!subject) return null;

  const allSubTopics = await tx.cprSubTopic.findMany({
    where: { topic: { module: { subject_id: subjectId } } },
    select: { status: true, lecture_number: true, planned_start_date: true }
  });

  if (allSubTopics.length === 0) {
    return {
      subject,
      teacher_name: subject.teacher?.name ?? 'Not Assigned',
      total_modules: 0,
      total_topics: 0,
      total_sub_topics: 0,
      total_lectures: 0,
      completed_sub_topics: 0,
      in_progress_sub_topics: 0,
      pending_sub_topics: 0,
      completion_percentage: 0,
      expected_completion_lecture: 0,
      actual_completion_lecture: 0,
      completion_lag: 0,
      has_cpr_data: false, // Flag to indicate no CPR sheet is uploaded
    };
  }

  const totalSubTopicsCount = allSubTopics.length;
  const completedSubTopics = allSubTopics.filter(st => st.status === 'COMPLETED').length;
  const inProgressSubTopics = allSubTopics.filter(st => st.status === 'IN_PROGRESS').length;
  const pendingSubTopics = totalSubTopicsCount - completedSubTopics - inProgressSubTopics;
  const totalLectures = allSubTopics.reduce((max, st) => Math.max(max, st.lecture_number), 0);

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const expectedLectureNumber = allSubTopics
    .filter(st => st.planned_start_date && new Date(st.planned_start_date) <= today)
    .reduce((max, st) => Math.max(max, st.lecture_number), 0);

  const subTopicsByLecture = new Map<number, { completed: number; total: number }>();
  allSubTopics.forEach(subTopic => {
    const lectureNum = subTopic.lecture_number;
    if (!subTopicsByLecture.has(lectureNum)) {
      subTopicsByLecture.set(lectureNum, { completed: 0, total: 0 });
    }
    const group = subTopicsByLecture.get(lectureNum)!;
    group.total++;
    if (subTopic.status === 'COMPLETED') group.completed++;
  });

  let actualLectureProgress = 0;
  const sortedLectures = Array.from(subTopicsByLecture.keys()).sort((a, b) => a - b);
  sortedLectures.forEach(lectureNum => {
    const group = subTopicsByLecture.get(lectureNum)!;
    if (group.total > 0) actualLectureProgress += group.completed / group.total;
  });

  const completionLag = expectedLectureNumber - actualLectureProgress;

  const moduleCount = await tx.cprModule.count({ where: { subject_id: subjectId } });
  const topicCount = await tx.cprTopic.count({ where: { module: { subject_id: subjectId } } });

  return {
    subject,
    teacher_name: subject.teacher?.name ?? 'Not Assigned',
    total_modules: moduleCount,
    total_topics: topicCount,
    total_sub_topics: totalSubTopicsCount,
    total_lectures: totalLectures,
    completed_sub_topics: completedSubTopics,
    in_progress_sub_topics: inProgressSubTopics,
    pending_sub_topics: pendingSubTopics,
    completion_percentage: totalSubTopicsCount > 0 ? Math.round((completedSubTopics / totalSubTopicsCount) * 100) : 0,
    expected_completion_lecture: expectedLectureNumber,
    actual_completion_lecture: parseFloat(actualLectureProgress.toFixed(2)),
    completion_lag: parseFloat(completionLag.toFixed(2)),
    has_cpr_data: true,
  };
}


const schoolSummarySchema = z.object({
  centerId: z.string().uuid(),
  schoolId: z.string().uuid(),
});

export const getCprSummaryForSchool = catchAsync(async (req: Request, res: Response) => {
  const validation = schoolSummarySchema.safeParse(req.query);
  if (!validation.success) {
    throw new AppError('Invalid or missing centerId/schoolId.', 400);
  }
  const { centerId, schoolId } = validation.data;

  const today = new Date();

  const ongoingSubjects = await prisma.subject.findMany({
    where: {
      semester: {
        start_date: { lte: today },
        OR: [{ end_date: { gte: today } }, { end_date: null }],
        division: { school_id: schoolId, center_id: centerId }
      }
    },
    select: { id: true }
  });

  if (ongoingSubjects.length === 0) {
    return res.status(200).json({
      success: true,
      message: "No ongoing subjects found for the selected school and center.",
      data: [],
    });
  }

  const summaryPromises = ongoingSubjects.map(subject => calculateCprSummary(subject.id));
  const summaries = (await Promise.all(summaryPromises)).filter(s => s !== null);

  res.status(200).json({
    success: true,
    data: summaries,
  });
});



export const getCprBySubject = catchAsync(async (req: Request, res: Response) => {
  const { subjectId } = req.params;

  const summary = await calculateCprSummary(subjectId!);

  if (!summary) {
    throw new AppError('Subject not found or CPR data is unavailable.', 404);
  }

  const cprModules = await prisma.cprModule.findMany({
    where: { subject_id: subjectId! },
    orderBy: { order: 'asc' },
    include: {
      topics: {
        orderBy: { order: 'asc' },
        include: { subTopics: { orderBy: { order: 'asc' } } },
      },
    },
  });

  res.status(200).json({
    success: true,
    data: {
      subject: summary.subject,
      summary,
      modules: cprModules,
    },
  });
});


export async function recalculateCprPlannedDatesForSubject(
  tx: Prisma.TransactionClient,
  subjectId: string
) {
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

  const earliestClassDates = await tx.class.groupBy({
    by: ['lecture_number'],
    where: {
      subject_id: subjectId,
    },
    _min: {
      start_date: true,
    },
  });

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

  const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new AppError('The uploaded Excel file is empty or invalid.', 400);
  }
  const jsonData = xlsx.utils.sheet_to_json<CprRow>(workbook.Sheets[sheetName]!);

  const cprData: Map<string, Map<string, { name: string; lecture_number: number }[]>> = new Map();
  for (const row of jsonData) {
    const moduleName = row.Module?.trim();
    const topicName = row.Topic?.trim();
    const subTopicName = row['Sub Topic']?.trim();
    const lectureNumber = row['Lecture Number'];

    if (!moduleName || !topicName || !subTopicName || lectureNumber === undefined) {
      console.warn('Skipping invalid row:', row);
      continue; 
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

  await prisma.$transaction(async (tx) => {
    await tx.cprModule.deleteMany({ where: { subject_id } });

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

    await recalculateCprPlannedDatesForSubject(tx, subject_id);
  });

  res.status(201).json({
    success: true,
    message: 'CPR sheet uploaded and processed successfully.',
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

  await prisma.cprModule.deleteMany({
    where: { subject_id: subjectId! }
  });

  res.status(200).json({
    success: true,
    message: `CPR data for subject "${subject.name}" has been successfully deleted.`,
  });
});
