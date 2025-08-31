import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import XLSX from "xlsx";
import { AppError } from "../utils/AppError.js";
import { AuthorRole } from "../types/postApi.js";
import type { UserRole } from "../auth/types.js";
import { Gender } from "@prisma/client";

const MAX_BATCH_SIZE = 1000;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const PRISMA_BATCH_SIZE = 100;



interface StudentInput {
  name: string;
  email: string;
  gender: Gender;
  phone: string;
  enrollment_id: string;
}

interface ValidationError {
  row: number;
  data: Omit<StudentInput, 'gender'> & { gender?: string };
  error: string;
  field?: string | undefined;
}

interface ProcessingResult {
  success: boolean;
  added_count: number;
  total_processed: number;
  validation_errors: number;
  duplicate_errors: number;
  errors: ValidationError[];
  students: PublicStudentData[];
}

interface PublicStudentData {
  id: string;
  name: string;
  email: string;
  gender: Gender;
  phone: string;
  enrollment_id: string;
  is_active: boolean;
  createdAt: Date;
}

interface DivisionDetails {
  center_id: string;
  school_id: string;
  batch_id: string;
  current_semester: string | null; 
}

interface ExistingConflict {
  index: number;
  student: StudentInput;
  conflictType: string | undefined;
  existingId?: string | undefined;
}


async function getDivisionDetails(divisionId: string): Promise<DivisionDetails> {
  const division = await prisma.division.findUnique({
    where: { id: divisionId },
    select: {
      center_id: true,
      school_id: true,
      batch_id: true,
      current_semester: true,
    },
  });

  if (!division) {
    throw new AppError("Division not found", 404);
  }

  if (!division.current_semester) {
    throw new AppError("Cannot add students: The division does not have a current semester assigned.", 400);
  }

  return {
    center_id: division.center_id,
    school_id: division.school_id,
    batch_id: division.batch_id,
    current_semester: division.current_semester,
  };
}



async function authorizeDivisionAccess(role: UserRole): Promise<void> {
  const allowedRoles: UserRole[] = [
    AuthorRole.SUPER_ADMIN,
    AuthorRole.ADMIN,
    AuthorRole.OPS,
    AuthorRole.BATCHOPS
  ];

  if (allowedRoles.includes(role)) {
    // If the user's role is in the allowed list, grant access immediately.
    return;
  }

  // For any other role, deny access.
  throw new AppError("Your role is not permitted to perform this action", 403);
}

function validateStudentData(student: any): { isValid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const sanitized: Omit<StudentInput, 'gender'> & { gender?: string } = {
    name: student.name,
    email: student.email,
    phone: student.phone,
    enrollment_id: student.enrollment_id,
    gender: student.gender
  };

  if (!student.name || typeof student.name !== "string" || student.name.trim().length === 0) {
    errors.push({ row: 0, data: sanitized, error: "Name is required", field: "name" });
  } else if (student.name.trim().length > 100) {
    errors.push({ row: 0, data: sanitized, error: "Name must be 100 characters or less", field: "name" });
  }

  if (!student.email || typeof student.email !== "string") {
    errors.push({ row: 0, data: sanitized, error: "Email is required", field: "email" });
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(student.email.trim().toLowerCase())) {
      errors.push({ row: 0, data: sanitized, error: "Invalid email format", field: "email" });
    }
  }

  if (!student.gender || !Object.values(Gender).includes(student.gender)) {
    errors.push({ row: 0, data: sanitized, error: "Gender must be either MALE or FEMALE", field: "gender" });
  }

  if (!student.phone || typeof student.phone !== "string") {
    errors.push({ row: 0, data: sanitized, error: "Phone is required", field: "phone" });
  } else {
    const phoneDigits = String(student.phone).replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      errors.push({ row: 0, data: sanitized, error: "Phone must be between 10 and 15 digits", field: "phone" });
    }
  }

  if (!student.enrollment_id || typeof student.enrollment_id !== "string" || student.enrollment_id.trim().length === 0) {
    errors.push({ row: 0, data: sanitized, error: "Enrollment ID is required", field: "enrollment_id" });
  } else if (student.enrollment_id.trim().length > 50) {
    errors.push({ row: 0, data: sanitized, error: "Enrollment ID must be 50 characters or less", field: "enrollment_id" });
  }

  return { isValid: errors.length === 0, errors };
}


async function checkDuplicates(students: StudentInput[]): Promise<{
  duplicateIndexes: Set<number>;
  existingConflicts: ExistingConflict[];
}> {
  const duplicateIndexes = new Set<number>();
  const existingConflicts: ExistingConflict[] = [];

  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  const seenEnrollmentIds = new Set<string>();

  students.forEach((student, index) => {
    const email = student.email.toLowerCase();
    const phone = student.phone;
    const enrollmentId = student.enrollment_id;

    if (seenEmails.has(email) || seenPhones.has(phone) || seenEnrollmentIds.has(enrollmentId)) {
      duplicateIndexes.add(index);
    }
    seenEmails.add(email);
    seenPhones.add(phone);
    seenEnrollmentIds.add(enrollmentId);
  });

  const emails = students.map(s => s.email.toLowerCase());
  const phones = students.map(s => s.phone);
  const enrollmentIds = students.map(s => s.enrollment_id);

  const existingStudents = await prisma.student.findMany({
    where: {
      OR: [
        { email: { in: emails } },
        { phone: { in: phones } },
        { enrollment_id: { in: enrollmentIds } },
      ],
    },
    select: { id: true, email: true, phone: true, enrollment_id: true },
  });

  const existingEmailMap = new Map(existingStudents.map(s => [s.email.toLowerCase(), s.id]));
  const existingPhoneMap = new Map(existingStudents.map(s => [s.phone, s.id]));
  const existingEnrollmentMap = new Map(existingStudents.map(s => [s.enrollment_id, s.id]));

  students.forEach((student, index) => {
    const email = student.email.toLowerCase();
    const conflictId = existingEmailMap.get(email) || existingPhoneMap.get(student.phone) || existingEnrollmentMap.get(student.enrollment_id);

    if (conflictId) {
      const conflictType = existingEmailMap.has(email) ? 'email' : existingPhoneMap.has(student.phone) ? 'phone' : 'enrollment_id';
      existingConflicts.push({
        index,
        student,
        conflictType,
        existingId: conflictId,
      });
    }
  });

  return { duplicateIndexes, existingConflicts };
}


function sanitizeStudentData(student: any): PublicStudentData {
  return {
    id: student.id,
    name: student.name,
    email: student.email,
    gender: student.gender,
    phone: student.phone,
    enrollment_id: student.enrollment_id,
    is_active: student.is_active,
    createdAt: student.createdAt
  };
}


async function bulkInsertStudents(
  studentsToCreate: StudentInput[],
  divisionId: string,
  divisionDetails: DivisionDetails
): Promise<PublicStudentData[]> {
  const allCreatedStudents: PublicStudentData[] = [];
  const semesterId = divisionDetails.current_semester!;

  try {
    for (let i = 0; i < studentsToCreate.length; i += PRISMA_BATCH_SIZE) {
      const batch = studentsToCreate.slice(i, i + PRISMA_BATCH_SIZE);

      const batchData = batch.map((student) => ({
        name: student.name.trim(),
        email: student.email.toLowerCase().trim(),
        gender: student.gender,
        phone: student.phone.trim(),
        enrollment_id: student.enrollment_id.trim(),
        division_id: divisionId,
        center_id: divisionDetails.center_id,
        school_id: divisionDetails.school_id,
        batch_id: divisionDetails.batch_id,
        semester_id: semesterId,
      }));

      const result = await prisma.student.createMany({
        data: batchData,
        skipDuplicates: true,
      });

      if (result.count > 0) {
        const enrollmentIds = batch.map(s => s.enrollment_id.trim());
        const createdRecords = await prisma.student.findMany({
          where: { enrollment_id: { in: enrollmentIds } },
          select: {
            id: true, name: true, email: true, gender: true, phone: true,
            enrollment_id: true, is_active: true, createdAt: true
          },
        });
        createdRecords.forEach(record => allCreatedStudents.push(sanitizeStudentData(record)));
      }
    }
    return allCreatedStudents;
  } catch (error) {
    console.error("Bulk insert error:", error);
    throw new AppError("Failed to create students in the database", 500);
  }
}


export const bulkCreateStudents = catchAsync(async (req: Request, res: Response) => {
  const { divisionId, students } = req.body;
  const { role } = req.user!;

  await authorizeDivisionAccess(role);

  if (!divisionId || !Array.isArray(students)) {
    throw new AppError("divisionId and a students array are required", 400);
  }
  if (students.length > MAX_BATCH_SIZE) {
    throw new AppError(`Cannot process more than ${MAX_BATCH_SIZE} students at once`, 400);
  }

  const divisionDetails = await getDivisionDetails(divisionId);

  const validationErrors: ValidationError[] = [];
  const validStudents: StudentInput[] = [];

  students.forEach((student: any, idx: number) => {
    const studentInput: StudentInput = {
      name: student.name,
      email: student.email,
      gender: String(student.gender).toUpperCase() as Gender,
      phone: String(student.phone),
      enrollment_id: String(student.enrollment_id),
    };
    const { isValid, errors } = validateStudentData(studentInput);
    if (!isValid) {
      errors.forEach(e => validationErrors.push({ ...e, row: idx + 1, data: student }));
    } else {
      validStudents.push(studentInput);
    }
  });

  if (validStudents.length === 0) {
    return res.status(400).json({
      success: false, added_count: 0, total_processed: students.length,
      validation_errors: validationErrors.length, duplicate_errors: 0,
      errors: validationErrors, students: [],
    });
  }

  const { duplicateIndexes, existingConflicts } = await checkDuplicates(validStudents);
  const duplicateErrors: ValidationError[] = [];
  const studentsToCreate: StudentInput[] = [];

  validStudents.forEach((student, idx) => {
    if (duplicateIndexes.has(idx)) {
      duplicateErrors.push({ row: idx + 1, data: student, error: "Duplicate email, phone, or enrollment ID found within the input list", field: "duplicate_internal" });
    } else if (existingConflicts.some(c => c.index === idx)) {
      const conflict = existingConflicts.find(c => c.index === idx)!;
      duplicateErrors.push({ row: idx + 1, data: student, error: `A student with this ${conflict.conflictType} already exists`, field: conflict.conflictType });
    } else {
      studentsToCreate.push(student);
    }
  });

  const created = studentsToCreate.length > 0
    ? await bulkInsertStudents(studentsToCreate, divisionId, divisionDetails)
    : [];

  const result: ProcessingResult = {
    success: created.length > 0,
    added_count: created.length,
    total_processed: students.length,
    validation_errors: validationErrors.length,
    duplicate_errors: duplicateErrors.length,
    errors: [...validationErrors, ...duplicateErrors],
    students: created,
  };

  return res.status(created.length ? 201 : 400).json(result);
});


export const createStudentsFromExcel = catchAsync(async (req: Request, res: Response) => {
  const { divisionId } = req.body;
  const { role } = req.user!;
  const file = req.file;

  await authorizeDivisionAccess(role);

  if (!divisionId) throw new AppError("divisionId is required", 400);
  if (!file) throw new AppError("Excel file is required", 400);
  if (file.size > MAX_FILE_SIZE) throw new AppError(`File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB`, 400);

  const divisionDetails = await getDivisionDetails(divisionId);

  const workbook = XLSX.read(file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new AppError("The uploaded Excel file contains no sheets.", 400);
  }
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new AppError(`Sheet "${sheetName}" could not be found in the file.`, 400);
  }
  const rawData = XLSX.utils.sheet_to_json(worksheet);

  if (rawData.length === 0) throw new AppError("Excel file is empty", 400);
  if (rawData.length > MAX_BATCH_SIZE) throw new AppError(`Excel file cannot contain more than ${MAX_BATCH_SIZE} students`, 400);

  const REQUIRED_COLUMNS = ['name', 'email', 'gender', 'phone', 'enrollment_id'];
  const firstRow = rawData[0] as any;
  const missingColumns = REQUIRED_COLUMNS.filter(col => !(col in firstRow));
  if (missingColumns.length > 0) {
    throw new AppError(`Missing required columns: ${missingColumns.join(', ')}`, 400);
  }

  const validationErrors: ValidationError[] = [];
  const validStudents: StudentInput[] = [];

  rawData.forEach((row: any, idx: number) => {
    const studentInput: StudentInput = {
      name: row.name,
      email: row.email,
      gender: String(row.gender).toUpperCase() as Gender,
      phone: String(row.phone),
      enrollment_id: String(row.enrollment_id),
    };
    const { isValid, errors } = validateStudentData(studentInput);
    if (!isValid) {
      errors.forEach(e => validationErrors.push({ ...e, row: idx + 2, data: row }));
    } else {
      validStudents.push(studentInput);
    }
  });

  if (validStudents.length === 0) {
    return res.status(400).json({
      success: false, added_count: 0, total_processed: rawData.length,
      validation_errors: validationErrors.length, duplicate_errors: 0,
      errors: validationErrors, students: [],
    });
  }

  const { duplicateIndexes, existingConflicts } = await checkDuplicates(validStudents);
  const duplicateErrors: ValidationError[] = [];
  const studentsToCreate: StudentInput[] = [];

  validStudents.forEach((student, idx) => {
    if (duplicateIndexes.has(idx)) {
      duplicateErrors.push({ row: idx + 2, data: student, error: "Duplicate email, phone, or enrollment ID found within the file", field: "duplicate_internal" });
    } else if (existingConflicts.some(c => c.index === idx)) {
      const conflict = existingConflicts.find(c => c.index === idx)!;
      duplicateErrors.push({ row: idx + 2, data: student, error: `A student with this ${conflict.conflictType} already exists`, field: conflict.conflictType });
    } else {
      studentsToCreate.push(student);
    }
  });

  const created = studentsToCreate.length > 0
    ? await bulkInsertStudents(studentsToCreate, divisionId, divisionDetails)
    : [];

  const result: ProcessingResult = {
    success: created.length > 0,
    added_count: created.length,
    total_processed: rawData.length,
    validation_errors: validationErrors.length,
    duplicate_errors: duplicateErrors.length,
    errors: [...validationErrors, ...duplicateErrors],
    students: created,
  };

  return res.status(created.length ? 201 : 400).json(result);
});



export const getAllStudentsByDivision = catchAsync(async (req: Request, res: Response) => {
  const { divisionId } = req.params;
  const { role } = req.user!;

  await authorizeDivisionAccess(role);

  if (!divisionId) {
    throw new AppError("Division ID is required", 400);
  }

  const students = await prisma.student.findMany({
    where: {
      division_id: divisionId
    },
    orderBy: {
      name: 'asc'
    }
  });

  res.status(200).json({
    success: true,
    count: students.length,
    data: students.map(sanitizeStudentData)
  });
});

/**
 * @desc    Update a student's details
 * @route   PATCH /api/students/:studentId
 * @access  Private (Admin roles)
 */
export const updateStudent = catchAsync(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  const { name, email, gender, phone, enrollment_id } = req.body;
  const { role } = req.user!;

  await authorizeDivisionAccess(role);

  if (!studentId) {
    throw new AppError("Student ID is required", 400);
  }

  // Check if student exists before attempting to update
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) {
    throw new AppError("Student not found", 404);
  }

  const updateData: { [key: string]: any } = {};
  const validationErrors: { field: string, message: string }[] = [];

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      validationErrors.push({ field: "name", message: "Name is required" });
    } else {
      updateData.name = name.trim();
    }
  }

  if (email !== undefined) {
    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      validationErrors.push({ field: "email", message: "Invalid email format" });
    } else {
      const existing = await prisma.student.findFirst({
        where: { email: trimmedEmail, NOT: { id: studentId } }
      });
      if (existing) {
        validationErrors.push({ field: "email", message: "Email is already in use" });
      } else {
        updateData.email = trimmedEmail;
      }
    }
  }

  if (gender !== undefined) {
    if (!Object.values(Gender).includes(gender)) {
      validationErrors.push({ field: "gender", message: "Gender must be either MALE or FEMALE" });
    } else {
      updateData.gender = gender;
    }
  }

  if (phone !== undefined) {
    const phoneString = String(phone).trim();
    const existing = await prisma.student.findFirst({
      where: { phone: phoneString, NOT: { id: studentId } }
    });
    if (existing) {
      validationErrors.push({ field: "phone", message: "Phone number is already in use" });
    } else {
      updateData.phone = phoneString;
    }
  }

  if (enrollment_id !== undefined) {
    const trimmedEnrollmentId = String(enrollment_id).trim();
    if (trimmedEnrollmentId.length === 0) {
      validationErrors.push({ field: "enrollment_id", message: "Enrollment ID cannot be empty" });
    } else {
      const existing = await prisma.student.findFirst({
        where: { enrollment_id: trimmedEnrollmentId, NOT: { id: studentId } }
      });
      if (existing) {
        validationErrors.push({ field: "enrollment_id", message: "Enrollment ID is already in use" });
      } else {
        updateData.enrollment_id = trimmedEnrollmentId;
      }
    }
  }

  if (validationErrors.length > 0) {
    throw new AppError(`Validation failed: ${validationErrors.map(e => e.message).join(', ')}`, 400);
  }

  if (Object.keys(updateData).length === 0) {
    throw new AppError("No fields provided to update", 400);
  }

  const updatedStudent = await prisma.student.update({
    where: { id: studentId },
    data: updateData
  });

  res.status(200).json({
    success: true,
    message: "Student details updated successfully",
    data: sanitizeStudentData(updatedStudent)
  });
});


export const softDeleteStudent = catchAsync(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  if (!studentId) {
    throw new AppError("Student Id required", 400);
  }
  const { role } = req.user!;

  await authorizeDivisionAccess(role);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { is_active: true }
  });

  if (!student) {
    throw new AppError("Student not found", 404);
  }
  if (!student.is_active) {
    throw new AppError("Student is already deactivated", 400);
  }

  const updatedStudent = await prisma.student.update({
    where: { id: studentId },
    data: {
      is_active: false,
      deactivatedAt: new Date()
    }
  });

  res.status(200).json({
    success: true,
    message: "Student has been successfully deactivated.",
    student: sanitizeStudentData(updatedStudent)
  });
});


export const permanentlyDeleteStudent = catchAsync(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  if (!studentId) {
    throw new AppError("Student Id required", 400);
  }
  // The requireRoles middleware in the route already ensures only authorized roles can access this.

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) {
    throw new AppError("Student not found", 404);
  }

  await prisma.student.delete({ where: { id: studentId } });

  res.status(204).send();
});


export async function cleanupInactiveStudents() {
  console.log('Running scheduled job: cleanupInactiveStudents...');
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const studentsToDelete = await prisma.student.findMany({
    where: {
      is_active: false,
      deactivatedAt: {
        lt: thirtyDaysAgo
      }
    },
    select: { id: true }
  });

  if (studentsToDelete.length === 0) {
    console.log("No students found for cleanup.");
    return;
  }

  const idsToDelete = studentsToDelete.map(s => s.id);

  try {
    const deleteResult = await prisma.student.deleteMany({
      where: {
        id: { in: idsToDelete }
      }
    });
    console.log(`Successfully deleted ${deleteResult.count} inactive students.`);
  } catch (error) {
    console.error("Error during scheduled student cleanup:", error);
  }
}