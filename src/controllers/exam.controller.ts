import { prisma } from '../db/prisma.js';
import type { Request, Response } from 'express';
import xlsx from 'xlsx';
import { AppError } from '../utils/AppError.js';
import z from 'zod';
import { ExamType } from '@prisma/client';
import { catchAsync } from '../utils/catchAsync.js';

interface ExamMarkRow {
  enrollment_id: string | number;
  marks_obtained: number;
  is_present?: boolean | string;
  remarks?: string;
}

export const uploadExamMarks = async (req: Request, res: Response) => {
  const { examId } = req.params;
  const overwriteExisting = req.body.overwriteExisting === 'true';

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No Excel file provided.' });
  }
  if (!examId) {
    throw new AppError("Exam Id required", 400);
  }

  try {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        subject: {
          include: {
            semester: true,
          },
        },
      },
    });

    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
    }


    const eligibleStudents = await prisma.student.findMany({
      where: { division_id: exam.subject.semester.division_id },
      select: { id: true, enrollment_id: true },
    });

    const studentMap = new Map(eligibleStudents.map((s) => [s.enrollment_id, s.id]));

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new AppError("Excel file contains no sheets", 400);
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new AppError(`Sheet "${sheetName}" not found in the file.`, 400);

    const rows = xlsx.utils.sheet_to_json(sheet) as ExamMarkRow[];

    const summary = {
      totalRows: rows.length,
      successfullyProcessed: 0,
      skipped: 0,
      errors: 0,
    };
    const results = [];
    const dbOperations = [];

    for (const [i, row] of rows.entries()) {
      const rowIndex = i + 2;

      const enrollmentId = row.enrollment_id?.toString().trim();
      const marksObtained = parseFloat(String(row.marks_obtained));

      if (!enrollmentId || isNaN(marksObtained)) {
        summary.errors++;
        results.push({ row: rowIndex, enrollmentId, status: 'error', message: 'Missing or invalid enrollment_id or marks_obtained.' });
        continue;
      }

      const studentId = studentMap.get(enrollmentId);
      if (!studentId) {
        summary.errors++;
        results.push({ row: rowIndex, enrollmentId, status: 'error', message: "Student not found in this exam's subject/division." });
        continue;
      }

      const existingMark = await prisma.studentExamMarks.findUnique({
        where: { student_exam_unique: { student_id: studentId, exam_id: examId } },
      });

      if (existingMark && !overwriteExisting) {
        summary.skipped++;
        results.push({ row: rowIndex, enrollmentId, status: 'skipped', message: 'Marks already exist and overwrite is set to false.' });
        continue;
      }

      const data = {
        student_id: studentId,
        subject_id: exam.subject_id,
        exam_id: examId,
        marks_obtained: marksObtained,
        is_present: row.is_present === 'false' || row.is_present === false ? false : true,
        remarks: row.remarks?.toString() || null,
        graded_by: req.user!.id,
        graded_at: new Date(),
      };

      dbOperations.push(
        prisma.studentExamMarks.upsert({
          where: { student_exam_unique: { student_id: studentId, exam_id: examId } },
          update: data,
          create: data,
        })
      );
    }

    if (dbOperations.length > 0) {
      const transactionResults = await prisma.$transaction(dbOperations);
      summary.successfullyProcessed = transactionResults.length;

      transactionResults.forEach((mark) => {
        const student = eligibleStudents.find((s) => s.id === mark.student_id);
        if (student) {
          results.push({
            row: 'N/A',
            enrollmentId: student.enrollment_id,
            status: 'success',
            marksId: mark.id,
          });
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Excel file processed.',
      summary,
      results,
    });
  } catch (error) {
    console.error('Error uploading exam marks:', error);
    return res.status(500).json({ success: false, message: 'An unexpected error occurred during file processing.' });
  }
};

export const getAllExamByExamType = async (req: Request, res: Response) => {
  try {
    const { subjectId } = req.params;
    const { exam_type } = req.query as { exam_type?: string };
    if (!subjectId) {
      return res.status(400).json({
        success: false,
        message: 'Subject ID is required'
      });
    }

    if (!exam_type) {
      return res.status(400).json({
        success: false,
        message: 'Exam type is required in request body'
      });
    }

    const validExamTypes = ['END_SEM', 'PROJECT', 'FORTNIGHTLY', 'INTERNAL_ASSESSMENT', 'INTERVIEW'];
    if (!validExamTypes.includes(exam_type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid exam type. Valid types are: ${validExamTypes.join(', ')}`
      });
    }

    const subject = await prisma.subject.findUnique({
      where: { id: subjectId }
    });

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }

    const exams = await prisma.exam.findMany({
      where: {
        subject_id: subjectId,
        exam_type: exam_type as ExamType
      },
      select: {
        id: true,
        name: true
      },
      orderBy: {
        exam_date: 'asc'
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Exams fetched successfully',
      data: {
        exams,
        count: exams.length,
        subject: {
          id: subject.id,
          name: subject.name,
          code: subject.code
        },
        exam_type
      }
    });

  } catch (error) {
    console.error('Error fetching exams:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    });
  }
};

interface CreateExamBody {
  name: string;
  weightage: number;
  full_marks: number;
  passing_marks: number;
  exam_type: ExamType;
  exam_date: string;
  subject_id: string;
}

interface CreateExamResponse {
  success: boolean;
  message: string;
  data: {
    id: string;
    name: string;
    weightage: number;
    full_marks: number;
    passing_marks: number;
    exam_type: ExamType;
    exam_date: Date;
    subject_id: string;
    createdAt: Date;
    updatedAt: Date;
  };
}



const createExamSchema = z.object({
  name: z.string().min(1, "Exam name is required").max(100, "Exam name cannot exceed 100 characters"),
  weightage: z.number().positive("Weightage must be positive").max(100, "Weightage cannot exceed 100%"),
  full_marks: z.number().positive("Full marks must be positive").max(1000, "Full marks cannot exceed 1000"),
  passing_marks: z.number().nonnegative("Passing marks cannot be negative"),
  exam_type: z.nativeEnum(ExamType).refine(
    (val) => Object.values(ExamType).includes(val),
    {
      message: "Invalid exam type. Must be one of: END_SEM, PROJECT, FORTNIGHTLY, INTERNAL_ASSESSMENT, INTERVIEW"
    }
  ),
  exam_date: z.string().refine((date) => !isNaN(new Date(date).getTime()), "Invalid exam date format"),
  subject_id: z.string().min(1, "Subject ID is required")
});
export const createExam = catchAsync(async (req: Request, res: Response) => {
  const validation = createExamSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: validation.error.format()
    });
  }

  const { name, weightage, full_marks, passing_marks, exam_type, exam_date, subject_id } = validation.data;

  if (passing_marks > full_marks) {
    throw new AppError("Passing marks cannot exceed full marks", 400);
  }

  const subject = await prisma.subject.findUnique({
    where: { id: subject_id },
    include: {
      semester: {
        select: {
          number: true,
          division: {
            select: {
              code: true
            }
          }
        }
      }
    }
  });

  if (!subject) {
    throw new AppError("Subject not found", 404);
  }

  const existingExam = await prisma.exam.findFirst({
    where: {
      name: name.trim(),
      subject_id: subject_id
    }
  });

  if (existingExam) {
    throw new AppError("Exam with this name already exists for this subject", 409);
  }

  const examDateTime = new Date(exam_date);
  const currentDate = new Date();

  if (examDateTime < currentDate) {
    throw new AppError("Exam date cannot be in the past", 400);
  }

  const exam = await prisma.exam.create({
    data: {
      name: name.trim(),
      weightage,
      full_marks,
      passing_marks,
      exam_type: exam_type as ExamType,
      exam_date: examDateTime,
      subject_id
    }
  });

  const response: CreateExamResponse = {
    success: true,
    message: "Exam created successfully",
    data: exam
  };

  res.status(201).json(response);
});
interface UpdateExamResponse {
  success: boolean;
  message: string;
  data: {
    id: string;
    name: string;
    weightage: number;
    full_marks: number;
    passing_marks: number;
    exam_type: ExamType;
    exam_date: Date;
    subject_id: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

const updateExamSchema = z.object({
  name: z.string().min(1, "Exam name is required").max(100, "Exam name cannot exceed 100 characters").optional(),
  weightage: z.number().positive("Weightage must be positive").max(100, "Weightage cannot exceed 100%").optional(),
  full_marks: z.number().positive("Full marks must be positive").max(1000, "Full marks cannot exceed 1000").optional(),
  passing_marks: z.number().nonnegative("Passing marks cannot be negative").optional(),
  exam_type: z.nativeEnum(ExamType).refine(
    (val) => Object.values(ExamType).includes(val),
    {
      message: "Invalid exam type. Must be one of: END_SEM, PROJECT, FORTNIGHTLY, INTERNAL_ASSESSMENT, INTERVIEW"
    }
  ).optional(),
  exam_date: z.string().refine((date) => !isNaN(new Date(date).getTime()), "Invalid exam date format").optional(),
  subject_id: z.string().min(1, "Subject ID is required").optional()
});


export const updateExam = catchAsync(async (req: Request, res: Response) => {
  const { examId } = req.params;

  if (!examId) {
    throw new AppError("Exam ID is required", 400);
  }

  const validation = updateExamSchema.safeParse(req.body);


  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: validation.error.format()
    });
  }

  const updateData = validation.data;

  const existingExam = await prisma.exam.findUnique({
    where: { id: examId }
  });

  if (!existingExam) {
    throw new AppError("Exam not found", 404);
  }
  const currentFullMarks = updateData.full_marks || existingExam.full_marks;
  const currentPassingMarks = updateData.passing_marks !== undefined ? updateData.passing_marks : existingExam.passing_marks;

  if (currentPassingMarks > currentFullMarks) {
    throw new AppError("Passing marks cannot exceed full marks", 400);
  }

  if (updateData.subject_id && updateData.subject_id !== existingExam.subject_id) {
    const subject = await prisma.subject.findUnique({
      where: { id: updateData.subject_id }
    });

    if (!subject) {
      throw new AppError("Subject not found", 404);
    }
  }

  if (updateData.name && updateData.name !== existingExam.name) {
    const targetSubjectId = updateData.subject_id || existingExam.subject_id;

    const duplicateExam = await prisma.exam.findFirst({
      where: {
        name: updateData.name.trim(),
        subject_id: targetSubjectId,
        id: { not: examId } // Exclude current exam
      }
    });
    if (duplicateExam) {
      throw new AppError("Exam with this name already exists for this subject", 409);
    }
  }

  if (updateData.exam_date) {
    const examDateTime = new Date(updateData.exam_date);
    const currentDate = new Date();

    if (examDateTime < currentDate) {
      throw new AppError("Exam date cannot be in the past", 400);
    }

    updateData.exam_date = examDateTime as any;
  }

  if (updateData.name) {
    updateData.name = updateData.name.trim();
  }

  const updatedExam = await prisma.exam.update({
    where: { id: examId },
    data: {
      ...updateData,
      updatedAt: new Date()
    } as any
  });

  const response: UpdateExamResponse = {
    success: true,
    message: "Exam updated successfully",
    data: updatedExam
  };

  res.status(200).json(response);
})


export const deleteExam=catchAsync(async (req:Request,res:Response)=>{
  const {examId}=req.params;
  if(!examId){
    throw new AppError("Exam Id Requires",400)
  }
  const existingExam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      name: true,
      exam_type: true,
      exam_date: true
    }
  });

  if (!existingExam) {
    throw new AppError("Exam not found", 404);
  }

  const currentDate = new Date();
  const examDate = new Date(existingExam.exam_date);

  if (examDate < currentDate) {
    throw new AppError("Cannot delete exam. This exam is already over.", 409);
  }

  const deletedExam = await prisma.exam.delete({
    where: { id: examId }
  });
  const response = {
    success: true,
    message: "Exam deleted successfully",
    data: {
      id: deletedExam.id,
      name: deletedExam.name,
      exam_type: deletedExam.exam_type,
      exam_date: deletedExam.exam_date
    }
  };

  res.status(200).json(response);  
})

export const getAllExamsBySubject = catchAsync(async (req: Request, res: Response) => {
    const { subjectId } = req.params;

    if (!subjectId) {
        throw new AppError("Subject ID is required.", 400);
    }

    const subject = await prisma.subject.findUnique({
        where: { id: subjectId }
    });

    if (!subject) {
        throw new AppError("Subject not found.", 404);
    }

    const exams = await prisma.exam.findMany({
        where: {
            subject_id: subjectId,
        },
        orderBy: {
            exam_date: 'asc'
        }
    });

    return res.status(200).json({
        success: true,
        message: 'Exams fetched successfully',
        data: {
            subject: {
                id: subject.id,
                name: subject.name,
                code: subject.code
            },
            exams,
            count: exams.length,
        }
    });
});