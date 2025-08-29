import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";

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
  end_date: Date | null;
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

// Helper type for building hierarchy with maps
interface SchoolWithMaps extends SchoolDetail {
  _batchesMap: Map<string, BatchWithMaps>;
}

interface BatchWithMaps extends BatchDetail {
  _divisionsMap: Map<string, DivisionWithMaps>;
}

interface DivisionWithMaps extends DivisionDetail {
  _semestersMap: Map<string, SemesterDetail>;
}

// ==================== CONTROLLER ====================

export const getTeacherHierarchy = catchAsync(async (req: Request, res: Response) => {
  const { id: teacherId } = req.user!;

  if (!teacherId) {
    throw new AppError("Teacher ID not found in token", 400);
  }

  // 1. Get teacher details
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { 
      id: true, 
      name: true, 
      email: true, 
      designation: true 
    },
  });

  if (!teacher) {
    throw new AppError("Teacher not found", 404);
  }

  // 2. Fetch all subjects with the complete hierarchy using nested includes
  const subjectsTaught = await prisma.subject.findMany({
    where: { teacher_id: teacherId },
    include: {
      semester: {
        include: {
          division: {
            include: {
              batch: {
                include: {
                  school: true,
                },
              },
              students: {
                where: { is_active: true },
                select: { id: true },
              },
            },
          },
        },
      },
      exams: {
        orderBy: [
          { exam_type: "asc" }, 
          { exam_date: "desc" }
        ],
        select: {
          id: true,
          name: true,
          exam_type: true,
          exam_date: true,
          weightage: true,
          full_marks: true,
          passing_marks: true,
          createdAt: true,
        },
      },
    },
    orderBy: [
      { semester: { division: { batch: { school: { name: "asc" } } } } },
      { semester: { division: { batch: { name: "asc" } } } },
      { semester: { division: { code: "asc" } } },
      { semester: { number: "asc" } },
      { name: "asc" },
    ],
  });

  // 3. Process the flat list into a nested hierarchy
  const schoolsMap = new Map<string, SchoolWithMaps>();
  
  let totalExams = 0;
  const examTypeBreakdown: { [key: string]: number } = {};

  for (const subject of subjectsTaught) {
    // Validate hierarchy data exists
    if (!subject.semester?.division?.batch?.school) {
      console.warn(`Skipping subject ${subject.id} due to incomplete hierarchy data.`);
      continue;
    }

    const { school, batch, division, semester } = {
      school: subject.semester.division.batch.school,
      batch: subject.semester.division.batch,
      division: subject.semester.division,
      semester: subject.semester
    };

    // --- Update Global Summary ---
    subject.exams.forEach((exam) => {
      totalExams++;
      examTypeBreakdown[exam.exam_type] = (examTypeBreakdown[exam.exam_type] || 0) + 1;
    });

    // --- Build Hierarchy (School -> Batch -> Division -> Semester -> Subject) ---

    // Find or create School
    if (!schoolsMap.has(school.id)) {
      schoolsMap.set(school.id, {
        id: school.id,
        name: school.name,
        code:  school.name, // Use code if available, fallback to name
        batches: [],
        total_batches: 0,
        _batchesMap: new Map(),
      });
    }
    const schoolDetail = schoolsMap.get(school.id)!;

    // Find or create Batch
    if (!schoolDetail._batchesMap.has(batch.id)) {
      // Parse start and end year from batch name (e.g., "2020-2024")
      const yearMatch = batch.name.match(/(\d{4})-(\d{4})/);
      const startYear = yearMatch ? parseInt(yearMatch[1]!) : new Date().getFullYear();
      const endYear = yearMatch ? parseInt(yearMatch[2]!) : new Date().getFullYear() + 4;
      
      // Determine if batch is active (current date is within batch period)
      const currentYear = new Date().getFullYear();
      const isActive = currentYear >= startYear && currentYear <= endYear;

      schoolDetail._batchesMap.set(batch.id, {
        id: batch.id,
        name: batch.name,
        start_year: startYear,
        end_year: endYear,
        is_active: isActive,
        divisions: [],
        total_divisions: 0,
        _divisionsMap: new Map(),
      });
    }
    const batchDetail = schoolDetail._batchesMap.get(batch.id)!;

    // Find or create Division
    if (!batchDetail._divisionsMap.has(division.id)) {
      batchDetail._divisionsMap.set(division.id, {
        id: division.id,
        code: division.code,
        total_students: division.students.length,
        semesters: [],
        total_semesters: 0,
        _semestersMap: new Map(),
      });
    }
    const divisionDetail = batchDetail._divisionsMap.get(division.id)!;

    // Find or create Semester
    if (!divisionDetail._semestersMap.has(semester.id)) {
      // Determine if semester is current
      const currentDate = new Date();
      const isCurrent = semester.end_date 
        ? currentDate >= semester.start_date && currentDate <= semester.end_date 
        : currentDate >= semester.start_date;

      divisionDetail._semestersMap.set(semester.id, {
        id: semester.id,
        number: semester.number,
        start_date: semester.start_date,
        end_date: semester.end_date,
        is_current: isCurrent,
        subjects: [],
        total_subjects: 0,
      });
    }
    const semesterDetail = divisionDetail._semestersMap.get(semester.id)!;

    // --- Process and add Subject ---
    // Group exams by type
    const examsByType = new Map<string, ExamDetail[]>();
    subject.exams.forEach((exam) => {
      if (!examsByType.has(exam.exam_type)) {
        examsByType.set(exam.exam_type, []);
      }
      examsByType.get(exam.exam_type)!.push(exam);
    });

    // Create subject detail with grouped exams
    const subjectDetail: SubjectDetail = {
      id: subject.id,
      name: subject.name,
      code: subject.code,
      credits: subject.credits,
      exam_types: Array.from(examsByType.entries()).map(([type, exams]) => ({
        exam_type: type,
        exams: exams.sort((a, b) => b.exam_date.getTime() - a.exam_date.getTime()), // Sort by date desc
        total_exams: exams.length,
      })),
      total_exam_types: examsByType.size,
      total_exams: subject.exams.length,
    };

    semesterDetail.subjects.push(subjectDetail);
    semesterDetail.total_subjects++;
  }

  // 4. Final Transformation: Convert maps to arrays and clean up temporary properties
  const finalSchools: SchoolDetail[] = Array.from(schoolsMap.values()).map(school => {
    // Convert batches map to array
    school.batches = Array.from(school._batchesMap.values()).map(batch => {
      // Convert divisions map to array
      batch.divisions = Array.from(batch._divisionsMap.values()).map(division => {
        // Convert semesters map to array and sort by semester number
        division.semesters = Array.from(division._semestersMap.values())
          .sort((a, b) => a.number - b.number);
        division.total_semesters = division.semesters.length;
        
        // Remove the temporary map property
        const { _semestersMap, ...cleanDivision } = division as any;
        return cleanDivision;
      }).sort((a, b) => a.code.localeCompare(b.code)); // Sort divisions by code
      
      batch.total_divisions = batch.divisions.length;
      
      // Remove the temporary map property
      const { _divisionsMap, ...cleanBatch } = batch as any;
      return cleanBatch;
    }).sort((a, b) => b.start_year - a.start_year); // Sort batches by start year (newest first)
    
    school.total_batches = school.batches.length;
    
    // Remove the temporary map property
    const { _batchesMap, ...cleanSchool } = school as any;
    return cleanSchool;
  }).sort((a, b) => a.name.localeCompare(b.name)); // Sort schools alphabetically

  // 5. Calculate summary statistics
  const summary = {
    total_schools: finalSchools.length,
    total_batches: finalSchools.reduce((sum, school) => sum + school.total_batches, 0),
    total_divisions: finalSchools.reduce((sum, school) => 
      sum + school.batches.reduce((bSum, batch) => bSum + batch.total_divisions, 0), 0),
    total_semesters: finalSchools.reduce((sum, school) => 
      sum + school.batches.reduce((bSum, batch) => 
        bSum + batch.divisions.reduce((dSum, division) => dSum + division.total_semesters, 0), 0), 0),
    total_subjects: subjectsTaught.length,
    total_exams: totalExams, // Fixed: using totalExams instead of total_exams
    exam_type_breakdown: examTypeBreakdown,
  };

  // 6. Construct final response
  const response: TeacherHierarchyResponse = {
    success: true,
    teacher: {
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
      designation: teacher.designation || "Teacher",
    },
    schools: finalSchools,
    summary,
  };

  res.status(200).json(response);
});