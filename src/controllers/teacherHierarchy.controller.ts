import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";

// ==================== TYPES ====================

interface ExamDetail {
  id: string;
  name: string;
  exam_type: string;
  exam_date: Date;
  weightage: number;
  full_marks: number;
  passing_marks: number;
  createdAt: Date;
}

interface ExamsByType {
  exam_type: string;
  exams: ExamDetail[];
  total_exams: number;
}

interface SubjectDetail {
  id: string;
  name: string;
  code: string;
  credits: number;
  exam_types: ExamsByType[];
  total_exam_types: number;
  total_exams: number;
}

interface SemesterDetail {
  id: string;
  number: number;
  start_date: Date;
  end_date: Date;
  is_current: boolean;
  subjects: SubjectDetail[];
  total_subjects: number;
}

interface DivisionDetail {
  id: string;
  code: string;
  total_students: number;
  semesters: SemesterDetail[];
  total_semesters: number;
}

interface BatchDetail {
  id: string;
  name: string;
  start_year: number;
  end_year: number;
  is_active: boolean;
  divisions: DivisionDetail[];
  total_divisions: number;
}

interface SchoolDetail {
  id: string;
  name: string;
  code: string;
  batches: BatchDetail[];
  total_batches: number;
}

interface TeacherHierarchyResponse {
  success: boolean;
  teacher: {
    id: string;
    name: string;
    email: string;
    designation: string;
  };
  schools: SchoolDetail[];
  summary: {
    total_schools: number;
    total_batches: number;
    total_divisions: number;
    total_semesters: number;
    total_subjects: number;
    total_exams: number;
    exam_type_breakdown: {
      [key: string]: number;
    };
  };
}

// ==================== CONTROLLER ====================

/**
 * @desc    Get complete teaching hierarchy for logged-in teacher
 * @route   GET /api/teachers/teaching-hierarchy
 * @access  Private (Teacher, Assistant Teacher)
 */
export const getTeacherHierarchy = catchAsync(async (req: Request, res: Response) => {
  const { id: teacherId } = req.user!;

  if (!teacherId) {
    throw new AppError("Teacher ID not found in token", 400);
  }

  // Get teacher details
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: {
      id: true,
      name: true,
      email: true,
      designation: true
    }
  });

  if (!teacher) {
    throw new AppError("Teacher not found", 404);
  }

  // Get all subjects taught by the teacher with complete hierarchy
  const subjects = await prisma.subject.findMany({
    where: {
      teacher_id: teacherId
    },
    include: {
      semester: {
        include: {
          division: {
            include: {
              batch: {
                include: {
                  school: {
                    select: {
                      id: true,
                      name: true,
                    }
                  }
                }
              },
              students: {
                where: { is_active: true },
                select: { id: true }
              }
            }
          }
        }
      },
      exams: {
        select: {
          id: true,
          name: true,
          exam_type: true,
          exam_date: true,
          weightage: true,
          full_marks: true,
          passing_marks: true,
          createdAt: true
        },
        orderBy: [
          { exam_type: 'asc' },
          { exam_date: 'desc' }
        ]
      }
    },
    orderBy: [
      { semester: { division: { batch: { school: { name: 'asc' } } } } },
      { semester: { division: { batch: { name: 'asc' } } } },
      { semester: { division: { code: 'asc' } } },
      { semester: { number: 'asc' } },
      { name: 'asc' }
    ]
  });

  // Group data by hierarchy
  const schoolsMap = new Map<string, any>();
  const batchesMap = new Map<string, any>();
  const divisionsMap = new Map<string, any>();
  const semestersMap = new Map<string, any>();

  let totalExams = 0;
  const examTypeBreakdown: { [key: string]: number } = {};

  // Process each subject and build hierarchy
  subjects.forEach(subject => {
    const school = subject.semester.division!.batch.school;
    const batch = subject.semester.division!.batch;
    const division = subject.semester.division;
    const semester = subject.semester;

    // Count exams and types
    subject.exams.forEach(exam => {
      totalExams++;
      examTypeBreakdown[exam.exam_type] = (examTypeBreakdown[exam.exam_type] || 0) + 1;
    });

    // Group exams by type for this subject
    const examsByType = new Map<string, ExamDetail[]>();
    subject.exams.forEach(exam => {
      if (!examsByType.has(exam.exam_type)) {
        examsByType.set(exam.exam_type, []);
      }
      examsByType.get(exam.exam_type)!.push({
        id: exam.id,
        name: exam.name,
        exam_type: exam.exam_type,
        exam_date: exam.exam_date,
        weightage: exam.weightage,
        full_marks: exam.full_marks,
        passing_marks: exam.passing_marks,
        createdAt: exam.createdAt
      });
    });

    // Build subject detail
    const subjectDetail: SubjectDetail = {
      id: subject.id,
      name: subject.name,
      code: subject.code,
      credits: subject.credits,
      exam_types: Array.from(examsByType.entries()).map(([type, exams]) => ({
        exam_type: type,
        exams: exams,
        total_exams: exams.length
      })),
      total_exam_types: examsByType.size,
      total_exams: subject.exams.length
    };

    // Initialize or update semester
    if (!semestersMap.has(semester.id)) {
      semestersMap.set(semester.id, {
        id: semester.id,
        number: semester.number,
        start_date: semester.start_date,
        end_date: semester.end_date,
        is_current: new Date() >= semester.start_date && new Date() <= semester.end_date!,
        subjects: [],
        total_subjects: 0
      });
    }
    semestersMap.get(semester.id).subjects.push(subjectDetail);
    semestersMap.get(semester.id).total_subjects++;

    // Initialize or update division
    if (!divisionsMap.has(division!.id)) {
      divisionsMap.set(division!.id, {
        id: division!.id,
        code: division!.code,
        total_students: division!.students.length,
        semesters: [],
        total_semesters: 0
      });
    }

    // Initialize or update batch
    if (!batchesMap.has(batch.id)) {
      batchesMap.set(batch.id, {
        id: batch.id,
        name: batch.name,
        divisions: [],
        total_divisions: 0
      });
    }

    // Initialize or update school
    if (!schoolsMap.has(school.id)) {
      schoolsMap.set(school.id, {
        id: school.id,
        name: school.name,
        batches: [],
        total_batches: 0
      });
    }
  });

  // Build nested structure
  const divisionsArray = Array.from(divisionsMap.values());
  divisionsArray.forEach(division => {
    division.semesters = Array.from(semestersMap.values())
      .filter(semester => subjects.some(s => s.semester.division_id === division.id && s.semester.id === semester.id))
      .sort((a, b) => a.number - b.number);
    division.total_semesters = division.semesters.length;
  });

  const batchesArray = Array.from(batchesMap.values());
  batchesArray.forEach(batch => {
    batch.divisions = divisionsArray
      .filter(division => subjects.some(s => s.semester.division!.batch_id === batch.id && s.semester.division_id === division.id))
      .sort((a, b) => a.code.localeCompare(b.code));
    batch.total_divisions = batch.divisions.length;
  });

  const schoolsArray = Array.from(schoolsMap.values());
  schoolsArray.forEach(school => {
    school.batches = batchesArray
      .filter(batch => subjects.some(s => s.semester.division!.batch.school_id === school.id && s.semester.division!.batch_id === batch.id))
      .sort((a, b) => b.start_year - a.start_year); // Latest first
    school.total_batches = school.batches.length;
  });

  // Calculate summary
  const summary = {
    total_schools: schoolsArray.length,
    total_batches: batchesArray.length,
    total_divisions: divisionsArray.length,
    total_semesters: semestersMap.size,
    total_subjects: subjects.length,
    total_exams: totalExams,
    exam_type_breakdown: examTypeBreakdown
  };

  const response: TeacherHierarchyResponse = {
    success: true,
    teacher: {
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
      designation: teacher.designation || "Teacher"
    },
    schools: schoolsArray.sort((a, b) => a.name.localeCompare(b.name)),
    summary
  };

  res.status(200).json(response);
});
