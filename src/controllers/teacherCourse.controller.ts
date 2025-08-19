import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";
import { ExamType } from "@prisma/client";

interface ActiveSubjectDetails {
  subjectName: string;
  batchName: string;
  divisionCode: string;
  semester: number;
  totalStudents: number;
}

export const getTeacherActiveSubjects = catchAsync(async (req: Request, res: Response) => {
  const { sub: teacherId } = req.user!;

  if (!teacherId) {
    throw new AppError("Teacher ID not found", 400);
  }
    const now = new Date();

  const subjects = await prisma.subject.findMany({
    where: {
      teacher_id: teacherId,
      semester: {
        start_date: { lte: now },
        end_date: { gte: now },
        division: {
          start_date: { lte: now },
          end_date: { gte: now }
        }
      }
    },
    select: {
      name: true,
      semester: {
        select: {
          number: true,
          division: {
            select: {
              code: true,
              batch: {
                select: {
                  name: true
                }
              },
              students: {
                where: {
                  is_active: true
                },
                select: {
                  id: true
                }
              }
            }
          }
        }
      }
    },
    orderBy: {
      name: "asc"
    }
  });

  
  
  const subjectsDetails: ActiveSubjectDetails[] = subjects.map(subject => ({
    subjectName: subject.name,
    batchName: subject.semester!.division!.batch.name,
    divisionCode: subject.semester!.division!.code,
    semester: subject.semester.number,
    totalStudents: subject.semester!.division!.students.length
  }));

  res.status(200).json({
    success: true,
    count: subjectsDetails.length,
    data: subjectsDetails
  });
});

export const getExamsAndPassStatsByType = catchAsync(async (req: Request, res: Response) => {
  const { subjectId } = req.params;
  const { examType } = req.query;

  if (!subjectId) {
    throw new AppError("subjectId is required", 400);
  }

  if (!examType || typeof examType !== "string" || !Object.values(ExamType).includes(examType as ExamType)) {
    throw new AppError("A valid examType query parameter is required", 400);
  }

  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { 
        id: true, 
        name: true, 
        code: true,
        semester: {
            select: {
                division_id: true
            }
        }
    }
  });

  if (!subject || !subject.semester?.division_id) {
    throw new AppError("Subject not found or is not linked to a division", 404);
  }

  const totalStudentsInDivision = await prisma.student.count({
    where: {
      division_id: subject.semester.division_id,
      is_active: true
    }
  });

  const examsWithStats = await prisma.exam.findMany({
    where: {
      subject_id: subjectId,
      exam_type: examType as ExamType
    },
    orderBy: { exam_date: 'asc' },
    select: {
      id: true,
      name: true,
      exam_date: true,
      full_marks: true,
      passing_marks: true,
      exam_type: true,
      marks: {
        select: {
          marks_obtained: true,
        }
      }
    }
  });

  const examStats = examsWithStats.map(exam => {
    const presentStudentsMarks = exam.marks.filter(m => m.marks_obtained !== null).map(m => m.marks_obtained as number);
    const totalPresent = presentStudentsMarks.length;
    const totalPassed = presentStudentsMarks.filter(mark => mark >= exam.passing_marks).length;
    
    const totalMarksSum = presentStudentsMarks.reduce((sum, mark) => sum + mark, 0);
    const averageMarks = totalPresent > 0 ? parseFloat((totalMarksSum / totalPresent).toFixed(2)) : 0;

    const attendancePercentage = totalStudentsInDivision > 0 
      ? Math.round((totalPresent / totalStudentsInDivision) * 100) 
      : 0;

    return {
      examId: exam.id,
      examName: exam.name,
      examDate: exam.exam_date,
      examType: exam.exam_type,
      fullMarks: exam.full_marks,
      passingMarks: exam.passing_marks,
      totalPresent,
      totalPassed,
      attendancePercentage,
      averageMarks
    };
  });

  const overallAverageMarks = examStats.length > 0 
    ? parseFloat((examStats.reduce((sum, exam) => sum + exam.averageMarks, 0) / examStats.length).toFixed(2))
    : 0;

  res.status(200).json({
    success: true,
    subject: { id: subject.id, name: subject.name, code: subject.code },
    examType: examType,
    totalExams: examStats.length,
    overallAverageMarks: overallAverageMarks,
    data: examStats
  });
});



export const getExamStudentResults = catchAsync(async (req: Request, res: Response) => {
  const { examId } = req.params;
  const { sortBy = "rank" } = req.query; // Default to 'rank'

  if (!examId) {
    throw new AppError("examId is required", 400);
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      name: true,
      exam_type: true,
      exam_date: true,
      full_marks: true,
      passing_marks: true,
      subject: {
        select: {
          id: true,
          name: true,
          code: true,
          semester: {
            select: {
              division_id: true
            }
          }
        }
      }
    }
  });

  if (!exam || !exam.subject.semester?.division_id) {
    throw new AppError("Exam not found or is not linked to a division", 404);
  }

  const allStudentsInDivision = await prisma.student.findMany({
    where: {
      division_id: exam.subject.semester.division_id,
      is_active: true
    },
    select: {
      id: true,
      enrollment_id: true,
      name: true
    }
  });

  const examMarks = await prisma.studentExamMarks.findMany({
    where: { exam_id: examId },
    select: {
      student_id: true,
      marks_obtained: true,
    }
  });

  const marksMap = new Map(examMarks.map(mark => [mark.student_id, mark.marks_obtained]));

  let studentsWithMarks = allStudentsInDivision.map(student => {
    const marks = marksMap.get(student.id);
    const isPresent = marks !== undefined;
    const marksObtained = isPresent ? marks : null;
    
    return {
      enrollmentId: student.enrollment_id,
      name: student.name,
      status: isPresent ? "PRESENT" : "ABSENT",
      marksObtained: marksObtained,
      isPassed: isPresent && marks! >= exam.passing_marks
    };
  });

  if (sortBy === 'rank') {
    studentsWithMarks.sort((a, b) => {
      if (a.marksObtained === null && b.marksObtained === null) return a.name.localeCompare(b.name);
      if (a.marksObtained === null) return 1;
      if (b.marksObtained === null) return -1;
      if (b.marksObtained !== a.marksObtained) return b.marksObtained - a.marksObtained;
      return a.name.localeCompare(b.name);
    });

    let currentRank = 0;
    let lastMarks = -1;
    studentsWithMarks = studentsWithMarks.map((student, index) => {
      if (student.marksObtained === null) {
        return { ...student, rank: null };
      }
      if (student.marksObtained !== lastMarks) {
        currentRank = index + 1;
        lastMarks = student.marksObtained;
      }
      return { ...student, rank: currentRank };
    });
  } else {
    studentsWithMarks.sort((a, b) => a.name.localeCompare(b.name));
  }

  const presentStudents = studentsWithMarks.filter(s => s.status === "PRESENT");
  const passedStudents = presentStudents.filter(s => s.isPassed);
  const totalStudents = studentsWithMarks.length;

  res.status(200).json({
    success: true,
    exam: {
        id: exam.id,
        name: exam.name,
        type: exam.exam_type,
        exam_date: exam.exam_date,
        full_marks: exam.full_marks,
        passing_marks: exam.passing_marks,
        subject: exam.subject
    },
    summary: {
      totalStudents: totalStudents,
      presentStudents: presentStudents.length,
      absentStudents: totalStudents - presentStudents.length,
      passedStudents: passedStudents.length,
      failedStudents: presentStudents.length - passedStudents.length,
      attendancePercentage: totalStudents > 0 ? Math.round((presentStudents.length / totalStudents) * 100) : 0,
      passPercentage: presentStudents.length > 0 ? Math.round((passedStudents.length / presentStudents.length) * 100) : 0
    },
    students: studentsWithMarks
  });
});