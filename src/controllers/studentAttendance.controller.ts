import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";
import { validate as uuidValidate } from "uuid";
import { AttendanceStatus } from "@prisma/client";

interface SubjectAttendanceSummary {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  attendancePercentage: number;
  classesAttended: number;
  classesMissed: number;
}

interface MonthlyAttendance {
  month: string; // format: YYYY-MM
  attended: number;
  totalClasses: number;
}

interface WeeklyAttendance {
  weekStart: string|undefined;
  weekEnd: string|undefined;
  attended: number;
  totalClasses: number;
}

interface DailyAttendanceEntry {
  date: string|undefined;
  status: AttendanceStatus;
}

/**
 * Helper to validate UUID params
 */
function validateUUID(value: string, name: string) {
  if (!value || !uuidValidate(value)) throw new AppError(`Invalid or missing ${name}.`, 400);
}

/**
 * Helper to validate date in YYYY-MM-DD or YYYY-MM format
 */
function validateDateParam(date: string, name: string, pattern: RegExp) {
  if (!date || !pattern.test(date)) throw new AppError(`Invalid or missing ${name}.`, 400);
}

/**
 * Controller 1: Overall semester-wise attendance summary for student
 * GET /:studentId/attendance?semesterId=SEM_123
 */
export const getOverallSemesterAttendance = catchAsync(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  const semesterId = req.query.semesterId as string;
  if(!studentId){
    throw new AppError("Student Id required",400)
  }

  // Validate inputs
  validateUUID(studentId, "studentId");
  if (!semesterId) throw new AppError("semesterId query param is required.", 400);
  validateUUID(semesterId, "semesterId");

  // Check student exists and is active
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, is_active: true, division_id: true },
  });
  
  if (!student) throw new AppError("Student not found.", 404);
  if (!student.is_active) throw new AppError("Student account is deactivated.", 403);

  // Fetch all subjects in semester
  const semesterSubjects = await prisma.subject.findMany({
    where: { semester_id: semesterId },
    select: { id: true, code: true, name: true },
  });

  let totalClasses = 0;
  let classesAttended = 0;
  const subjectWiseAttendance: SubjectAttendanceSummary[] = [];

  for (const subject of semesterSubjects) {
    // Count total classes for subject in semester for the student's division
    const totalForSubject = await prisma.class.count({
      where: {
        subject_id: subject.id,
        division_id: student.division_id
      }
    });

    // Count attended classes for subject by student
    const attendedForSubject = await prisma.attendance.count({
      where: {
        student_id: studentId,
        status: AttendanceStatus.PRESENT,
        class: {
          subject_id: subject.id,
          division_id: student.division_id
        }
      }
    });

    const missed = totalForSubject - attendedForSubject;
    const percentage = totalForSubject === 0 ? 0 : Math.round((attendedForSubject / totalForSubject) * 100);

    totalClasses += totalForSubject;
    classesAttended += attendedForSubject;

    subjectWiseAttendance.push({
      subjectId: subject.id,
      subjectCode: subject.code,
      subjectName: subject.name,
      attendancePercentage: percentage,
      classesAttended: attendedForSubject,
      classesMissed: missed
    });
  }

  const overallAttendancePercentage = totalClasses === 0 ? 0 : Math.round((classesAttended / totalClasses) * 100);

  res.status(200).json({
    success: true,
    data: {
      studentId,
      semesterId,
      overallAttendancePercentage,
      totalClasses,
      classesAttended,
      totalSubjects: semesterSubjects.length,
      subjectWiseAttendance
    }
  });
});

/**
 * Controller 2: Subject-wise attendance summary with breakdown
 * GET /:studentId/attendance/subject/:subjectId?semesterId=SEM_123
 */
export const getSubjectWiseAttendance = catchAsync(async (req: Request, res: Response) => {
  const { studentId, subjectId } = req.params;
  const semesterId = req.query.semesterId as string;
  if(!studentId){
    throw new AppError("Student Id required",400)
  }
  if(!subjectId){
    throw new AppError("Student Id required",400)
  }

  // Validate inputs
  validateUUID(studentId, "studentId");
  validateUUID(subjectId, "subjectId");
  if (!semesterId) throw new AppError("semesterId query param is required.", 400);
  validateUUID(semesterId, "semesterId");

  // Check student and subject existence
  const [student, subject] = await Promise.all([
    prisma.student.findUnique({ 
      where: { id: studentId }, 
      select: { id: true, is_active: true, division_id: true }
    }),
    prisma.subject.findUnique({ 
      where: { id: subjectId }, 
      select: { id: true, code: true, name: true, semester_id: true }
    })
  ]);

  if (!student) throw new AppError("Student not found", 404);
  if (!student.is_active) throw new AppError("Student account is deactivated", 403);
  if (!subject || subject.semester_id !== semesterId) throw new AppError("Subject not found in semester", 404);

  // Get semester date range
  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    select: { start_date: true, end_date: true }
  });

  if (!semester) throw new AppError("Semester not found", 404);

  // Total classes for subject/semester/division
  const totalClasses = await prisma.class.count({
    where: {
      subject_id: subjectId,
      division_id: student.division_id,
      start_date: { 
        gte: semester.start_date,
        ...(semester.end_date && { lte: semester.end_date })
      }
    }
  });

  const classesAttended = await prisma.attendance.count({
    where: {
      student_id: studentId,
      status: AttendanceStatus.PRESENT,
      class: {
        subject_id: subjectId,
        division_id: student.division_id,
        start_date: { 
          gte: semester.start_date,
          ...(semester.end_date && { lte: semester.end_date })
        }
      }
    }
  });

  const classesMissed = totalClasses - classesAttended;
  const attendancePercentage = totalClasses === 0 ? 0 : Math.round((classesAttended / totalClasses) * 100);

  // Monthly breakdown (last 6 months)
  const monthlyBreakdown: MonthlyAttendance[] = [];
  const now = new Date();
  
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);

    const monthTotal = await prisma.class.count({
      where: {
        subject_id: subjectId,
        division_id: student.division_id,
        start_date: { gte: monthStart, lte: monthEnd }
      }
    });

    const monthAttended = await prisma.attendance.count({
      where: {
        student_id: studentId,
        status: AttendanceStatus.PRESENT,
        class: {
          subject_id: subjectId,
          division_id: student.division_id,
          start_date: { gte: monthStart, lte: monthEnd }
        }
      }
    });

    monthlyBreakdown.push({
      month: `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`,
      attended: monthAttended,
      totalClasses: monthTotal
    });
  }

  // Weekly breakdown (last 4 weeks)
  const weeklyBreakdown: WeeklyAttendance[] = [];
  for (let i = 3; i >= 0; i--) {
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() - 7 * i);
    weekEnd.setHours(23, 59, 59, 999); // End of day
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0); // Start of day

    const weekTotal = await prisma.class.count({
      where: {
        subject_id: subjectId,
        division_id: student.division_id,
        start_date: { gte: weekStart, lte: weekEnd }
      }
    });

    const weekAttended = await prisma.attendance.count({
      where: {
        student_id: studentId,
        status: AttendanceStatus.PRESENT,
        class: {
          subject_id: subjectId,
          division_id: student.division_id,
          start_date: { gte: weekStart, lte: weekEnd }
        }
      }
    });

    weeklyBreakdown.push({
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      attended: weekAttended,
      totalClasses: weekTotal
    });
  }

  // Daily status for last 7 days
  const dailyStatus: { [date: string]: AttendanceStatus } = {};
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setHours(23, 59, 59, 999);
    const dateStr:string = date.toISOString().split('T')[0] as string

    // Find classes on this date
    const classesOnDate = await prisma.class.findMany({
      where: {
        subject_id: subjectId,
        division_id: student.division_id,
        start_date: { gte: date, lte: dateEnd }
      },
      select: { id: true }
    });

    if (classesOnDate.length === 0) {
      // No classes scheduled, don't include in daily status
      continue;
    }

    // Check if student attended any class on this date
    const attendance = await prisma.attendance.findFirst({
      where: {
        student_id: studentId,
        class_id: { in: classesOnDate.map(c => c.id) },
        status: AttendanceStatus.PRESENT
      }
    });

    dailyStatus[dateStr] = attendance ? AttendanceStatus.PRESENT : AttendanceStatus.ABSENT;
  }

  res.status(200).json({
    success: true,
    data: {
      studentId,
      semesterId,
      subjectId,
      subjectCode: subject.code,
      subjectName: subject.name,
      attendancePercentage,
      classesAttended,
      classesMissed,
      monthlyBreakdown,
      weeklyBreakdown,
      dailyStatus
    }
  });
});

/**
 * Controller 3: Month-wise attendance details for subject
 * GET /:studentId/attendance/subject/:subjectId/month/:month (month = YYYY-MM)
 */
export const getSubjectMonthlyAttendance = catchAsync(async (req: Request, res: Response) => {
  const { studentId, subjectId, month } = req.params;
  if(!studentId){
    throw new AppError("Student Id required",400)
  }
  if(!subjectId){
    throw new AppError("subject Id required",400)
  }
  if(!month){
    throw new AppError("monthrequired",400)
  }
  
  validateUUID(studentId, "studentId");
  validateUUID(subjectId, "subjectId");
  validateDateParam(month, "month", /^\d{4}-(0[1-9]|1[0-2])$/);

  const student = await prisma.student.findUnique({ 
    where: { id: studentId }, 
    select: { division_id: true, is_active: true }
  });
  
  if (!student) throw new AppError("Student not found", 404);
  if (!student.is_active) throw new AppError("Student account is deactivated", 403);

  const monthStart = new Date(month + "-01");
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);

  // Find all classes in the month for this subject/division
  const classesInMonth = await prisma.class.findMany({
    where: {
      subject_id: subjectId,
      division_id: student.division_id,
      start_date: { gte: monthStart, lte: monthEnd }
    },
    select: { id: true, start_date: true },
    orderBy: { start_date: 'asc' }
  });

  // Fetch attendance for these class ids
  const classIds = classesInMonth.map(c => c.id);
  const attendanceRecords = await prisma.attendance.findMany({
    where: {
      student_id: studentId,
      class_id: { in: classIds },
    },
    select: { class_id: true, status: true }
  });

  const dailyAttendance: DailyAttendanceEntry[] = classesInMonth.map(c => {
    const att = attendanceRecords.find(a => a.class_id === c.id);
    return {
      date: c.start_date.toISOString().split('T')[0],
      status: att?.status || AttendanceStatus.ABSENT
    };
  });

  res.status(200).json({
    success: true,
    data: {
      month,
      subjectId,
      dailyAttendance
    }
  });
});

/**
 * Controller 4: Week-wise attendance details for subject
 * GET /:studentId/attendance/subject/:subjectId/week/:week  (week = YYYY-MM-DD format start date)
 */
export const getSubjectWeeklyAttendance = catchAsync(async (req: Request, res: Response) => {
  const { studentId, subjectId, week } = req.params;
  if(!studentId){
    throw new AppError("Student Id required",400)
  }
  if(!subjectId){
    throw new AppError("SUbject Id required",400)
  }
  if(!week){
    throw new AppError("Week Start Date required required",400)
  }
  validateUUID(studentId, "studentId");
  validateUUID(subjectId, "subjectId");
  validateDateParam(week, "week", /^\d{4}-\d{2}-\d{2}$/);

  const student = await prisma.student.findUnique({ 
    where: { id: studentId }, 
    select: { division_id: true, is_active: true }
  });
  
  if (!student) throw new AppError("Student not found", 404);
  if (!student.is_active) throw new AppError("Student account is deactivated", 403);

  const weekStart = new Date(week);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const classesInWeek = await prisma.class.findMany({
    where: {
      subject_id: subjectId,
      division_id: student.division_id,
      start_date: { gte: weekStart, lte: weekEnd }
    },
    select: { id: true, start_date: true },
    orderBy: { start_date: 'asc' }
  });

  const classIds = classesInWeek.map(c => c.id);
  const attendanceRecords = await prisma.attendance.findMany({
    where: { 
      student_id: studentId, 
      class_id: { in: classIds } 
    },
    select: { class_id: true, status: true }
  });

  const dailyAttendance: DailyAttendanceEntry[] = classesInWeek.map(c => {
    const att = attendanceRecords.find(a => a.class_id === c.id);
    return {
      date: c.start_date.toISOString().split('T')[0],
      status: att?.status || AttendanceStatus.ABSENT
    };
  });

  res.status(200).json({
    success: true,
    data: {
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
      subjectId,
      dailyAttendance
    }
  });
});

/**
 * Controller 5: Attendance status on a specific date for subject
 * GET /:studentId/attendance/subject/:subjectId/date/:date  (date = YYYY-MM-DD)
 */
export const getSubjectDailyAttendance = catchAsync(async (req: Request, res: Response) => {
  const { studentId, subjectId, date } = req.params;
  if(!studentId){
    throw new AppError("Student Id required",400)
  }
  if(!date){
    throw new AppError("Subject Id required",400)
  }
  if(!subjectId){
    throw new AppError("Date Id required",400)
  }
  
  validateUUID(studentId, "studentId");
  validateUUID(subjectId, "subjectId");
  validateDateParam(date, "date", /^\d{4}-\d{2}-\d{2}$/);

  const student = await prisma.student.findUnique({ 
    where: { id: studentId }, 
    select: { division_id: true, is_active: true }
  });
  
  if (!student) throw new AppError("Student not found", 404);
  if (!student.is_active) throw new AppError("Student account is deactivated", 403);

  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);

  // Find classes of that subject/division on the given date
  const classesOnDate = await prisma.class.findMany({
    where: {
      subject_id: subjectId,
      division_id: student.division_id,
      start_date: { gte: startDate, lte: endDate }
    },
    select: { id: true }
  });

  if (classesOnDate.length === 0) {
    return res.status(200).json({
      success: true,
      data: {
        date,
        subjectId,
        studentId,
        status: null, // No classes scheduled
        message: "No classes scheduled for this date"
      }
    });
  }

  // Check attendance for student for those classes
  const attendanceRecord = await prisma.attendance.findFirst({
    where: {
      student_id: studentId,
      class_id: { in: classesOnDate.map(c => c.id) },
    },
    select: { status: true }
  });

  const status: AttendanceStatus = attendanceRecord?.status || AttendanceStatus.ABSENT;

  res.status(200).json({
    success: true,
    data: {
      date,
      subjectId,
      studentId,
      status
    }
  });
});