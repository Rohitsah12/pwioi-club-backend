import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { PrismaClient, ExamType } from "@prisma/client";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";

const prisma = new PrismaClient();

const performanceTrendsSchema = z.object({
  semester_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  exam_type: z.nativeEnum(ExamType),
  exam_name: z.string().min(1)
});

const leaderboardSchema = z.object({
  semester_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  exam_type: z.nativeEnum(ExamType),
  exam_name: z.string().min(1)
});



export const getStudentPerformanceTrends = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const parseResult = performanceTrendsSchema.safeParse(req.query);
    if (!parseResult.success) {
      return next(new AppError("Invalid query parameters", 400));
    }
    const { semester_id, subject_id, exam_type, exam_name } = parseResult.data;
    const studentId = req.user!.id;

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { division: { include: { center: true, school: true, batch: true } } }
    });
    if (!student) return next(new AppError("Student not found", 404));

    const subject = await prisma.subject.findUnique({
      where: { id: subject_id },
      include: { teacher: true }
    });
    if (!subject) return next(new AppError("Subject not found", 404));

    const exams = await prisma.exam.findMany({
      where: { subject_id, exam_type },
      include: { marks: { where: { student_id: studentId } } },
      orderBy: { exam_date: "asc" }
    });

    const trends = await Promise.all(exams.map(async exam => {
      const studentMark = exam.marks[0];
      const divisionRankData = await prisma.studentExamMarks.findMany({
        where: {
          exam_id: exam.id,
          student: { division_id: student.division_id }
        },
        orderBy: { marks_obtained: "desc" }
      });
      const divisionRank = divisionRankData.findIndex(mark => mark.student_id === studentId) + 1;

      const overallRankData = await prisma.studentExamMarks.findMany({
        where: {
          exam_id: exam.id,
          student: {
            school_id: student.school_id,
            batch_id: student.batch_id,
            division: { code: student.division.code }
          }
        },
        orderBy: { marks_obtained: "desc" }
      });
      const overallRank = overallRankData.findIndex(mark => mark.student_id === studentId) + 1;

      return {
        exam_name: exam.name,
        marks_obtained: studentMark?.marks_obtained || 0,
        full_marks: exam.full_marks,
        percentage: studentMark ? (studentMark.marks_obtained / exam.full_marks) * 100 : 0,
        exam_date: exam.exam_date,
        rank_in_division: divisionRank || 0,
        rank_overall: overallRank || 0,
        is_present: studentMark?.is_present || false
      };
    }));

    const validTrends = trends.filter(t => t.is_present);
    const averagePerformance = validTrends.length > 0
      ? validTrends.reduce((sum, trend) => sum + trend.percentage, 0) / validTrends.length
      : 0;

    res.status(200).json({
      success: true,
      data: {
        student_id: studentId,
        subject: {
          name: subject.name,
          code: subject.code,
          credits: subject.credits,
          teacher: subject.teacher.name
        },
        exam_type,
        trends,
        average_performance: Math.round(averagePerformance * 100) / 100,
        total_exams: exams.length,
        exams_attempted: validTrends.length
      }
    });
  }
);

export const getleaderboardDivisionWise = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const parseResult = leaderboardSchema.safeParse(req.query);
    if (!parseResult.success) {
      return next(new AppError("Invalid query parameters", 400));
    }
    const { semester_id, subject_id, exam_type, exam_name } = parseResult.data;
    const studentId = req.user!.id;

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { division: { include: { center: true, school: true, batch: true } } }
    });
    if (!student) return next(new AppError("Student not found", 404));

    const exam = await prisma.exam.findFirst({
      where: { subject_id, exam_type, name: exam_name },
      include: { subject: true }
    });
    if (!exam) return next(new AppError("Exam not found", 404));

    const leaderboardData = await prisma.studentExamMarks.findMany({
      where: {
        exam_id: exam.id,
        student: { division_id: student.division_id }
      },
      include: { student: { include: { division: true } } },
      orderBy: [{ marks_obtained: "desc" }]
    });

    const leaderboard = leaderboardData.map((entry, index) => ({
      rank: index + 1,
      student_id: entry.student.id,
      student_name: entry.student.name,
      enrollment_id: entry.student.enrollment_id,
      division_code: entry.student.division.code,
      marks_obtained: entry.marks_obtained,
      percentage: Math.round((entry.marks_obtained / exam.full_marks) * 100 * 100) / 100,
      is_current_user: entry.student.id === studentId,
      is_present: entry.is_present
    }));

    const currentStudentRank = leaderboard.find(entry => entry.is_current_user)?.rank || 0;

    res.status(200).json({
      success: true,
      data: {
        exam_details: {
          subject_name: exam.subject.name,
          exam_type: exam.exam_type,
          exam_name: exam.name,
          full_marks: exam.full_marks,
          exam_date: exam.exam_date
        },
        division_info: {
          division_code: student.division.code,
          center_name: student.division.center.name,
          total_students: leaderboard.length
        },
        current_student_rank: currentStudentRank,
        leaderboard
      }
    });
  }
);

export const getOverallLeaderboard = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const parseResult = leaderboardSchema.safeParse(req.query);
    if (!parseResult.success) {
      return next(new AppError("Invalid query parameters", 400));
    }
    const { semester_id, subject_id, exam_type, exam_name } = parseResult.data;
    const studentId = req.user!.id;

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { division: { include: { center: true, school: true, batch: true } } }
    });
    if (!student) return next(new AppError("Student not found", 404));

    const exam = await prisma.exam.findFirst({
      where: { subject_id, exam_type, name: exam_name },
      include: { subject: true }
    });
    if (!exam) return next(new AppError("Exam not found", 404));

    const leaderboardData = await prisma.studentExamMarks.findMany({
      where: {
        exam_id: exam.id,
        student: {
          school_id: student.school_id,
          batch_id: student.batch_id,
          division: { code: student.division.code }
        }
      },
      include: { student: { include: { division: true, center: true } } },
      orderBy: [{ marks_obtained: "desc" }]
    });

    const leaderboard = leaderboardData.map((entry, index) => ({
      rank: index + 1,
      student_id: entry.student.id,
      student_name: entry.student.name,
      enrollment_id: entry.student.enrollment_id,
      center_code: entry.student.center.code,
      center_name: entry.student.center.name,
      division_code: entry.student.division.code,
      marks_obtained: entry.marks_obtained,
      percentage: Math.round((entry.marks_obtained / exam.full_marks) * 100 * 100) / 100,
      is_current_user: entry.student.id === studentId,
      is_present: entry.is_present
    }));

    const currentStudentRank = leaderboard.find(entry => entry.is_current_user)?.rank || 0;

    res.status(200).json({
      success: true,
      data: {
        exam_details: {
          subject_name: exam.subject.name,
          exam_type: exam.exam_type,
          exam_name: exam.name,
          full_marks: exam.full_marks,
          exam_date: exam.exam_date
        },
        filter_criteria: {
          school: student.division.school.name,
          batch: student.division.batch.name,
          division_type: student.division.code,
          total_students_across_centers: leaderboard.length
        },
        current_student_rank: currentStudentRank,
        leaderboard
      }
    });
  }
);

export const getCurrentSemesterDetails = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const studentId = req.user!.id;
    const today = new Date();

    // First, get the student's division to find relevant semesters
    const studentInfo = await prisma.student.findUnique({
      where: { id: studentId },
      select: { division_id: true }
    });

    if (!studentInfo) {
      return next(new AppError("Student not found", 404));
    }

    // Find the semester that is currently running based on today's date
    const currentSemester = await prisma.semester.findFirst({
      where: {
        division_id: studentInfo.division_id,
        start_date: { lte: today }, // Semester has started
        end_date: { gte: today }    // Semester has not ended yet
      },
      include: {
        subjects: {
          include: {
            teacher: true,
            examMarks: { where: { student_id: studentId } },
            exams: {
              include: { marks: { where: { student_id: studentId } } }
            }
          }
        }
      }
    });

    if (!currentSemester) {
      return next(new AppError("No currently running semester found for the student", 404));
    }

    const subjects = currentSemester.subjects.map(subject => {
      const studentExamMarks = subject.examMarks;
      const totalExams = subject.exams.length;
      const examsAttempted = subject.exams.filter(exam =>
        exam.marks.some(mark => mark.student_id === studentId && mark.is_present)
      ).length;

      const validMarks = studentExamMarks.filter(mark => mark.is_present);
      const averageMarks = validMarks.length
        ? validMarks.reduce((sum, mark) => sum + mark.marks_obtained, 0) / validMarks.length
        : 0;

      const totalPossibleMarks = subject.exams.reduce((sum, exam) => {
        const studentMark = exam.marks.find(mark => mark.student_id === studentId && mark.is_present);
        return studentMark ? sum + exam.full_marks : sum;
      }, 0);

      const totalObtainedMarks = validMarks.reduce((sum, mark) => sum + mark.marks_obtained, 0);

      const averagePercentage = totalPossibleMarks
        ? (totalObtainedMarks / totalPossibleMarks) * 100
        : 0;

      return {
        subject_id: subject.id,
        subject_name: subject.name,
        subject_code: subject.code,
        credits: subject.credits,
        teacher_name: subject.teacher.name,
        teacher_email: subject.teacher.email,
        current_performance: {
          total_exams: totalExams,
          exams_attempted: examsAttempted,
          average_marks: Math.round(averageMarks * 100) / 100,
          average_percentage: Math.round(averagePercentage * 100) / 100
        }
      };
    });

    const totalCredits = subjects.reduce((sum, s) => sum + s.credits, 0);
    const overallAverage = subjects.length
      ? subjects.reduce((sum, s) => sum + s.current_performance.average_percentage, 0) / subjects.length
      : 0;

    res.status(200).json({
      success: true,
      data: {
        semester_info: {
          semester_id: currentSemester.id,
          semester_number: currentSemester.number,
          start_date: currentSemester.start_date,
          end_date: currentSemester.end_date,
          total_credits: totalCredits,
          overall_average: Math.round(overallAverage * 100) / 100,
        },
        subjects
      }
    });
  }
);
export const getPastSemestersDetails = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const studentId = req.user!.id;
    const today = new Date();

    // First, get the student's division to find relevant semesters
    const studentInfo = await prisma.student.findUnique({
      where: { id: studentId },
      select: { division_id: true }
    });

    if (!studentInfo) {
      return next(new AppError("Student not found", 404));
    }

    // Find all semesters that have already ended
    const pastSemesters = await prisma.semester.findMany({
      where: {
        division_id: studentInfo.division_id,
        end_date: {
          not: null,
          lt: today // Find semesters where the end date is less than today
        }
      },
      include: {
        subjects: {
          include: {
            teacher: true,
            examMarks: { where: { student_id: studentId } },
            exams: { include: { marks: { where: { student_id: studentId } } } }
          }
        }
      },
      orderBy: { number: "asc" }
    });

    const pastSemestersData = pastSemesters.map(semester => {
      const subjects = semester.subjects.map(subject => {
        let totalWeightedMarks = 0;
        let totalWeightage = 0;

        subject.exams.forEach(exam => {
          const studentMark = exam.marks.find(mark => mark.student_id === studentId && mark.is_present);
          if (studentMark) {
            const percentage = (studentMark.marks_obtained / exam.full_marks) * 100;
            totalWeightedMarks += percentage * exam.weightage;
            totalWeightage += exam.weightage;
          }
        });

        const finalPercentage = totalWeightage ? totalWeightedMarks / totalWeightage : 0;

        return {
          subject_id: subject.id,
          subject_name: subject.name,
          subject_code: subject.code,
          credits: subject.credits,
          // NOTE: final_grade was the same as final_percentage, removed for clarity.
          final_percentage: Math.round(finalPercentage * 100) / 100,
          teacher_name: subject.teacher.name
        };
      });

      const totalCredits = subjects.reduce((sum, s) => sum + s.credits, 0);
      const weightedGPA = subjects.reduce((sum, s) => sum + (s.final_percentage * s.credits), 0);
      const semesterGPA = totalCredits ? weightedGPA / totalCredits : 0;

      return {
        semester_id: semester.id,
        semester_number: semester.number,
        start_date: semester.start_date,
        end_date: semester.end_date,
        subjects,
        semester_gpa: Math.round(semesterGPA * 100) / 100,
        total_credits: totalCredits
      };
    });

    const totalCompletedCredits = pastSemestersData.reduce((sum, sem) => sum + sem.total_credits, 0);
    const overallWeightedGPA = pastSemestersData.reduce((sum, sem) => sum + (sem.semester_gpa * sem.total_credits), 0);
    const overallGPA = totalCompletedCredits ? overallWeightedGPA / totalCompletedCredits : 0;

    res.status(200).json({
      success: true,
      data: {
        overall_summary: {
          total_completed_semesters: pastSemestersData.length,
          total_completed_credits: totalCompletedCredits,
          overall_gpa: Math.round(overallGPA * 100) / 100
        },
        past_semesters: pastSemestersData
      }
    });
  }
);