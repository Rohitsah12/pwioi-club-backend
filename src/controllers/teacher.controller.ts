import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import XLSX from "xlsx";
import { AppError } from "../utils/AppError.js";
import type { UserRole } from "../auth/types.js";
import { Gender, TeacherRole } from "@prisma/client";

// --- Constants --- //
const MAX_BATCH_SIZE = 1000;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// --- Interfaces --- //
interface TeacherInput {
  name: string;
  email: string;
  phone: string;
  role: TeacherRole;
  gender: Gender;
  designation?: string;
}

interface ValidationError {
  row: number;
  data: Omit<TeacherInput, 'gender' | 'role'> & { gender?: string; role?: string };
  error: string;
  field?: string;
}

interface ProcessingResult {
  success: boolean;
  added_count: number;
  total_processed: number;
  validation_errors: number;
  duplicate_errors: number;
  errors: ValidationError[];
  teachers: PublicTeacherData[];
}

interface PublicTeacherData {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: TeacherRole;
  gender: Gender;
  designation: string | null;
  createdAt: Date;
}

// --- Helper Functions ---

async function authorizeTeacherManagement(centerId: string, role: UserRole, adminId: string ): Promise<void> {
  if (role === 'SUPER_ADMIN') return;
  if (role === 'ADMIN') {
    const center = await prisma.center.findFirst({
      where: {
        id: centerId,
        OR: [{ business_head: adminId }, { academic_head: adminId }],
      },
    });
    if (!center) throw new AppError("You are not authorized to manage teachers for this center.", 403);
  } else {
    throw new AppError("Your role is not permitted to manage teachers.", 403);
  }
}

function validateTeacherData(teacher: any, row: number = 0): { isValid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const sanitized = { name: teacher.name, email: teacher.email, phone: teacher.phone, role: teacher.role, gender: teacher.gender, designation: teacher.designation };

  if (!teacher.name || typeof teacher.name !== "string" || teacher.name.trim().length === 0) {
    errors.push({ row, data: sanitized, error: "Name is required", field: "name" });
  }
  if (!teacher.email || typeof teacher.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(teacher.email)) {
    errors.push({ row, data: sanitized, error: "A valid email is required", field: "email" });
  }
  if (!teacher.phone || typeof teacher.phone !== "string" || !/^\d{10,15}$/.test(String(teacher.phone))) {
    errors.push({ row, data: sanitized, error: "A valid phone number (10-15 digits) is required", field: "phone" });
  }
  if (!teacher.role || !Object.values(TeacherRole).includes(teacher.role)) {
    errors.push({ row, data: sanitized, error: "Role must be either TEACHER or ASSISTANT_TEACHER", field: "role" });
  }
  if (!teacher.gender || !Object.values(Gender).includes(teacher.gender)) {
    errors.push({ row, data: sanitized, error: "Gender must be either MALE or FEMALE", field: "gender" });
  }

  return { isValid: errors.length === 0, errors };
}

async function checkTeacherDuplicates(teachers: TeacherInput[]): Promise<any[]> {
  const emails = teachers.map(t => t.email.toLowerCase());
  const phones = teachers.map(t => t.phone);

  const existingTeachers = await prisma.teacher.findMany({
    where: {
      OR: [
        { email: { in: emails } },
        { phone: { in: phones } },
      ],
    },
    select: { email: true, phone: true },
  });

  const existingEmailSet = new Set(existingTeachers.map(t => t.email.toLowerCase()));
  const existingPhoneSet = new Set(existingTeachers.map(t => t.phone));

  const conflicts: any[] = [];
  teachers.forEach((teacher, index) => {
    if (existingEmailSet.has(teacher.email.toLowerCase())) {
      conflicts.push({ index, teacher, conflictType: 'email' });
    } else if (existingPhoneSet.has(teacher.phone)) {
      conflicts.push({ index, teacher, conflictType: 'phone' });
    }
  });
  return conflicts;
}

function sanitizeTeacherData(teacher: any): PublicTeacherData {
  return {
    id: teacher.id,
    name: teacher.name,
    email: teacher.email,
    phone: teacher.phone,
    role: teacher.role,
    gender: teacher.gender,
    designation: teacher.designation,
    createdAt: teacher.createdAt,
  };
}

// --- Controllers ---

export const bulkCreateTeachers = catchAsync(async (req: Request, res: Response) => {
  const { centerId, teachers } = req.body;
  const { role, sub } = req.user!;

  if (!centerId || !Array.isArray(teachers)) {
    throw new AppError("centerId and teachers array are required", 400);
  }
  if (teachers.length > MAX_BATCH_SIZE) {
    throw new AppError(`Cannot process more than ${MAX_BATCH_SIZE} teachers at once`, 400);
  }

  await authorizeTeacherManagement(centerId, role, sub);

  const validationErrors: ValidationError[] = [];
  const validTeachers: TeacherInput[] = [];

  teachers.forEach((teacher: any, idx: number) => {
    const teacherInput: TeacherInput = {
      name: teacher.name,
      email: teacher.email,
      phone: String(teacher.phone),
      role: String(teacher.role).toUpperCase() as TeacherRole,
      gender: String(teacher.gender).toUpperCase() as Gender,
      designation: teacher.designation,
    };
    const { isValid, errors } = validateTeacherData(teacherInput, idx + 1);
    if (!isValid) {
      validationErrors.push(...errors);
    } else {
      validTeachers.push(teacherInput);
    }
  });

  if (validTeachers.length === 0) {
    return res.status(400).json({ success: false, added_count: 0, errors: validationErrors });
  }

  const existingConflicts = await checkTeacherDuplicates(validTeachers);
  const duplicateErrors: ValidationError[] = existingConflicts.map(conflict => ({
    row: conflict.index + 1,
    data: conflict.teacher,
    error: `A teacher with this ${conflict.conflictType} already exists.`,
    field: conflict.conflictType,
  }));

  const teachersToCreate = validTeachers.filter((_, index) => !existingConflicts.some(c => c.index === index));

  if (teachersToCreate.length === 0) {
    return res.status(400).json({ success: false, added_count: 0, errors: [...validationErrors, ...duplicateErrors] });
  }

  await prisma.teacher.createMany({
    data: teachersToCreate.map(teacher => ({ ...teacher, center_id: centerId })),
    skipDuplicates: true,
  });

  // Query created teachers to return full details
  const createdTeacherRecords = await prisma.teacher.findMany({
    where: {
      email: { in: teachersToCreate.map(t => t.email.toLowerCase()) }
    }
  });

  res.status(201).json({
    success: true,
    added_count: createdTeacherRecords.length,
    total_processed: teachers.length,
    validation_errors: validationErrors.length,
    duplicate_errors: duplicateErrors.length,
    errors: [...validationErrors, ...duplicateErrors],
    teachers: createdTeacherRecords.map(sanitizeTeacherData),
  });
});

export const createTeachersFromExcel = catchAsync(async (req: Request, res: Response) => {
  const { centerId } = req.body;
  const { role, sub } = req.user!;
  const file = req.file;

  if (!centerId) throw new AppError("centerId is required", 400);
  if (!file) throw new AppError("Excel file is required", 400);

  await authorizeTeacherManagement(centerId, role, sub);

  const workbook = XLSX.read(file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new AppError("Excel file contains no sheets", 400);

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new AppError(`Sheet "${sheetName}" not found in the file.`, 400);

  const rawData = XLSX.utils.sheet_to_json(worksheet);

  const REQUIRED_COLUMNS = ['name', 'email', 'phone', 'role', 'gender'];
  if (rawData.length > 0) {
    const firstRow = rawData[0] as any;
    const missingColumns = REQUIRED_COLUMNS.filter(col => !(col in firstRow));
    if (missingColumns.length > 0) {
      throw new AppError(`Missing required columns: ${missingColumns.join(', ')}`, 400);
    }
  }

  const validationErrors: ValidationError[] = [];
  const validTeachers: TeacherInput[] = [];

  rawData.forEach((row: any, idx: number) => {
    const teacherInput: TeacherInput = {
      name: row.name,
      email: row.email,
      phone: String(row.phone),
      role: String(row.role).toUpperCase() as TeacherRole,
      gender: String(row.gender).toUpperCase() as Gender,
      designation: row.designation,
    };
    const { isValid, errors } = validateTeacherData(teacherInput, idx + 2);
    if (!isValid) {
      validationErrors.push(...errors);
    } else {
      validTeachers.push(teacherInput);
    }
  });

  const existingConflicts = await checkTeacherDuplicates(validTeachers);
  const duplicateErrors: ValidationError[] = existingConflicts.map(conflict => ({
    row: conflict.index + 2,
    data: conflict.teacher,
    error: `A teacher with this ${conflict.conflictType} already exists.`,
    field: conflict.conflictType,
  }));

  const teachersToCreate = validTeachers.filter((_, index) => !existingConflicts.some(c => c.index === index));

  if (teachersToCreate.length === 0) {
    return res.status(400).json({ success: false, added_count: 0, errors: [...validationErrors, ...duplicateErrors] });
  }

  await prisma.teacher.createMany({
    data: teachersToCreate.map(teacher => ({ ...teacher, center_id: centerId })),
    skipDuplicates: true,
  });

  const createdTeacherRecords = await prisma.teacher.findMany({
    where: {
      email: { in: teachersToCreate.map(t => t.email.toLowerCase()) }
    }
  });

  res.status(201).json({
    success: true,
    added_count: createdTeacherRecords.length,
    total_processed: rawData.length,
    validation_errors: validationErrors.length,
    duplicate_errors: duplicateErrors.length,
    errors: [...validationErrors, ...duplicateErrors],
    teachers: createdTeacherRecords.map(sanitizeTeacherData),
  });
});

export const permanentlyDeleteTeacher = catchAsync(async (req: Request, res: Response) => {
  const { teacherId } = req.params;
  const { role, sub } = req.user!;

  if (!teacherId) throw new AppError("Teacher ID is required", 400);

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { center_id: true, name: true },
  });

  if (!teacher) throw new AppError("Teacher not found", 404);

  await authorizeTeacherManagement(teacher.center_id, role, sub);

  await prisma.teacher.delete({ where: { id: teacherId } });

  res.status(200).json({
    success: true,
    message: `Teacher ${teacher.name} deleted successfully`,
  });
});
