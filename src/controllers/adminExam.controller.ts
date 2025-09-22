import type { Request, Response, NextFunction } from 'express';
import { getExamAnalytics } from '../service/adminExamService.js';
import { examAnalyticsQuerySchema } from '../schema/adminExam.js';
import type { ExamAnalyticsQueryDto } from '../types/adminExam.types.js';

export const getExamAnalyticsController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const validatedQuery: ExamAnalyticsQueryDto = examAnalyticsQuerySchema.parse(req.query);

    const analyticsData = await getExamAnalytics(validatedQuery);

    res.status(200).json({
      success: true,
      message: `Exam analytics for level '${analyticsData.level}' retrieved successfully.`,
      data: analyticsData,
    });
  } catch (error) {
    next(error);
  }
};