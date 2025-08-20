import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";


export const getAttendanceAnalytics = catchAsync(async (req: Request, res: Response) => {
  const { subjectId } = req.params;
  const { id: teacherId } = req.user!;

  if (!subjectId) {
    throw new AppError("subjectId is required", 400);
  }

  const subject = await prisma.subject.findFirst({
    where: {
      id: subjectId,
      teacher_id: teacherId 
    },
    include: {
      semester: {
        include: {
          division: {
            include: {
              batch: { select: { id: true, name: true } },
              school: { select: { id: true, name: true } },
              center: { select: { id: true, name: true } }
            }
          }
        }
      }
    }
  });

  if (!subject) {
    throw new AppError("Subject not found or access denied", 404);
  }

  const currentDate = new Date();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(currentDate.getMonth() - 6);

  const classes = await prisma.class.findMany({
    where: {
      subject_id: subjectId,
      start_date: {
        gte: sixMonthsAgo,
        lte: currentDate
      }
    },
    include: {
      attendances: {
        include: {
          student: {
            select: {
              id: true,
              name: true,
              enrollment_id: true
            }
          }
        }
      }
    },
    orderBy: { start_date: 'asc' }
  });

  const allStudents = await prisma.student.findMany({
    where: { 
      division_id: subject.semester.division_id,
      is_active: true
    },
    select: {
      id: true,
      name: true,
      enrollment_id: true
    }
  });

  const analytics = calculateComprehensiveAnalytics(classes, allStudents, sixMonthsAgo, currentDate);

  res.status(200).json({
    success: true,
    subject: {
      id: subject.id,
      name: subject.name,
      code: subject.code,
      credits: subject.credits
    },
    division: {
      id: subject!.semester!.division!.id,
      code: subject!.semester!.division!.code,
      batch: subject!.semester!.division!.batch,
      school: subject!.semester!.division!.school,
      center: subject!.semester!.division!.center
    },
    dateRange: {
      from: sixMonthsAgo.toISOString(),
      to: currentDate.toISOString()
    },
    data: analytics
  });
});

function calculateComprehensiveAnalytics(
  classes: any[], 
  allStudents: any[], 
  startDate: Date, 
  endDate: Date
) {
  const totalStudents = allStudents.length;
  
  if (classes.length === 0) {
    return {
      averageAttendance: 0,
      totalStudents,
      totalClasses: 0,
      monthsTracked: 0,
      monthlyTrends: [],
      distributionByAttendance: {
        below50: 0,
        between50And75: 0,
        above75: 0
      },
      studentDetails: allStudents.map(student => ({
        enrollmentId: student.enrollment_id,
        name: student.name,
        overallAttendance: 0,
        totalClassesAttended: 0,
        totalClassesConducted: 0
      }))
    };
  }

  const monthlyData = new Map<string, { 
    present: number; 
    total: number; 
  }>();
  
  const studentAttendanceData = new Map<string, { 
    present: number; 
    total: number; 
    monthlyData: Map<string, { present: number; total: number }> 
  }>();

  allStudents.forEach(student => {
    studentAttendanceData.set(student.id, { 
      present: 0, 
      total: 0, 
      monthlyData: new Map() 
    });
  });

  classes.forEach(classData => {
    const classDate = new Date(classData.date);
    const monthKey = `${classDate.getFullYear()}-${String(classDate.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyData.has(monthKey)) {
      monthlyData.set(monthKey, { present: 0, total: 0 });
    }

    const monthData = monthlyData.get(monthKey)!;
    
    allStudents.forEach(student => {
      const attendance = classData.attendances.find((att: any) => att.student_id === student.id);
      const studentData = studentAttendanceData.get(student.id)!;
      
      if (!studentData.monthlyData.has(monthKey)) {
        studentData.monthlyData.set(monthKey, { present: 0, total: 0 });
      }
      const studentMonthData = studentData.monthlyData.get(monthKey)!;
      
      studentData.total++;
      studentMonthData.total++;
      monthData.total++;
      
      if (attendance && attendance.status === 'PRESENT') {
        studentData.present++;
        studentMonthData.present++;
        monthData.present++;
      }
    });
  });

  const totalPossibleAttendance = classes.length * totalStudents;
  const totalPresentAttendance = Array.from(monthlyData.values())
    .reduce((sum, data) => sum + data.present, 0);
  
  const averageAttendance = totalPossibleAttendance > 0 
    ? (totalPresentAttendance / totalPossibleAttendance) * 100 
    : 0;

  const monthlyTrends = Array.from(monthlyData.entries())
    .map(([month, data]) => ({
      month,
      attendancePercentage: Math.round((data.present / data.total) * 10000) / 100,
      totalClasses: data.total / totalStudents,
      studentsPresent: data.present,
      totalPossibleAttendance: data.total
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const distributionByAttendance = {
    below50: 0,
    between50And75: 0,
    above75: 0
  };

  const studentDetails = allStudents.map(student => {
    const studentData = studentAttendanceData.get(student.id)!;
    
    const attendancePercentage = studentData.total > 0 
      ? (studentData.present / studentData.total) * 100 
      : 0;
    
    if (attendancePercentage < 50) {
      distributionByAttendance.below50++;
    } else if (attendancePercentage <= 75) {
      distributionByAttendance.between50And75++;
    } else {
      distributionByAttendance.above75++;
    }

    return {
      enrollmentId: student.enrollment_id,
      name: student.name,
      overallAttendance: Math.round(attendancePercentage * 100) / 100,
      totalClassesAttended: studentData.present,
      totalClassesConducted: studentData.total,
      monthsTracked: studentData.monthlyData.size
    };
  });

  return {
    averageAttendance: Math.round(averageAttendance * 100) / 100,
    totalStudents,
    totalClasses: classes.length,
    monthsTracked: monthlyTrends.length,
    monthlyTrends,
    distributionByAttendance,
    studentDetails: studentDetails.sort((a, b) => b.overallAttendance - a.overallAttendance)
  };
}

interface ClassStudent {
  enrollmentId: string;
  name: string;
  status: 'PRESENT' | 'ABSENT';
}

interface ClassDetail {
  classId: string;
  startTime: Date | null;
  endTime: Date | null;
  topic: string | null;
  presentCount: number;
  absentCount: number;
  students: ClassStudent[];
}

interface StudentAttendance {
  enrollmentId: string;
  name: string;
  status: 'PRESENT' | 'ABSENT' | 'NOT_MARKED' | 'MIXED';
  classesPresent: number;
  classesAbsent: number;
  totalClasses: number;
  attendancePercentage: number;
}

interface AttendanceSummary {
  totalStudents: number;
  totalClasses: number;
  studentsPresent: number;
  studentsAbsent: number;
  studentsNotMarked: number;
  overallAttendancePercentage: number;
  totalPresentCount: number;
  totalAbsentCount: number;
}

interface AttendanceAnalyticsResponse {
  success: boolean;
  date: string|undefined;
  subject: {
    id: string;
    name: string;
    code: string;
    credits: number;
  };
  division: {
    id: string;
    code: string;
    batch: { id: string; name: string };
    school: { id: string; name: string };
    center: { id: string; name: string };
  };
  summary: AttendanceSummary;
  classDetails: ClassDetail[];
  studentDetails: StudentAttendance[];
}


export const getDailyAttendanceAnalytics = catchAsync(async (req: Request, res: Response) => {
  const { subjectId } = req.params;
  const { id: teacherId } = req.user!;

  if (!subjectId) {
    throw new AppError("subjectId is required", 400);
  }

  // Verify teacher has access to this subject
  const subject = await prisma.subject.findFirst({
    where: {
      id: subjectId,
      teacher_id: teacherId
    },
    include: {
      semester: {
        select: {
          id: true,
          number: true,
          division: {
            select: {
              id: true,
              code: true,
              batch: { select: { id: true, name: true } },
              school: { select: { id: true, name: true } },
              center: { select: { id: true, name: true } }
            }
          }
        }
      }
    }
  });

  if (!subject) {
    throw new AppError("Subject not found or access denied", 404);
  }

  // Get today's date range
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  // Get all classes for this subject happening today
  const classes = await prisma.class.findMany({
    where: {
      subject_id: subjectId,
      start_date: {
        gte: startOfDay,
        lt: endOfDay
      }
    },
    include: {
      attendances: {
        include: {
          student: {
            select: {
              id: true,
              name: true,
              enrollment_id: true
            }
          }
        }
      }
    },
    orderBy: { start_date: 'asc' }
  });

  // Get all students in the division
  const allStudents = await prisma.student.findMany({
    where: {
      division_id: subject.semester.division!.id,
      is_active: true
    },
    select: {
      id: true,
      name: true,
      enrollment_id: true
    }
  });

  // Process attendance data
  let totalPresent = 0;
  let totalAbsent = 0;
  
  const studentMap = new Map<string, StudentAttendance>();

  // Initialize all students
  allStudents.forEach((student) => {
    studentMap.set(student.id, {
      enrollmentId: student.enrollment_id,
      name: student.name,
      status: 'NOT_MARKED',
      classesPresent: 0,
      classesAbsent: 0,
      totalClasses: classes.length,
      attendancePercentage: 0
    });
  });

  const classDetails: ClassDetail[] = [];

  // Process each class
  for (const classItem of classes) {
    const currentClass: ClassDetail = {
      classId: classItem.id,
      startTime: classItem.start_date,
      endTime: classItem.end_date,
      topic: classItem.lecture_number || `Lecture ${classItem.lecture_number || ''}`,
      presentCount: 0,
      absentCount: 0,
      students: []
    };

    // Process attendance for this class
    for (const attendance of classItem.attendances) {
      const student = studentMap.get(attendance.student_id);
      if (!student) continue;

      if (attendance.status === 'PRESENT') {
        student.classesPresent++;
        currentClass.presentCount++;
        totalPresent++;
        
        // Update overall status
        if (student.status === 'NOT_MARKED') {
          student.status = 'PRESENT';
        } else if (student.status === 'ABSENT') {
          student.status = 'MIXED';
        }
      } else {
        student.classesAbsent++;
        currentClass.absentCount++;
        totalAbsent++;
        
        // Update overall status
        if (student.status === 'NOT_MARKED') {
          student.status = 'ABSENT';
        } else if (student.status === 'PRESENT') {
          student.status = 'MIXED';
        }
      }

      currentClass.students.push({
        enrollmentId: attendance.student.enrollment_id,
        name: attendance.student.name,
        status: attendance.status as 'PRESENT' | 'ABSENT'
      });
    }

    // Sort students by name
    currentClass.students.sort((a, b) => a.name.localeCompare(b.name));
    classDetails.push(currentClass);
  }

  // Calculate attendance percentages and prepare student details
  const studentDetails: StudentAttendance[] = Array.from(studentMap.values())
    .map((student) => {
      const attendancePercentage = student.totalClasses > 0
        ? (student.classesPresent / student.totalClasses) * 100
        : 0;
      
      return {
        ...student,
        attendancePercentage: Math.round(attendancePercentage * 100) / 100
      };
    })
    .sort((a, b) => {
      // Sort by attendance percentage (desc), then by name (asc)
      if (b.attendancePercentage !== a.attendancePercentage) {
        return b.attendancePercentage - a.attendancePercentage;
      }
      return a.name.localeCompare(b.name);
    });

  // Calculate summary statistics
  const totalStudents = allStudents.length;
  const studentsPresent = studentDetails.filter(s => s.classesPresent > 0).length;
  const studentsAbsent = studentDetails.filter(s => s.classesAbsent > 0 && s.classesPresent === 0).length;
  const studentsNotMarked = studentDetails.filter(s => s.status === 'NOT_MARKED').length;

  const overallAttendancePercentage = classes.length > 0 && totalStudents > 0
    ? Math.round((totalPresent / (classes.length * totalStudents)) * 100)
    : 0;

  const response: AttendanceAnalyticsResponse = {
    success: true,
    date: startOfDay.toISOString().split('T')[0],
    subject: {
      id: subject.id,
      name: subject.name,
      code: subject.code,
      credits: subject.credits
    },
    division: {
      id: subject.semester.division!.id,
      code: subject.semester.division!.code,
      batch: subject.semester.division!.batch,
      school: subject.semester.division!.school,
      center: subject.semester.division!.center
    },
    summary: {
      totalStudents,
      totalClasses: classes.length,
      studentsPresent,
      studentsAbsent,
      studentsNotMarked,
      overallAttendancePercentage,
      totalPresentCount: totalPresent,
      totalAbsentCount: totalAbsent
    },
    classDetails,
    studentDetails
  };

  res.status(200).json(response);
});