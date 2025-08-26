import { Prisma, PrismaClient } from '@prisma/client';
import type {
  AttendanceAnalyticsQueryDto,
  AttendanceAnalyticsResponse,
  TrendPoint,
} from '../types/attendanceAnalytics.types.js';
import {
  startOfYesterday,
  endOfYesterday,
  subDays,
  startOfDay,
  format,
  subWeeks,
  startOfWeek,
  subMonths,
  startOfMonth,
  endOfDay,
  addDays,
  addWeeks,
  addMonths,
} from 'date-fns';

// Initialize Prisma Client
const prisma = new PrismaClient();

export class AttendanceAnalyticsService {
  /**
   * Main method to fetch and compute attendance analytics.
   * @param filters - The validated query parameters for filtering data.
   * @returns A promise resolving to the complete analytics response.
   */
  public static async getAnalytics(
    filters: AttendanceAnalyticsQueryDto
  ): Promise<AttendanceAnalyticsResponse> {
    const studentWhereClause = this.buildStudentWhereClause(filters);
    const attendanceWhereClause = this.buildAttendanceWhereClause(filters);

    // Fetch all required data in parallel to optimize performance
    const [overview, trends] = await Promise.all([
      this.getOverviewStats(studentWhereClause, attendanceWhereClause),
      this.getAttendanceTrends(attendanceWhereClause),
    ]);

    return { overview, trends };
  }

  /**
   * Calculates overview statistics: total students, average attendance, and yesterday's numbers.
   */
  private static async getOverviewStats(
    studentWhere: Prisma.StudentWhereInput,
    attendanceWhere: Prisma.AttendanceWhereInput
  ) {
    const yesterdayStart = startOfYesterday();
    const yesterdayEnd = endOfYesterday();

    const [
      totalStudents,
      totalPresent,
      totalAttendanceRecords,
      presentYesterday,
      absentYesterday,
    ] = await Promise.all([
      // 1. Total students matching the filter criteria
      prisma.student.count({ where: studentWhere }),
      // 2. Total present records for all time (for avg attendance)
      prisma.attendance.count({
        where: { ...attendanceWhere, status: 'PRESENT' },
      }),
      // 3. Total attendance records for all time
      prisma.attendance.count({ where: attendanceWhere }),
      // 4. Present count for yesterday
      prisma.attendance.count({
        where: {
          ...attendanceWhere,
          status: 'PRESENT',
          class: { start_date: { gte: yesterdayStart, lte: yesterdayEnd } },
        },
      }),
      // 5. Absent count for yesterday
      prisma.attendance.count({
        where: {
          ...attendanceWhere,
          status: 'ABSENT',
          class: { start_date: { gte: yesterdayStart, lte: yesterdayEnd } },
        },
      }),
    ]);

    // Calculate average, handling division by zero
    const averageAttendance =
      totalAttendanceRecords > 0
        ? (totalPresent / totalAttendanceRecords) * 100
        : 0;

    return {
      totalStudents,
      averageAttendance: parseFloat(averageAttendance.toFixed(2)),
      presentYesterday,
      absentYesterday,
    };
  }

  /**
   * Fetches attendance records for the last 6 months and processes them into daily, weekly, and monthly trends.
   */
  private static async getAttendanceTrends(
    attendanceWhere: Prisma.AttendanceWhereInput
  ) {
    const sixMonthsAgo = startOfMonth(subMonths(new Date(), 5)); // Start of the month, 6 months ago

    // Fetch all records needed for trends in a single query
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        ...attendanceWhere,
        class: { start_date: { gte: sixMonthsAgo } },
      },
      select: {
        status: true,
        class: { select: { start_date: true } },
      },
    });

    // Maps to hold aggregated data { period: { present: number, total: number } }
    const dailyMap = new Map<string, { present: number; total: number }>();
    const weeklyMap = new Map<string, { present: number; total: number }>();
    const monthlyMap = new Map<string, { present: number; total: number }>();

    // Process records
    for (const record of attendanceRecords) {
      const date = record.class.start_date;
      const dailyKey = format(date, 'yyyy-MM-dd');
      const weeklyKey = format(date, 'yyyy-ww'); // Week number
      const monthlyKey = format(date, 'yyyy-MM');

      // Helper to update map
      const updateMap = (
        map: Map<string, { present: number; total: number }>,
        key: string
      ) => {
        if (!map.has(key)) map.set(key, { present: 0, total: 0 });
        const stats = map.get(key)!;
        stats.total += 1;
        if (record.status === 'PRESENT') {
          stats.present += 1;
        }
      };

      updateMap(dailyMap, dailyKey);
      updateMap(weeklyMap, weeklyKey);
      updateMap(monthlyMap, monthlyKey);
    }

    // Generate final trend arrays, ensuring all periods are present (even with 0%)
    const daily = this.generateTrendLine(dailyMap, 'daily');
    const weekly = this.generateTrendLine(weeklyMap, 'weekly');
    const monthly = this.generateTrendLine(monthlyMap, 'monthly');

    return { daily, weekly, monthly };
  }
  
  /**
   * Generates a complete trend line for a given period type, filling in missing dates with 0%.
   */
  private static generateTrendLine(
    dataMap: Map<string, { present: number; total: number }>,
    type: 'daily' | 'weekly' | 'monthly'
  ): TrendPoint[] {
    const trend: TrendPoint[] = [];
    const yesterday = endOfDay(subDays(new Date(), 1));

    switch (type) {
      case 'daily': {
        const startDate = subDays(yesterday, 6);
        
        for (let i = 0; i < 7; i++) {
          const day: Date = addDays(startDate, i);
          const period = format(day, 'yyyy-MM-dd');
          const stats = dataMap.get(period) || { present: 0, total: 0 };
          const percentage = stats.total > 0 ? (stats.present / stats.total) * 100 : 0;
          trend.push({ period, percentage: parseFloat(percentage.toFixed(2)) });
        }
        break;
      }

      case 'weekly': {
        const startWeek = subWeeks(yesterday, 3);
        
        for (let i = 0; i < 4; i++) {
          const week: Date = addWeeks(startWeek, i);
          const period = format(week, 'yyyy-ww');
          const stats = dataMap.get(period) || { present: 0, total: 0 };
          const percentage = stats.total > 0 ? (stats.present / stats.total) * 100 : 0;
          trend.push({ period, percentage: parseFloat(percentage.toFixed(2)) });
        }
        break;
      }

      case 'monthly': {
        const startMonth = subMonths(yesterday, 5);
        
        for (let i = 0; i < 6; i++) {
          const month: Date = addMonths(startMonth, i);
          const period = format(month, 'yyyy-MM');
          const stats = dataMap.get(period) || { present: 0, total: 0 };
          const percentage = stats.total > 0 ? (stats.present / stats.total) * 100 : 0;
          trend.push({ period, percentage: parseFloat(percentage.toFixed(2)) });
        }
        break;
      }
    }
    return trend;
  }

  /**
   * Dynamically builds the Prisma `where` clause for the Student model.
   */
  private static buildStudentWhereClause(
    filters: AttendanceAnalyticsQueryDto
  ): Prisma.StudentWhereInput {
    const where: Prisma.StudentWhereInput = {};
    if (filters.centerId) where.center_id = filters.centerId;
    if (filters.schoolId) where.school_id = filters.schoolId;
    if (filters.batchId) where.batch_id = filters.batchId;
    if (filters.divisionId) where.division_id = filters.divisionId;
    if (filters.semesterId) where.semester_id = filters.semesterId;
    if (filters.subjectId) {
      where.division = {
        classes: { some: { subject_id: filters.subjectId } },
      };
    }
    return where;
  }

  /**
   * Dynamically builds the Prisma `where` clause for the Attendance model.
   */
  private static buildAttendanceWhereClause(
    filters: AttendanceAnalyticsQueryDto
  ): Prisma.AttendanceWhereInput {
    const where: Prisma.AttendanceWhereInput = {};
    where.student = {};
    where.class = {};

    if (filters.centerId) where.student.center_id = filters.centerId;
    if (filters.schoolId) where.student.school_id = filters.schoolId;
    if (filters.batchId) where.student.batch_id = filters.batchId;
    if (filters.divisionId) where.student.division_id = filters.divisionId;
    if (filters.semesterId) where.student.semester_id = filters.semesterId;
    if (filters.subjectId) where.class.subject_id = filters.subjectId;

    return where;
  }
}