import { prisma } from '../db/prisma.js';
import type { Request, Response } from 'express';
import xlsx from 'xlsx';
import { AppError } from '../utils/AppError.js';

interface ExamMarkRow {
  enrollment_id: string | number;
  marks_obtained: number;
  is_present?: boolean | string;
  remarks?: string;
}

export const uploadExamMarks = async (req: Request, res: Response) => {
  const { examId } = req.params;
  const teacherId = req.user!.id;
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
    if (exam.subject.teacher_id !== teacherId) {
      return res.status(403).json({ success: false, message: 'You are not authorized to upload marks for this exam.' });
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
        graded_by: teacherId,
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