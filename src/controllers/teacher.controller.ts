import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import XLSX from "xlsx";
import { AppError } from "../utils/AppError.js";
import type { UserRole } from "../auth/types.js";
import { Gender, TeacherRole } from "@prisma/client";
import { z } from "zod";
import { getActiveSubjectsWithAttendance } from "../service/getActiveSubjectsAttendanceService.js";

const MAX_BATCH_SIZE = 1000;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

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


async function authorizeTeacherManagement(centerId: string, role: UserRole, adminId: string): Promise<void> {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return;
  throw new AppError("Your role is not permitted to manage teachers.", 403);
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


export const bulkCreateTeachers = catchAsync(async (req: Request, res: Response) => {
  const { centerId, teachers } = req.body;
  const { role, id } = req.user!;

  if (!centerId || !Array.isArray(teachers)) {
    throw new AppError("centerId and teachers array are required", 400);
  }
  if (teachers.length > MAX_BATCH_SIZE) {
    throw new AppError(`Cannot process more than ${MAX_BATCH_SIZE} teachers at once`, 400);
  }

  await authorizeTeacherManagement(centerId, role, id);

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
  const { role, id } = req.user!;
  const file = req.file;

  if (!centerId) throw new AppError("centerId is required", 400);
  if (!file) throw new AppError("Excel file is required", 400);

  await authorizeTeacherManagement(centerId, role, id);

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
export const getTeacherById = catchAsync(async (req: Request, res: Response) => {
  const { teacherId } = req.params;

  if (!teacherId) {
    throw new AppError("teacherId is required", 400);
  }

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      gender: true,
      role: true,
      designation: true,
      linkedin: true,
      github_link: true,
      personal_mail: true,
      center: {
        select: {
          id: true,
          name: true
        }
      },
      teacherSchools: {
        select: {
          school: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    }
  });

  if (!teacher) {
    throw new AppError("Teacher not found", 404);
  }

  res.status(200).json({
    success: true,
    data: teacher
  });
});

export const getTeachersByCenterId = catchAsync(async (req: Request, res: Response) => {
  const { centerId } = req.params;

  if (!centerId) {
    throw new AppError("centerId is required", 400);
  }

  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: { id: true, name: true }
  });

  if (!center) {
    throw new AppError("Center not found", 404);
  }

  const teachers = await prisma.teacher.findMany({
    where: { center_id: centerId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      gender: true,
      role: true,
      designation: true,
      linkedin: true,
      github_link: true,
      personal_mail: true
    },
    orderBy: { createdAt: "desc" }
  });

  res.status(200).json({
    success: true,
    center: { id: center.id, name: center.name },
    count: teachers.length,
    data: teachers
  });
});

export const getTeachersBySchoolId = catchAsync(async (req: Request, res: Response) => {
  const { schoolId } = req.params;

  if (!schoolId) {
    throw new AppError("schoolId is required", 400);
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      id: true,
      name: true,
      center: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!school) {
    throw new AppError("School not found", 404);
  }

  const teacherSchools = await prisma.teacherSchool.findMany({
    where: { school_id: schoolId },
    select: {
      teacher: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          gender: true,
          role: true,
          designation: true,
          linkedin: true,
          github_link: true,
          personal_mail: true,
          createdAt: true
        }
      }
    },
    orderBy: { teacher: { createdAt: "desc" } }
  });

  const teachers = teacherSchools.map(ts => ts.teacher);

  res.status(200).json({
    success: true,
    school: { id: school.id, name: school.name },
    center: school.center,
    count: teachers.length,
    data: teachers
  });
});


export const permanentlyDeleteTeacher = catchAsync(async (req: Request, res: Response) => {
  const { teacherId } = req.params;
  const { role, id } = req.user!;

  if (!teacherId) throw new AppError("Teacher ID is required", 400);

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { center_id: true, name: true },
  });

  if (!teacher) throw new AppError("Teacher not found", 404);

  await authorizeTeacherManagement(teacher.center_id, role, id);

  await prisma.teacher.delete({ where: { id: teacherId } });

  res.status(200).json({
    success: true,
    message: `Teacher ${teacher.name} deleted successfully`,
  });
});


const teacherExperienceCreateSchema = z.object({
  title: z.string().min(1, "Title is required"),
  company_name: z.string().min(1, "Company name is required"),
  location: z.string().optional().transform(val => val ?? null),
  work_mode: z.enum(["HYBRID", "ONSITE", "REMOTE"]),
  start_date: z.coerce.date(),
  end_date: z.coerce.date().optional().transform(val => val ?? null),
  description: z.string().optional().transform(val => val ?? null),
});


const teacherExperienceUpdateSchema = teacherExperienceCreateSchema.partial();

export const addTeacherExperience = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user!;
    const parsed = teacherExperienceCreateSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        status: "fail",
        errors: parsed.error.format(),
      });
    }

    const experience = await prisma.teacherExperience.create({
      data: {
        teacher_id: user.id,
        ...parsed.data,
      },
    });

    res.status(201).json({ status: "success", data: experience });
  }
);

export const getAssistantTeachers = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  
  if (!user) {
    throw new AppError("Teacher is not authenticated", 400);
  }

  const teacher = await prisma.teacher.findUnique({
    where: {
      id: user.id
    },
    select: {
      center_id: true,
      name: true
    }
  });

  if (!teacher) {
    throw new AppError("Teacher not found", 404);
  }

  // Fetch all assistant teachers in the same center
  const assistantTeachers = await prisma.teacher.findMany({
    where: {
      center_id: teacher.center_id,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      designation: true,
      linkedin: true,
      personal_mail: true,
      github_link: true,
      gender: true,
      about: true,
      createdAt: true,
      updatedAt: true,
      // Include related data if needed
      center: {
        select: {
          id: true,
          name: true,
          location: true
        }
      },
      teacherSchools: {
        select: {
          specialisation: true,
          school: {
            select: {
              name: true
            }
          }
        }
      },
      subjects: {
        select: {
          id: true,
          name: true,
          code: true,
          credits: true
        }
      }
    },
    orderBy: {
      name: 'asc'
    }
  });

  res.status(200).json({
    success: true,
    message: "Assistant teachers fetched successfully",
    data: {
      center: {
        id: teacher.center_id,
        total_assistant_teachers: assistantTeachers.length
      },
      assistant_teachers: assistantTeachers
    }
  });
});

export const getCenterBatches = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  
  if (!user) {
    throw new AppError("Teacher is not authenticated", 400);
  }

  const teacher = await prisma.teacher.findUnique({
    where: {
      id: user.id
    },
    select: {
      center_id: true,
      name: true
    }
  });

  if (!teacher) {
    throw new AppError("Teacher not found", 404);
  }

  const batches = await prisma.batch.findMany({
    where: {
      center_id: teacher.center_id
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      center: {
        select: {
          id: true,
          name: true,
          location: true,
          code: true
        }
      },
    },
    orderBy: {
      name: 'asc'
    }
  });

  const batchStats = batches.map(batch => ({
    ...batch,
  }));

  res.status(200).json({
    success: true,
    message: "Center batches fetched successfully",
    data: {
      center: {
        id: teacher.center_id,
        total_batches: batches.length
      },
      batches: batchStats
    }
  });
});


export const updateTeacherExperience = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user!;
    const experienceId = req.params.id;

    if (!experienceId) {
      throw new AppError("Experience Id required", 400);
    }

    const experience = await prisma.teacherExperience.findUnique({
      where: { id: experienceId },
    });

    if (!experience || experience.teacher_id !== user.id) {
      throw new AppError("Experience not found or not yours", 404);
    }

    const parsed = teacherExperienceUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        status: "fail",
        errors: parsed.error.format(),
      });
    }

    const cleanedData = Object.fromEntries(
      Object.entries(parsed.data).map(([key, value]) => [
        key,
        value === "" ? null : value,
      ])
    );

    const updatedExperience = await prisma.teacherExperience.update({
      where: { id: experienceId },
      data: cleanedData,
    });

    res.json({ status: "success", data: updatedExperience });
  }
);

export const getActiveSubjectAttendance = catchAsync(
  async (req: Request, res: Response) => {
    const teacherId = req.user!.id;
    if (!teacherId) {
      return res.status(400).json({ message: 'Teacher ID not found in token.' });
    }
    const subjects = await getActiveSubjectsWithAttendance(teacherId);
    res.status(200).json(subjects);
  }
)
export const deleteTeacherExperience = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user!;
    const experienceId = req.params.id;
    if (!experienceId) {
      throw new AppError("Experience Id required", 400)
    }
    const experience = await prisma.teacherExperience.findUnique({
      where: { id: experienceId },
    });
    if (!experience || experience.teacher_id !== user.id) {
      throw new AppError("Experience not found or not yours", 404);
    }

    await prisma.teacherExperience.delete({ where: { id: experienceId } });
    res.status(204).json({ status: "success", data: null });
  }
);

export const getTeacherAllExperience = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user!;
    const experiences = await prisma.teacherExperience.findMany({
      where: { teacher_id: user.id },
      orderBy: { start_date: "desc" },
    });
    res.json({ status: "success", results: experiences.length, data: experiences });
  }
);

export const getTeacherExperienceById = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user!;
    const experienceId = req.params.id;
    if (!experienceId) {
      throw new AppError("Experience Id required", 400)
    }

    const experience = await prisma.teacherExperience.findUnique({
      where: { id: experienceId },
    });
    if (!experience || experience.teacher_id !== user.id) {
      throw new AppError("Experience not found or not yours", 404);
    }
    res.json({ status: "success", data: experience });
  }
);

const researchPaperCreateSchema = z.object({
  title: z.string().min(1, "Title is required"),
  abstract: z.string().optional().transform(val => val ?? null),
  publication_date: z.coerce.date().optional().transform(val => val ?? null),
  journal_name: z.string().optional().transform(val => val ?? null),
  doi: z.string().optional().transform(val => val ?? null),
  url: z.string().optional().transform(val => val ?? null),
});

const researchPaperUpdateSchema = researchPaperCreateSchema.partial();


export const addBasicDetailsOfTeacher = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  const { linkedin_url, github_url, personal_email, about } = req.body;

  if (
    linkedin_url === undefined &&
    github_url === undefined &&
    personal_email === undefined && 
    about === undefined
  ) {
    throw new AppError("Must provide at least one field: linkedin_url, github_url, about or personal_email", 400);
  }

  const updateData: Record<string, string | null> = {};

  if (linkedin_url !== undefined) {
    if (linkedin_url !== "" && typeof linkedin_url !== "string") {
      throw new AppError("linkedin_url must be a string", 400);
    }
    if (linkedin_url !== "" && linkedin_url !== null && !linkedin_url.includes('linkedin.com')) {
      throw new AppError("linkedin_url must be a valid LinkedIn URL", 400);
    }
    updateData.linkedin = linkedin_url === "" ? null : linkedin_url;
  }

  if (github_url !== undefined) {
    if (github_url !== "" && typeof github_url !== "string") {
      throw new AppError("github_url must be a string", 400);
    }
    if (github_url !== "" && github_url !== null && !github_url.includes('github.com')) {
      throw new AppError("github_url must be a valid GitHub URL", 400);
    }
    updateData.github_link = github_url === "" ? null : github_url;
  }

  // Handle Personal Email
  if (personal_email !== undefined) {
    if (
      personal_email !== "" &&
      (typeof personal_email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal_email))
    ) {
      throw new AppError("Invalid personal_email format", 400);
    }

    if (personal_email !== "" && personal_email !== null) {
      const existingTeacher = await prisma.teacher.findFirst({
        where: {
          personal_mail: personal_email,
          id: {
            not: user.id
          }
        }
      });

      if (existingTeacher) {
        throw new AppError("Personal email already exists for another teacher", 400);
      }
    }

    updateData.personal_mail = personal_email === "" ? null : personal_email;
  }

  if (about !== undefined) {
    if (about !== "" && typeof about !== "string") {
      throw new AppError("about must be a string", 400);
    }
    if (about !== "" && about !== null) {
      if (about.length < 10) {
        throw new AppError("About section must be at least 10 characters long", 400);
      }
      if (about.length > 1000) {
        throw new AppError("About section cannot exceed 1000 characters", 400);
      }
    }
    updateData.about = about === "" ? null : about;
  }

  const updatedTeacher = await prisma.teacher.update({
    where: { id: user.id },
    data: {
      ...updateData,
      updatedAt: new Date()
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      about: true,
      personal_mail: true,
      linkedin: true,
      github_link: true,
      designation: true,
      gender: true,
      createdAt: true,
      updatedAt: true,
      center: {
        select: {
          id: true,
          name: true,
          location: true
        }
      }
    }
  });

  // Track what fields were actually updated
  const updatedFields = Object.keys(updateData);

  res.status(200).json({
    success: true,
    message: "Basic details updated successfully",
    data: {
      teacher: updatedTeacher,
      updated_fields: updatedFields
    }
  });
});

export const getTeacherBasicDetails = catchAsync(async (req: Request, res: Response) => {
  const { id: teacherId } = req.user!;

  if (!teacherId) {
    throw new AppError("Teacher ID not found in token", 400);
  }

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: {
      linkedin: true,
      github_link: true,
      personal_mail: true,
      about: true
    }
  });

  if (!teacher) {
    throw new AppError("Teacher not found", 404);
  }

  const response = {
    success: true,
    data: teacher
  };

  res.status(200).json(response);
});


export const deleteTeacherBasicDetails = catchAsync(async (req: Request, res: Response) => {
  const { id: teacherId } = req.user!;
  const { field } = req.query;

  if (!teacherId) {
    throw new AppError("Teacher ID not found in token", 400);
  }

  if (!field || (field !== 'github' && field !== 'linkedin')) {
    throw new AppError("Invalid field. Use 'github' or 'linkedin' as query parameter", 400);
  }

  const existingTeacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { 
      id: true, 
      name: true, 
      github_link: true, 
      linkedin: true 
    }
  });

  if (!existingTeacher) {
    throw new AppError("Teacher not found", 404);
  }

  const updateData: any = { updatedAt: new Date() };
  let fieldName = '';
  let currentValue = null;

  if (field === 'github') {
    updateData.github_link = null;
    fieldName = 'GitHub URL';
    currentValue = existingTeacher.github_link;
  } else if (field === 'linkedin') {
    updateData.linkedin = null;
    fieldName = 'LinkedIn URL';
    currentValue = existingTeacher.linkedin;
  }

  if (!currentValue) {
    throw new AppError(`${fieldName} is already empty`, 400);
  }

  // Update the specific field
  await prisma.teacher.update({
    where: { id: teacherId },
    data: updateData
  });

  const response = {
    success: true,
    message: `${fieldName} deleted successfully`,
    field: field as string
  };

  res.status(200).json(response);
});
async function verifyTeacherOwnership(userId: string, researchPaperId: string) {
  const association = await prisma.teacherResearchPaper.findFirst({
    where: { teacher_id: userId, research_paper_id: researchPaperId },
  });
  if (!association) throw new AppError("Research paper not found or not yours", 404);
}


export const addTeacherResearchPapers = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user!;
    const parsed = researchPaperCreateSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        status: "fail",
        errors: parsed.error.format(),
      });
    }

    const cleanedData: typeof parsed.data = Object.fromEntries(
      Object.entries(parsed.data).map(([key, value]) => [
        key,
        value === "" ? null : value,
      ])
    ) as typeof parsed.data;

    const paper = await prisma.researchPaper.create({
      data: cleanedData,
    });

    await prisma.teacherResearchPaper.create({
      data: {
        teacher_id: user.id,
        research_paper_id: paper.id,
      },
    });

    res.status(201).json({ status: "success", data: paper });
  }
);

export const updateTeacherResearchPaper = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user!;
    const { researchPaperId } = req.params;

    if (!researchPaperId) {
      throw new AppError("ResearchPaper Id required", 400);
    }

    const parsed = researchPaperUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        status: "fail",
        errors: parsed.error.format(),
      });
    }

    await verifyTeacherOwnership(user.id, researchPaperId);

    const cleanedData = Object.fromEntries(
      Object.entries(parsed.data).map(([key, value]) => [
        key,
        value === "" || value === undefined ? { set: null } : { set: value },
      ])
    );

    const updatedPaper = await prisma.researchPaper.update({
      where: { id: researchPaperId },
      data: cleanedData,
    });

    res.json({ status: "success", data: updatedPaper });
  }
);


export const deleteTeacherResearhPaper = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user!;
    const { researchPaperId } = req.params;
    if (!researchPaperId) {
      throw new AppError("ResearchPaper Id Required", 400)
    }

    await verifyTeacherOwnership(user.id, researchPaperId);

    await prisma.teacherResearchPaper.deleteMany({
      where: {
        research_paper_id: researchPaperId,
        teacher_id: user.id,
      },
    });

    const stillAssociated = await prisma.teacherResearchPaper.findMany({
      where: { research_paper_id: researchPaperId },
    });
    if (stillAssociated.length === 0) {
      await prisma.researchPaper.delete({ where: { id: researchPaperId } });
    }

    res.status(204).json({ status: "success", data: null });
  }
);

export const getTeacherAllResearchPapers = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user!;
    const papers = await prisma.researchPaper.findMany({
      where: {
        teacherResearchPapers: { some: { teacher_id: user.id } },
      },
      orderBy: { publication_date: "desc" },
    });
    res.json({ status: "success", results: papers.length, data: papers });
  }
);

export const getTeacherResearchPaperById = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user!;
    const { researchPaperId } = req.params;

    if (!researchPaperId) {
      throw new AppError("ResearchPaper Id Required", 400)
    }
    await verifyTeacherOwnership(user.id, researchPaperId);

    const paper = await prisma.researchPaper.findUnique({
      where: { id: researchPaperId },
    });
    if (!paper) throw new AppError("Research paper not found", 404);

    res.json({ status: "success", data: paper });
  }
);