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
  month: string;
  attended: number;
  totalClasses: number;
}

interface WeeklyAttendance {
  weekStart: string;
  weekEnd: string;
  attended: number;
  totalClasses: number;
}

interface DailyAttendanceEntry {
  date: string;
  status: AttendanceStatus;
  classCount: number; 
}


function validateUUID(value: string, name: string) {
  if (!value || !uuidValidate(value)) throw new AppError(`Invalid or missing ${name}.`, 400);
}


function validateDateParam(date: string, name: string, pattern: RegExp) {
  if (!date || !pattern.test(date)) throw new AppError(`Invalid or missing ${name}.`, 400);
}


export const getOverallSemesterAttendance = catchAsync(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  const semesterId = req.query.semesterId as string;
  const now = new Date();

  if (!studentId) {
    throw new AppError("Student Id required", 400);
  }

  validateUUID(studentId, "studentId");
  if (!semesterId) throw new AppError("semesterId query param is required.", 400);
  validateUUID(semesterId, "semesterId");

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, is_active: true, division_id: true },
  });
  
  if (!student) throw new AppError("Student not found.", 404);
  if (!student.is_active) throw new AppError("Student account is deactivated.", 403);

  const semesterSubjects = await prisma.subject.findMany({
    where: { semester_id: semesterId },
    select: { id: true, code: true, name: true },
  });

  let totalClasses = 0;
  let classesAttended = 0;
  const subjectWiseAttendance: SubjectAttendanceSummary[] = [];

  for (const subject of semesterSubjects) {
    const totalForSubject = await prisma.class.count({
      where: {
        subject_id: subject.id,
        division_id: student.division_id,
        start_date: { lt: now } 
      }
    });

    const attendedForSubject = await prisma.attendance.count({
      where: {
        student_id: studentId,
        status: AttendanceStatus.PRESENT,
        class: {
          subject_id: subject.id,
          division_id: student.division_id,
          start_date: { lt: now } 
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


export const getSubjectWiseAttendance = catchAsync(async (req: Request, res: Response) => {
  const { studentId, subjectId } = req.params;
  const semesterId = req.query.semesterId as string;
  const now = new Date();

  if (!studentId) {
    throw new AppError("Student Id required", 400);
  }
  if (!subjectId) {
    throw new AppError("Subject Id required", 400);
  }

  validateUUID(studentId, "studentId");
  validateUUID(subjectId, "subjectId");
  if (!semesterId) throw new AppError("semesterId query param is required.", 400);
  validateUUID(semesterId, "semesterId");

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

  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    select: { start_date: true, end_date: true }
  });

  if (!semester) throw new AppError("Semester not found", 404);

  const totalClasses = await prisma.class.count({
    where: {
      subject_id: subjectId,
      division_id: student.division_id,
      start_date: { 
        gte: semester.start_date,
        lt: now, 
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
          lt: now,
          ...(semester.end_date && { lte: semester.end_date })
        }
      }
    }
  });

  const classesMissed = totalClasses - classesAttended;
  const attendancePercentage = totalClasses === 0 ? 0 : Math.round((classesAttended / totalClasses) * 100);

  const monthlyBreakdown: MonthlyAttendance[] = [];
  const semesterStart = new Date(semester.start_date);
  const currentDate = new Date();
  
  const startMonth = new Date(semesterStart.getFullYear(), semesterStart.getMonth(), 1);
  const currentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  
  for (let d = new Date(startMonth); d <= currentMonth; d.setMonth(d.getMonth() + 1)) {
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    
    const effectiveMonthEnd = monthEnd > now ? now : monthEnd;

    const monthTotal = await prisma.class.count({
      where: {
        subject_id: subjectId,
        division_id: student.division_id,
        start_date: { gte: monthStart, lt: effectiveMonthEnd }
      }
    });

    const monthAttended = await prisma.attendance.count({
      where: {
        student_id: studentId,
        status: AttendanceStatus.PRESENT,
        class: {
          subject_id: subjectId,
          division_id: student.division_id,
          start_date: { gte: monthStart, lt: effectiveMonthEnd }
        }
      }
    });

    monthlyBreakdown.push({
      month: `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`,
      attended: monthAttended,
      totalClasses: monthTotal
    });
  }

  const weeklyBreakdown: WeeklyAttendance[] = [];
  for (let i = 3; i >= 0; i--) {
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() - 7 * i);
    weekEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const effectiveWeekEnd = weekEnd > now ? now : weekEnd;

    const weekTotal = await prisma.class.count({
      where: {
        subject_id: subjectId,
        division_id: student.division_id,
        start_date: { gte: weekStart, lt: effectiveWeekEnd }
      }
    });

    const weekAttended = await prisma.attendance.count({
      where: {
        student_id: studentId,
        status: AttendanceStatus.PRESENT,
        class: {
          subject_id: subjectId,
          division_id: student.division_id,
          start_date: { gte: weekStart, lt: effectiveWeekEnd }
        }
      }
    });

    weeklyBreakdown.push({
      weekStart: weekStart.toISOString().split('T')[0]!,
      weekEnd: weekEnd.toISOString().split('T')[0]!,
      attended: weekAttended,
      totalClasses: weekTotal
    });
  }

  const dailyStatus: { [date: string]: { status: AttendanceStatus; classCount: number } } = {};
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setHours(23, 59, 59, 999);
    
    if (date >= now) continue;
    
    const dateStr = date.toISOString().split('T')[0];
    if(!dateStr) continue;

    const classesOnDate = await prisma.class.findMany({
      where: {
        subject_id: subjectId,
        division_id: student.division_id,
        start_date: { gte: date, lte: dateEnd },
        end_date: { lt: now } 
      },
      select: { id: true }
    });

    if (classesOnDate.length === 0) {
      continue;
    }

    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        student_id: studentId,
        class_id: { in: classesOnDate.map(c => c.id) }
      },
      select: { status: true, class_id: true }
    });

    const presentCount = attendanceRecords.filter(a => a.status === AttendanceStatus.PRESENT).length;
    const totalClassesOnDate = classesOnDate.length;

    dailyStatus[dateStr] = {
      status: presentCount > 0 ? AttendanceStatus.PRESENT : AttendanceStatus.ABSENT,
      classCount: totalClassesOnDate
    };
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


export const getSubjectMonthlyAttendance = catchAsync(async (req: Request, res: Response) => {
  const { studentId, subjectId, month } = req.params;
  const now = new Date();

  if (!studentId) {
    throw new AppError("Student Id required", 400);
  }
  if (!subjectId) {
    throw new AppError("Subject Id required", 400);
  }
  if (!month) {
    throw new AppError("Month required", 400);
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

  const effectiveMonthEnd = monthEnd > now ? now : monthEnd;

  const classesInMonth = await prisma.class.findMany({
    where: {
      subject_id: subjectId,
      division_id: student.division_id,
      start_date: { gte: monthStart, lte: effectiveMonthEnd },
      end_date: { lt: now } 
    },
    select: { id: true, start_date: true },
    orderBy: { start_date: 'asc' }
  });

  const classIds = classesInMonth.map(c => c.id);
  const attendanceRecords = await prisma.attendance.findMany({
    where: {
      student_id: studentId,
      class_id: { in: classIds },
    },
    select: { class_id: true, status: true }
  });

  const dailyAttendanceMap: { [date: string]: DailyAttendanceEntry } = {};

  classesInMonth.forEach(c => {
    const dateStr = c.start_date.toISOString().split('T')[0]!;
    const attendance = attendanceRecords.find(a => a.class_id === c.id);
    const status = attendance?.status || AttendanceStatus.ABSENT;

    if (!dailyAttendanceMap[dateStr]) {
      dailyAttendanceMap[dateStr] = {
        date: dateStr,
        status: status,
        classCount: 1
      };
    } else {
      dailyAttendanceMap[dateStr].classCount += 1;
      if (status === AttendanceStatus.PRESENT) {
        dailyAttendanceMap[dateStr].status = AttendanceStatus.PRESENT;
      }
    }
  });

  const dailyAttendance: DailyAttendanceEntry[] = Object.values(dailyAttendanceMap)
    .sort((a, b) => a.date.localeCompare(b.date));

  res.status(200).json({
    success: true,
    data: {
      month,
      subjectId,
      dailyAttendance
    }
  });
});


export const getSubjectWeeklyAttendance = catchAsync(async (req: Request, res: Response) => {
  const { studentId, subjectId, week } = req.params;
  const now = new Date();

  if (!studentId) {
    throw new AppError("Student Id required", 400);
  }
  if (!subjectId) {
    throw new AppError("Subject Id required", 400);
  }
  if (!week) {
    throw new AppError("Week Start Date required", 400);
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

  const effectiveWeekEnd = weekEnd > now ? now : weekEnd;

  const classesInWeek = await prisma.class.findMany({
    where: {
      subject_id: subjectId,
      division_id: student.division_id,
      start_date: { gte: weekStart, lte: effectiveWeekEnd },
      end_date: { lt: now } 
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

  const dailyAttendanceMap: { [date: string]: DailyAttendanceEntry } = {};

  classesInWeek.forEach(c => {
    const dateStr = c.start_date.toISOString().split('T')[0]!;
    const attendance = attendanceRecords.find(a => a.class_id === c.id);
    const status = attendance?.status || AttendanceStatus.ABSENT;

    if (!dailyAttendanceMap[dateStr]) {
      dailyAttendanceMap[dateStr] = {
        date: dateStr,
        status: status,
        classCount: 1
      };
    } else {
      dailyAttendanceMap[dateStr].classCount += 1;
      if (status === AttendanceStatus.PRESENT) {
        dailyAttendanceMap[dateStr].status = AttendanceStatus.PRESENT;
      }
    }
  });

  const dailyAttendance: DailyAttendanceEntry[] = Object.values(dailyAttendanceMap)
    .sort((a, b) => a.date.localeCompare(b.date));

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


export const getSubjectDailyAttendance = catchAsync(async (req: Request, res: Response) => {
  const { studentId, subjectId, date } = req.params;
  const now = new Date();

  if (!studentId) {
    throw new AppError("Student Id required", 400);
  }
  if (!subjectId) {
    throw new AppError("Subject Id required", 400);
  }
  if (!date) {
    throw new AppError("Date required", 400);
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

  
  if (startDate >= now) {
    return res.status(200).json({
      success: true,
      data: {
        date,
        subjectId,
        studentId,
        status: null,
        message: "Cannot show attendance for future dates"
      }
    });
  }

  const classesOnDate = await prisma.class.findMany({
    where: {
      subject_id: subjectId,
      division_id: student.division_id,
      start_date: { gte: startDate, lte: endDate },
      end_date: { lt: now } 
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
        status: null,
        classCount: 0,
        message: "No completed classes scheduled for this date"
      }
    });
  }

  const attendanceRecords = await prisma.attendance.findMany({
    where: {
      student_id: studentId,
      class_id: { in: classesOnDate.map(c => c.id) },
    },
    select: { status: true }
  });

  const presentCount = attendanceRecords.filter(a => a.status === AttendanceStatus.PRESENT).length;
  const totalClassesOnDate = classesOnDate.length;

  const overallStatus = presentCount > 0 ? AttendanceStatus.PRESENT : AttendanceStatus.ABSENT;

  res.status(200).json({
    success: true,
    data: {
      date,
      subjectId,
      studentId,
      status: overallStatus,
      classCount: totalClassesOnDate,
      attendedClasses: presentCount,
      attendanceDetails: {
        totalClasses: totalClassesOnDate,
        attended: presentCount,
        missed: totalClassesOnDate - presentCount
      }
    }
  });
});

export const getAttendanceSubjectWise = catchAsync(async (req: Request, res: Response) => {
  const { subjectId } = req.params;
  const studentId=req.user?.id!;
  
  if (!subjectId) {
    return res.status(400).json({
      success: false,
      message: "Subject ID is required"
    });
  }

  try {
    const currentDate = new Date();
    
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        name: true,
        enrollment_id: true
      }
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    const scheduledClasses = await prisma.class.findMany({
      where: {
        subject_id: subjectId,
        start_date: {
          lt: currentDate
        }
      },
      include: {
        subject: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        room: {
          select: {
            id: true,
            name: true
          }
        },
        teacher: {
          select: {
            id: true,
            name: true
          }
        },
        division: {
          select: {
            id: true,
            code: true
          }
        },
        attendances: {
          where: {
            student_id: studentId
          },
          select: {
            id: true,
            status: true,
            successful_scan_count: true,
            marked_by: true,
            createdAt: true
          }
        }
      },
      orderBy: [
        {
          start_date: 'asc'
        }
      ]
    });

    if (scheduledClasses.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No scheduled classes found for this subject"
      });
    }

    // Group classes by date and create period format
    const attendanceData: {
      date: string;
      periods: {
        period: number;
        classId: string;
        lectureNumber: string;
        startDate: Date;
        endDate: Date;
        roomName: string;
        teacherName: string;
        divisionCode: string;
        googleEventId: string;
        periodLabel: string;
        attendance: {
          status: "PRESENT" | "ABSENT" | "NOT_MARKED";
          marked_by: string | null;
          successful_scan_count: number | null;
          marked_at: Date | null;
        };
      }[];
      totalPeriods: number;
      presentCount: number;
      absentCount: number;
      notMarkedCount: number;
    }[] = [];

    // Group by date
    const dateGroups = new Map<string, typeof scheduledClasses>();
    
    scheduledClasses.forEach(classItem => {
      const dateKey = classItem.start_date.toISOString().split('T')[0]!; 
      
      if (!dateGroups.has(dateKey)) {
        dateGroups.set(dateKey, []);
      }
      dateGroups.get(dateKey)!.push(classItem);
    });

    // Convert grouped data to required format
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalNotMarked = 0;

    dateGroups.forEach((classes, dateKey) => {
      let dayPresent = 0;
      let dayAbsent = 0;
      let dayNotMarked = 0;

      const periods = classes.map((classItem, index) => {
        const attendance = classItem.attendances[0]; // Should be only one record per student per class
        
        let attendanceStatus: "PRESENT" | "ABSENT" | "NOT_MARKED";
        if (!attendance) {
          attendanceStatus = "NOT_MARKED";
          dayNotMarked++;
          totalNotMarked++;
        } else {
          attendanceStatus = attendance.status;
          if (attendance.status === "PRESENT") {
            dayPresent++;
            totalPresent++;
          } else {
            dayAbsent++;
            totalAbsent++;
          }
        }

        return {
          period: index + 1,
          classId: classItem.id,
          lectureNumber: classItem.lecture_number,
          startDate: classItem.start_date,
          endDate: classItem.end_date,
          roomName: classItem.room.name,
          teacherName: classItem.teacher.name,
          divisionCode: classItem.division.code,
          googleEventId: classItem.googleEventId,
          periodLabel: `${dateKey}-period ${index + 1}`,
          attendance: {
            status: attendanceStatus,
            marked_by: attendance?.marked_by || null,
            successful_scan_count: attendance?.successful_scan_count || null,
            marked_at: attendance?.createdAt || null
          }
        };
      });

      attendanceData.push({
        date: dateKey,
        periods,
        totalPeriods: periods.length,
        presentCount: dayPresent,
        absentCount: dayAbsent,
        notMarkedCount: dayNotMarked
      });
    });

    // Calculate attendance percentage
    const totalClasses = scheduledClasses.length;
    const attendancePercentage = totalClasses > 0 ? ((totalPresent / totalClasses) * 100).toFixed(2) : "0.00";

    // Get subject information
    const subject = scheduledClasses[0]!.subject;

    res.status(200).json({
      success: true,
      data: {
        student: {
          id: student.id,
          name: student.name,
          enrollment_id: student.enrollment_id
        },
        subject: {
          id: subject.id,
          name: subject.name,
          code: subject.code
        },
        summary: {
          totalScheduledClasses: totalClasses,
          totalScheduledDays: attendanceData.length,
          presentCount: totalPresent,
          absentCount: totalAbsent,
          notMarkedCount: totalNotMarked,
          attendancePercentage: parseFloat(attendancePercentage)
        },
        attendanceByDate: attendanceData
      },
      message: "Student subject-wise attendance data retrieved successfully"
    });

  } catch (error) {
    console.error('Error fetching subject-wise attendance:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching attendance data"
    });
  }
});