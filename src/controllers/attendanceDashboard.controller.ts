import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../utils/AppError.js';
import type { SchoolName } from '@prisma/client';
import { schoolAnalysisSchema } from '../schema/attendanceDashboard.schema.js';

const initializeSchoolData = () => ({
  totalStudents: 0,
  averageAttendance: 0,
  students: [] as any[],
  belowThreshold: [] as any[], // Attendance < 80%
  atRisk: [] as any[],         // Attendance < 50%
});

const studentSelectClause = {
  id: true,
  name: true,
  enrollment_id: true,
  division: {
    select: {
      code: true,
      school: { select: { name: true } },
      batch: { select: { name: true } },
      center: { select: { name: true } },
    }
  }
};

export const getAttendanceDashboard = catchAsync(async (req: Request, res: Response) => {
  const now = new Date();

  const allActiveStudents = await prisma.student.findMany({
    where: {
      is_active: true,
      division: {
        currentSemester: {
          start_date: { lte: now },
          OR: [{ end_date: { gte: now } }, { end_date: null }],
        },
      },
    },
    select: {
      id: true,
      division: {
        select: {
          id: true,
          school: { select: { name: true } },
          currentSemester: {
            select: { subjects: { select: { id: true } } }
          }
        }
      }
    }
  });

  if (allActiveStudents.length === 0) {
    throw new AppError("No active students found in ongoing semesters.", 404);
  }
  
  const studentIds = allActiveStudents.map(s => s.id);
  const divisionIds = [...new Set(allActiveStudents.map(s => s.division.id))];
  const subjectIds = [...new Set(allActiveStudents.flatMap(s => s.division.currentSemester?.subjects.map(sub => sub.id) || []))];

  const [totalClassesResults, attendedClassesResults] = await Promise.all([
    prisma.class.groupBy({
      by: ['division_id'],
      where: {
        division_id: { in: divisionIds },
        subject_id: { in: subjectIds },
        start_date: { lt: now },
      },
      _count: { id: true },
    }),
    prisma.attendance.groupBy({
      by: ['student_id'],
      where: {
        student_id: { in: studentIds },
        status: 'PRESENT',
        class: {
          subject_id: { in: subjectIds },
          start_date: { lt: now },
        },
      },
      _count: { id: true },
    })
  ]);

  const totalClassesMap = new Map(totalClassesResults.map(item => [item.division_id, item._count.id]));
  const attendedClassesMap = new Map(attendedClassesResults.map(item => [item.student_id, item._count.id]));

  const studentAttendanceMap = new Map<string, object>();
  const schoolCategorizedIds: Record<SchoolName, { all: string[], belowThreshold: string[], atRisk: string[] }> = {
    SOT: { all: [], belowThreshold: [], atRisk: [] }, SOM: { all: [], belowThreshold: [], atRisk: [] }, SOH: { all: [], belowThreshold: [], atRisk: [] },
  };
  const schoolTotals: Record<SchoolName, { totalAttended: number; totalScheduled: number }> = {
    SOT: { totalAttended: 0, totalScheduled: 0 }, SOM: { totalAttended: 0, totalScheduled: 0 }, SOH: { totalAttended: 0, totalScheduled: 0 },
  };

  for (const student of allActiveStudents) {
    const totalClasses = totalClassesMap.get(student.division.id) || 0;
    const attendedClasses = attendedClassesMap.get(student.id) || 0;
    const percentage = totalClasses > 0 ? Math.round((attendedClasses / totalClasses) * 100) : 0;

    studentAttendanceMap.set(student.id, { percentage, attendedClasses, totalClasses });
    
    const schoolKey = student.division.school.name;
    schoolCategorizedIds[schoolKey].all.push(student.id);
    schoolTotals[schoolKey].totalAttended += attendedClasses;
    schoolTotals[schoolKey].totalScheduled += totalClasses;

    if (percentage < 50) {
      schoolCategorizedIds[schoolKey].atRisk.push(student.id);
    } else if (percentage < 80) {
      schoolCategorizedIds[schoolKey].belowThreshold.push(student.id);
    }
  }

  const dashboardData = { SOT: initializeSchoolData(), SOM: initializeSchoolData(), SOH: initializeSchoolData() };

  for (const school of ['SOT', 'SOM', 'SOH'] as SchoolName[]) {
    const ids = schoolCategorizedIds[school];

    const [allStudents, belowThresholdStudents, atRiskStudents] = await Promise.all([
      prisma.student.findMany({ where: { id: { in: ids.all } }, select: studentSelectClause }),
      prisma.student.findMany({ where: { id: { in: ids.belowThreshold } }, select: studentSelectClause }),
      prisma.student.findMany({ where: { id: { in: ids.atRisk } }, select: studentSelectClause })
    ]);

    const formatStudentOutput = (student: typeof allStudents[0]) => ({
      name: student.name,
      enrollmentId: student.enrollment_id,
      centerName: student.division.center.name,
      batchCode: `${student.division.school.name}${student.division.batch.name}${student.division.code}`,
      attendance: studentAttendanceMap.get(student.id),
    });

    dashboardData[school].totalStudents = ids.all.length;
    dashboardData[school].averageAttendance = schoolTotals[school].totalScheduled > 0
      ? Math.round((schoolTotals[school].totalAttended / schoolTotals[school].totalScheduled) * 100)
      : 0;
      
    dashboardData[school].students = allStudents.map(formatStudentOutput);
    dashboardData[school].belowThreshold = belowThresholdStudents.map(formatStudentOutput);
    dashboardData[school].atRisk = atRiskStudents.map(formatStudentOutput);
  }

  res.status(200).json({
    success: true,
    data: dashboardData,
  });
});


export const getSchoolAnalysisByDivision = catchAsync(async (req: Request, res: Response) => {
  const validation = schoolAnalysisSchema.safeParse(req.query);
  if (!validation.success) {
    const errorMessages = validation.error.issues.map(issue => issue.message).join(', ');
    throw new AppError(errorMessages, 400);
  }
  
  const { school, from, to } = validation.data;
  const fromDate = from;
  const toDate = to || new Date();

  if (fromDate > toDate) {
    throw new AppError('The "from" date cannot be after the "to" date.', 400);
  }

  const semesterDateFilter = {
    start_date: { lte: toDate }, 
    OR: [
      { end_date: { gte: fromDate } }, 
      { end_date: null }              
    ],
  };

  const divisions = await prisma.division.findMany({
    where: {
      school: { name: school },
      semesters: {
        some: semesterDateFilter
      }
    },
    include: {
      center: {
        select: {
          id: true,
          name: true,
          code: true
        }
      },
      batch: {
        select: { name: true }
      },
      semesters: {
        where: semesterDateFilter,
        orderBy: { start_date: 'desc' }, 
        take: 1,
        include: {
          subjects: {
            include: {
              classes: {
                where: {
                  start_date: {
                    gte: fromDate,
                    lte: toDate
                  }
                },
                include: {
                  attendances: true
                }
              }
            }
          },
          students: true // Get students in this semester
        }
      }
    },
  });

  if (divisions.length === 0) {
    return res.status(200).json({
      success: true,
      message: `No active divisions found for school ${school} in the specified date range.`,
      data: []
    });
  }

  // Group by center
  const aggregatedData = new Map<string, {
    centerId: string;
    centerName: string;
    centerCode: number;
    divisions: {
      divisionId: string;
      divisionCode: string;
      batchName: string;
      batchCode: string;
      averageAttendance: number;
      semesterStartDate: Date | null;
    }[];
  }>();

  divisions.forEach((division) => {
    const center = division.center;
    const currentSemester = division.semesters[0]; 
    
    let totalClasses = 0;
    let totalPresentAttendances = 0;
    let totalStudents = currentSemester?.students.length || 0;

    if (currentSemester) {
      currentSemester.subjects.forEach(subject => {
        subject.classes.forEach(classSession => {
          totalClasses += totalStudents; 
          
          const presentCount = classSession.attendances.filter(
            attendance => attendance.status === 'PRESENT'
          ).length;
          
          totalPresentAttendances += presentCount;
        });
      });
    }

    const averageAttendance = totalClasses > 0 
      ? Math.round((totalPresentAttendances / totalClasses) * 100) 
      : 0;

    let centerEntry = aggregatedData.get(center.id);
    if (!centerEntry) {
      centerEntry = {
        centerId: center.id,
        centerName: center.name,
        centerCode: center.code,
        divisions: [],
      };
      aggregatedData.set(center.id, centerEntry);
    }

    centerEntry.divisions.push({
      divisionId: division.id,
      divisionCode: division.code,
      batchName: division.batch.name,
      batchCode: `${division.batch.name}${division.code}`,
      averageAttendance: averageAttendance,
      semesterStartDate: currentSemester?.start_date || null,
    });
  });

  const result = Array.from(aggregatedData.values());

  res.status(200).json({
    success: true,
    data: result,
  });
});