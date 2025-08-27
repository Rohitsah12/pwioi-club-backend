import type { Request, Response, NextFunction } from 'express';
import { AttendanceAnalyticsService } from '../service/attendance.service.js';
import { attendanceAnalyticsQuerySchema } from '../schema/attendanceValidator.js';
import type { AttendanceAnalyticsQueryDto } from '../types/attendanceAnalytics.types.js';


export const getAttendanceAnalyticsAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const validatedQuery: AttendanceAnalyticsQueryDto =
      attendanceAnalyticsQuerySchema.parse(req.query);

    const analyticsData = await AttendanceAnalyticsService.getAnalytics(
      validatedQuery
    );

    res.status(200).json({
      success: true,
      message: 'Attendance analytics retrieved successfully.',
      data: analyticsData,
    });
  } catch (error) {
    next(error);
  }
};