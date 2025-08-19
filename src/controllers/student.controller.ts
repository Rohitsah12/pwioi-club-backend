import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import XLSX from "xlsx";
import { AppError } from "../utils/AppError.js";
import { AuthorRole } from "../types/postApi.js";
import type { UserRole } from "../auth/types.js";
import { Gender } from "@prisma/client"; // Import Gender enum for type safety

// Constants
const MAX_BATCH_SIZE = 1000;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const PRISMA_BATCH_SIZE = 100;

// --- Interfaces --- //

interface StudentInput {
  name: string;
  email: string;
  gender: Gender; // Use Prisma's generated Gender type
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
}

interface ExistingConflict {
  index: number;
  student: StudentInput;
  conflictType: string | undefined;
  existingId?: string | undefined;
}

// --- Helper Functions --- //

/**
 * Fetches essential IDs from a division.
 * @param divisionId The ID of the division.
 * @returns An object with center_id, school_id, and batch_id.
 */
async function getDivisionDetails(divisionId: string): Promise<DivisionDetails> {
  const division = await prisma.division.findUnique({
    where: { id: divisionId },
    select: {
      center_id: true,
      school_id: true,
      batch_id: true
    },
  });

  if (!division) {
    throw new AppError("Division not found", 404);
  }

  return {
    center_id: division.center_id,
    school_id: division.school_id,
    batch_id: division.batch_id
  };
}

/**
 * Validates that a semester belongs to the specified division.
 * @param semesterId The ID of the semester.
 * @param divisionId The ID of the division.
 */
async function validateSemesterDivision(semesterId: string, divisionId: string): Promise<void> {
  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    select: { division_id: true },
  });

  if (!semester) throw new AppError("Semester not found", 404);
  if (semester.division_id !== divisionId) {
    throw new AppError("Semester does not belong to the specified division", 400);
  }
}

/**
 * Authorizes if an admin has access to a center's division.
 * Both ADMIN and SUPER_ADMIN now have full access to all centers.
 * @param centerId The center ID to check against.
 * @param role The user's role.
 * @param adminId The user's ID (if an admin).
 */
async function authorizeDivisionAccess(
  centerId: string,
  role: UserRole,
  adminId: string | undefined
): Promise<void> {
  // Both ADMIN and SUPER_ADMIN have universal access to all centers
  if (role === AuthorRole.SUPER_ADMIN || role === AuthorRole.ADMIN) {
    return;
  }
  
  throw new AppError("Your role is not permitted to perform this action", 403);
}

/**
 * Validates the data for a single student.
 * @param student The student data object.
 * @returns An object indicating if the data is valid and a list of errors.
 */
function validateStudentData(student: any): { isValid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const sanitized: Omit<StudentInput, 'gender'> & { gender?: string } = {
    name: student.name,
    email: student.email,
    phone: student.phone,
    enrollment_id: student.enrollment_id,
    gender: student.gender
  };

  // Name validation
  if (!student.name || typeof student.name !== "string" || student.name.trim().length === 0) {
    errors.push({ row: 0, data: sanitized, error: "Name is required", field: "name" });
  } else if (student.name.trim().length > 100) {
    errors.push({ row: 0, data: sanitized, error: "Name must be 100 characters or less", field: "name" });
  }

  // Email validation
  if (!student.email || typeof student.email !== "string") {
    errors.push({ row: 0, data: sanitized, error: "Email is required", field: "email" });
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(student.email.trim().toLowerCase())) {
      errors.push({ row: 0, data: sanitized, error: "Invalid email format", field: "email" });
    }
  }

  // Gender validation
  if (!student.gender || !Object.values(Gender).includes(student.gender)) {
    errors.push({ row: 0, data: sanitized, error: "Gender must be either MALE or FEMALE", field: "gender" });
  }

  // Phone validation
  if (!student.phone || typeof student.phone !== "string") {
    errors.push({ row: 0, data: sanitized, error: "Phone is required", field: "phone" });
  } else {
    const phoneDigits = String(student.phone).replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      errors.push({ row: 0, data: sanitized, error: "Phone must be between 10 and 15 digits", field: "phone" });
    }
  }

  // Enrollment ID validation
  if (!student.enrollment_id || typeof student.enrollment_id !== "string" || student.enrollment_id.trim().length === 0) {
    errors.push({ row: 0, data: sanitized, error: "Enrollment ID is required", field: "enrollment_id" });
  } else if (student.enrollment_id.trim().length > 50) {
    errors.push({ row: 0, data: sanitized, error: "Enrollment ID must be 50 characters or less", field: "enrollment_id" });
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Checks for duplicate students within the input list and against the database.
 * @param students An array of student data to check.
 * @returns An object containing sets of duplicate indexes and existing conflicts.
 */
async function checkDuplicates(students: StudentInput[]): Promise<{
  duplicateIndexes: Set<number>;
  existingConflicts: ExistingConflict[];
}> {
  const duplicateIndexes = new Set<number>();
  const existingConflicts: ExistingConflict[] = [];
  
  // 1. Check for duplicates within the input array
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

  // 2. Check against existing records in the database
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

/**
 * Sanitizes student data for public response.
 * @param student The raw student object from Prisma.
 * @returns A sanitized student object.
 */
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

/**
 * Inserts a batch of students into the database.
 * @param studentsToCreate Array of validated student data.
 * @param divisionId The target division ID.
 * @param semesterId The target semester ID.
 * @param divisionDetails Pre-fetched details of the division.
 * @returns An array of newly created public student data.
 */
async function bulkInsertStudents(
  studentsToCreate: StudentInput[],
  divisionId: string,
  semesterId: string,
  divisionDetails: DivisionDetails
): Promise<PublicStudentData[]> {
  const allCreatedStudents: PublicStudentData[] = [];

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

// --- Controllers --- //

/**
 * @desc    Bulk create students from a JSON array
 * @route   POST /api/students/bulk
 * @access  Private (Super Admin, Admin)
 */
export const bulkCreateStudents = catchAsync(async (req: Request, res: Response) => {
  const { divisionId, semesterId, students } = req.body;
  const { role, sub } = req.user!;

  if (!divisionId || !semesterId || !Array.isArray(students)) {
    throw new AppError("divisionId, semesterId, and a students array are required", 400);
  }
  if (students.length > MAX_BATCH_SIZE) {
    throw new AppError(`Cannot process more than ${MAX_BATCH_SIZE} students at once`, 400);
  }

  const divisionDetails = await getDivisionDetails(divisionId);
  await validateSemesterDivision(semesterId, divisionId);
  await authorizeDivisionAccess(divisionDetails.center_id, role, sub);

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
    ? await bulkInsertStudents(studentsToCreate, divisionId, semesterId, divisionDetails)
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

/**
 * @desc    Create students from an uploaded Excel file
 * @route   POST /api/students/upload
 * @access  Private (Super Admin, Admin)
 */
export const createStudentsFromExcel = catchAsync(async (req: Request, res: Response) => {
  const { divisionId, semesterId } = req.body;
  const { role, sub } = req.user!;
  const file = req.file;

  if (!divisionId || !semesterId) throw new AppError("divisionId and semesterId are required", 400);
  if (!file) throw new AppError("Excel file is required", 400);
  if (file.size > MAX_FILE_SIZE) throw new AppError(`File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB`, 400);

  const divisionDetails = await getDivisionDetails(divisionId);
  await validateSemesterDivision(semesterId, divisionId);
  await authorizeDivisionAccess(divisionDetails.center_id, role, sub);

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
      errors.forEach(e => validationErrors.push({ ...e, row: idx + 2, data: row })); // idx+2 for Excel row number
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
    ? await bulkInsertStudents(studentsToCreate, divisionId, semesterId, divisionDetails)
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

/**
 * @desc    Soft delete (deactivate) a student
 * @route   PATCH /api/students/:studentId/deactivate
 * @access  Private (Super Admin, Admin)
 */
export const softDeleteStudent = catchAsync(async (req: Request, res: Response) => {
    const { studentId } = req.params;
    if(!studentId){
        throw new AppError("Student Id required",400)
    }
    const { role, sub } = req.user!;

    const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { center_id: true, is_active: true }
    });

    if (!student) {
        throw new AppError("Student not found", 404);
    }

    // Authorize the action - both ADMIN and SUPER_ADMIN have access to all centers
    await authorizeDivisionAccess(student.center_id, role, sub);

    if (!student.is_active) {
        throw new AppError("Student is already deactivated", 400);
    }

    // Perform the soft delete
    const updatedStudent = await prisma.student.update({
        where: { id: studentId },
        data: {
            is_active: false,
            deactivatedAt: new Date() // Sets the deactivation timestamp
        }
    });

    res.status(200).json({
        success: true,
        message: "Student has been successfully deactivated.",
        student: sanitizeStudentData(updatedStudent)
    });
});

/**
 * @desc    Permanently delete a student record
 * @route   DELETE /api/students/:studentId/permanent
 * @access  Private (Super Admin only)
 */
export const permanentlyDeleteStudent = catchAsync(async (req: Request, res: Response) => {
    const { studentId } = req.params;
    if(!studentId){
        throw new AppError("Student Id required",400)
    }
    const { role } = req.user!;

    if (role !== AuthorRole.SUPER_ADMIN) {
        throw new AppError("You do not have permission to permanently delete a student.", 403);
    }

    const student = await prisma.student.findUnique({ where: { id: studentId } });

    if (!student) {
        throw new AppError("Student not found", 404);
    }

    await prisma.student.delete({ where: { id: studentId } });

    res.status(204).send(); // 204 No Content is standard for successful deletions
});

/**
 * @desc    Scheduled job to clean up students deactivated for more than 30 days.
 * @note    This function is NOT an API endpoint. It should be run by a scheduler (e.g., node-cron).
 */
export async function cleanupInactiveStudents() {
    console.log('Running scheduled job: cleanupInactiveStudents...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find students who were deactivated over 30 days ago
    const studentsToDelete = await prisma.student.findMany({
        where: {
            is_active: false,
            deactivatedAt: {
                lt: thirtyDaysAgo // 'lt' means "less than"
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
