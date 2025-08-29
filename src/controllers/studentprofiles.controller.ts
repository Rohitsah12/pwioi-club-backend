import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";
import { JobType, WorkMode } from "@prisma/client";
import { validate as uuidValidate } from "uuid";
import z from "zod"

interface PersonalDetailsBody {
    personal_email: string;
    fathers_name?: string;
    mothers_name?: string;
    fathers_contact_number?: string;
    mothers_contact_number?: string;
    fathers_occupation?: string;
    mothers_occupation?: string;
}

interface EducationData {
    id?: string;
    institution: string;
    degree: string;
    field_of_study: string;
    start_date: string | Date;
    end_date?: string | Date | null;
    grade?: number | null;
}

interface AcademicHistoryBody {
    undergraduate?: EducationData;
    x_education?: EducationData;
    xii_education?: EducationData;
}

interface ProjectBody {
    name: string;
    description?: string;
    technologies?: string;
    github_link?: string;
    live_link?: string;
    start_date: string | Date;
    end_date?: string | Date | null;
}

const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const validateUrl = (url: string): boolean => {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
};

const validateDate = (date: string | Date): boolean => {
    const parsedDate = new Date(date);
    return !isNaN(parsedDate.getTime());
};


const isValidEnumValue = <T extends Record<string, string | number>>(
    enumObject: T,
    value: unknown
): value is T[keyof T] => {
    return Object.values(enumObject).includes(value as T[keyof T]);
};

const checkStudentExists = async (studentId: string) => {
    const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true }
    });
    if (!student) {
        throw new AppError("Student not found.", 404);
    }
    return student;
};

interface CertificationBody {
    name: string;
    organisation: string;
    start_date: string | Date;
    end_date?: string | Date | null;
    link?: string | null;
}
interface PlacementBody {
    job_type: JobType;
    work_mode: WorkMode;
    role: string;
    company_name: string;
    start_date: string | Date;
    end_date?: string | Date | null;
    description?: string | null;
}


interface AchievementBody {
    title: string;
    description?: string;
    start_date: string | Date;
    organisation?: string;
}

interface SocialLinkBody {
    platform: string;
    link: string;
}


// --- Validation Utilities ---
const ALLOWED_PLATFORMS = [
    "GitHub",
    "LinkedIn",
    "Twitter",
    "Facebook",
    "Instagram",
    "Website",
    "Dribbble",
    "Behance",
    "Medium",
    "Dev.to",
    "X",
];

interface ResponseProfileData {
    success: boolean;
    message: string;
    data: {
        studentInfo: {
            id: string;
            name: string;
            email: string;
            is_active: boolean;
        };
        profile: {
            personalDetails: any | null;
            academicHistory: {
                undergrad: any | null;
                xEducation: any | null;
                xiiEducation: any | null;
            } | null;
            projects: any[];
            certifications: any[];
            placements: any[];
            achievements: any[];
            socialLinks: any[];
        };
        stats: {
            completionPercentage: number;
            completedSections: number;
            totalSections: number;
            projectsCount: number;
            certificationsCount: number;
            placementsCount: number;
            achievementsCount: number;
            socialLinksCount: number;
            personalDetailsExists: boolean;
            academicHistoryExists: boolean;
        };
    };
}


const degreeSchema = z.object({
  college_name: z.string().min(1, "College name is required"),
  degree_name: z.string().min(1, "Degree name is required"),
  specialisation: z.string().nullable().optional(), // allow null or string
  start_date: z.string().datetime("Invalid start date format"),
  end_date: z.string().datetime("Invalid end date format").optional(),
});

export const createStudentDegreePartner = catchAsync(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  const validation = degreeSchema.safeParse(req.body);

  if (!studentId) throw new AppError("Student ID is required", 400);
  if (!validation.success) {
    return res.status(400).json({ success: false, errors: validation.error.format() });
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { degree_id: true },
  });
  if (!student) throw new AppError("Student not found", 404);

  // If student already has a degree, delete it
  if (student.degree_id) {
    await prisma.externalDegree.delete({ where: { id: student.degree_id } });
  }

  const extDegree = await prisma.externalDegree.create({
    data: {
      college_name: validation.data.college_name,
      degree_name: validation.data.degree_name,
      specialisation: validation.data.specialisation ?? null, // ✅ ensure null instead of undefined
      start_date: new Date(validation.data.start_date),
      end_date: validation.data.end_date ? new Date(validation.data.end_date) : null,
      students: { connect: { id: studentId } },
    },
  });

  await prisma.student.update({
    where: { id: studentId },
    data: { degree_id: extDegree.id },
  });

  res.status(201).json({
    success: true,
    message: "Degree partner created for student",
    externalDegree: extDegree,
  });
});

// Get student's degree partner
export const getStudentDegreePartner = catchAsync(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  if (!studentId) throw new AppError("Student ID is required", 400);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      enrollment_id: true,
      degree: true,
    },
  });

  if (!student) throw new AppError("Student not found", 404);

  res.status(200).json({
    success: true,
    data: {
      studentId: student.id,
      name: student.name,
      enrollmentId: student.enrollment_id,
      externalDegree: student.degree,
    },
  });
});

// Update student's degree partner (partial)
export const updateStudentDegreePartner = catchAsync(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  if (!studentId) throw new AppError("Student ID is required", 400);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { degree_id: true },
  });

  if (!student) throw new AppError("Student not found", 404);
  if (!student.degree_id) throw new AppError("Student does not have a degree partner", 404);

  const partialSchema = degreeSchema.partial();
  const validation = partialSchema.safeParse(req.body);
  if (!validation.success) return res.status(400).json({ success: false, errors: validation.error.format() });

  const updateData: Record<string, any> = {
    ...validation.data,
    start_date: validation.data.start_date ? new Date(validation.data.start_date) : undefined,
    end_date: validation.data.end_date ? new Date(validation.data.end_date) : undefined,
  };

  const updatedDegree = await prisma.externalDegree.update({
    where: { id: student.degree_id },
    data: updateData,
  });

  res.status(200).json({
    success: true,
    message: "Degree partner updated",
    externalDegree: updatedDegree,
  });
});

// Delete student's degree partner
export const deleteStudentDegreePartner = catchAsync(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  if (!studentId) throw new AppError("Student ID is required", 400);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { degree_id: true },
  });

  if (!student) throw new AppError("Student not found", 404);
  if (!student.degree_id) throw new AppError("Student does not have a degree partner", 404);

  await prisma.externalDegree.delete({ where: { id: student.degree_id } });
  await prisma.student.update({ where: { id: studentId }, data: { degree_id: null } });

  res.status(204).json({ success: true, message: "Degree partner deleted" });
});
export const getStudentAcademicDetails = catchAsync(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  if (!studentId) {
    throw new AppError("Student ID is required", 400);
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      enrollment_id: true,
      name: true,
      center: { select: { id: true, name: true } },
      school: { select: { id: true, name: true } },
      batch: { select: { id: true, name: true } },
      semester: { select: { id: true, number: true } },
      division: { select: { id: true, code: true } },
    },
  });

  if (!student) {
    throw new AppError("Student not found", 404);
  }

  res.status(200).json({
    success: true,
    data: {
      studentId: student.id,
      enrollmentId: student.enrollment_id,
      name: student.name,
      center: student.center,
      school: student.school,
      batch: student.batch,
      semester: student.semester,
      division: student.division,
    },
  });
});
export const createPersonalDetails = catchAsync(async (req: Request, res: Response) => {
    const { studentId } = req.params;

    if (!studentId) {
        throw new AppError("Student ID is required.", 400);
    }

    await checkStudentExists(studentId);

    const {
        personal_email,
        fathers_name,
        mothers_name,
        fathers_contact_number,
        mothers_contact_number,
        fathers_occupation,
        mothers_occupation,
    }: PersonalDetailsBody = req.body;

    if (!personal_email || typeof personal_email !== "string") {
        throw new AppError("Personal email is required and must be a string.", 400);
    }

    if (!validateEmail(personal_email)) {
        throw new AppError("Invalid email format.", 400);
    }

    const existingDetails = await prisma.personalDetail.findUnique({
        where: { student_id: studentId }
    });

    if (existingDetails) {
        throw new AppError("Personal details already exist for this student.", 400);
    }

    const existingEmail = await prisma.personalDetail.findUnique({
        where: { personal_email }
    });

    if (existingEmail) {
        throw new AppError("This personal email is already in use.", 400);
    }

    const personalDetails = await prisma.personalDetail.create({
        data: {
            student_id: studentId,
            personal_email,
            fathers_name: fathers_name || null,
            mothers_name: mothers_name || null,
            fathers_contact_number: fathers_contact_number || null,
            mothers_contact_number: mothers_contact_number || null,
            fathers_occupation: fathers_occupation || null,
            mothers_occupation: mothers_occupation || null,
        }
    });

    res.status(201).json({
        success: true,
        message: "Personal details created successfully.",
        data: personalDetails
    });
});

export const getStudentContactInfo = catchAsync(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  
  if (!studentId) {
    throw new AppError("Student ID is required", 400);
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      email: true,
      phone: true,
      gender: true,
      address: true,
      name: true, 
    },
  });

  if (!student) {
    throw new AppError("Student not found", 404);
  }

  res.status(200).json({
    success: true,
    data: {
      id: student.id,
      name: student.name,
      email: student.email,
      phone: student.phone,
      gender: student.gender,
      address: student.address,
    },
  });
});
const updateAddressSchema = z.object({
  address: z.string().min(1, "Address is required").max(500, "Address cannot exceed 500 characters").trim(),
});
export const updateStudentAddress = catchAsync(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  
  if (!studentId) {
    throw new AppError("Student ID is required", 400);
  }

  const validation = updateAddressSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      errors: validation.error.format(),
    });
  }

  const { address } = validation.data;

  // Check if student exists
  const studentExists = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true },
  });

  if (!studentExists) {
    throw new AppError("Student not found", 404);
  }

  // Update student address
  const updatedStudent = await prisma.student.update({
    where: { id: studentId },
    data: { 
      address: address,
      updatedAt: new Date(),
    },
    select: {
      id: true,
      name: true,
      address: true,
      updatedAt: true,
    },
  });

  res.status(200).json({
    success: true,
    message: "Address updated successfully",
    data: updatedStudent,
  });
});
export const getPersonalDetails = catchAsync(async (req: Request, res: Response) => {
  const { studentId } = req.params;
  if (!studentId) throw new AppError("Student ID is required.", 400);

  await checkStudentExists(studentId);
  const personalDetails = await prisma.personalDetail.findUnique({
    where: { student_id: studentId }
  });

  res.status(200).json({
    success: true,
    data: personalDetails || {}
  });
});


export const updatePersonalDetails = catchAsync(async (req: Request, res: Response) => {
    const { studentId } = req.params;

    if (!studentId) {
        throw new AppError("Student ID is required.", 400);
    }

    const {
        personal_email,
        fathers_name,
        mothers_name,
        fathers_contact_number,
        mothers_contact_number,
        fathers_occupation,
        mothers_occupation,
    }: Partial<PersonalDetailsBody> = req.body;

    const existingDetails = await prisma.personalDetail.findUnique({
        where: { student_id: studentId }
    });

    if (!existingDetails) {
        throw new AppError("Personal details not found for this student.", 404);
    }

    if (personal_email !== undefined) {
        if (typeof personal_email !== "string" || !validateEmail(personal_email)) {
            throw new AppError("Invalid email format.", 400);
        }

        const existingEmail = await prisma.personalDetail.findFirst({
            where: {
                personal_email,
                student_id: { not: studentId }
            }
        });

        if (existingEmail) {
            throw new AppError("This personal email is already in use.", 400);
        }
    }

    const updateData: Partial<PersonalDetailsBody> & { updatedAt: Date } = {
        updatedAt: new Date()
    };

    if (personal_email !== undefined) updateData.personal_email = personal_email;
    if (fathers_name !== undefined) updateData.fathers_name = fathers_name;
    if (mothers_name !== undefined) updateData.mothers_name = mothers_name;
    if (fathers_contact_number !== undefined) updateData.fathers_contact_number = fathers_contact_number;
    if (mothers_contact_number !== undefined) updateData.mothers_contact_number = mothers_contact_number;
    if (fathers_occupation !== undefined) updateData.fathers_occupation = fathers_occupation;
    if (mothers_occupation !== undefined) updateData.mothers_occupation = mothers_occupation;

    const updatedDetails = await prisma.personalDetail.update({
        where: { student_id: studentId },
        data: updateData
    });

    res.status(200).json({
        success: true,
        message: "Personal details updated successfully.",
        data: updatedDetails
    });
});

export const deletePersonalDetails = catchAsync(async (req: Request, res: Response) => {
    const { studentId } = req.params;
    const userName = req.user?.name || "Unknown user";

    if (!studentId) {
        throw new AppError("Student ID is required.", 400);
    }

    const existingDetails = await prisma.personalDetail.findUnique({
        where: { student_id: studentId }
    });

    if (!existingDetails) {
        throw new AppError("Personal details not found for this student.", 404);
    }

    await prisma.personalDetail.delete({
        where: { student_id: studentId }
    });

    res.status(200).json({
        success: true,
        message: `Personal details deleted successfully by ${userName}.`
    });
});


export const createOrUpdateAcademicHistory = catchAsync(async (req: Request, res: Response) => {
    const { studentId } = req.params;

    if (!studentId) {
        throw new AppError("Student ID is required.", 400);
    }

    await checkStudentExists(studentId);

    const { undergraduate, x_education, xii_education }: AcademicHistoryBody = req.body;

    const validateEducationData = (education: EducationData, type: string) => {
        if (!education.institution || typeof education.institution !== "string") {
            throw new AppError(`${type} institution is required and must be a string.`, 400);
        }
        if (!education.degree || typeof education.degree !== "string") {
            throw new AppError(`${type} degree is required and must be a string.`, 400);
        }
        if (!education.field_of_study || typeof education.field_of_study !== "string") {
            throw new AppError(`${type} field of study is required and must be a string.`, 400);
        }
        if (!education.start_date || !validateDate(education.start_date)) {
            throw new AppError(`${type} start date is required and must be a valid date.`, 400);
        }
        if (education.end_date && !validateDate(education.end_date)) {
            throw new AppError(`${type} end date must be a valid date.`, 400);
        }
        if (education.grade !== undefined && education.grade !== null && (typeof education.grade !== "number" || education.grade < 0 || education.grade > 100)) {
            throw new AppError(`${type} grade must be a number between 0 and 100.`, 400);
        }
    };

    if (undergraduate) validateEducationData(undergraduate, "Undergraduate");
    if (x_education) validateEducationData(x_education, "Class X");
    if (xii_education) validateEducationData(xii_education, "Class XII");

    async function upsertEducation(educationData: EducationData): Promise<string | null> {
        if (!educationData) return null;

        const { id, institution, degree, field_of_study, start_date, end_date, grade } = educationData;

        const data = {
            institution,
            degree,
            field_of_study,
            start_date: new Date(start_date),
            end_date: end_date ? new Date(end_date) : null,
            grade: grade || null
        };

        if (id) {
            const existingEducation = await prisma.education.findUnique({ where: { id } });
            if (!existingEducation) {
                throw new AppError(`Education record with ID ${id} not found.`, 404);
            }

            const updated = await prisma.education.update({
                where: { id },
                data
            });
            return updated.id;
        } else {
            const created = await prisma.education.create({ data });
            return created.id;
        }
    }

    const ugId = undergraduate ? await upsertEducation(undergraduate) : null;
    const xId = x_education ? await upsertEducation(x_education) : null;
    const xiiId = xii_education ? await upsertEducation(xii_education) : null;

    const academicHistory = await prisma.academicHistory.upsert({
        where: { student_id: studentId },
        update: {
            undergraduate: ugId,
            x_education: xId,
            xii_education: xiiId,
        },
        create: {
            student_id: studentId,
            undergraduate: ugId,
            x_education: xId,
            xii_education: xiiId,
        }
    });

    const result = await prisma.academicHistory.findUnique({
        where: { student_id: studentId },
        include: {
            undergrad: true,
            xEducation: true,
            xiiEducation: true,
        }
    });

    res.status(200).json({
        success: true,
        message: "Academic history saved successfully.",
        data: result
    });
});

export const getAcademicHistory = catchAsync(async (req: Request, res: Response) => {
    const { studentId } = req.params;
    if (!studentId) throw new AppError("Student ID is required.", 400);
    
    await checkStudentExists(studentId);
    const academicHistory = await prisma.academicHistory.findUnique({
        where: { student_id: studentId },
        include: {
            undergrad: true,
            xEducation: true,
            xiiEducation: true,
        }
    });

    // Return empty structure if not found
    res.status(200).json({
        success: true,
        data: academicHistory || {
            student_id: studentId,
            undergraduate: null,
            x_education: null,
            xii_education: null,
            undergrad: null,
            xEducation: null,
            xiiEducation: null
        }
    });
});

export const deleteAcademicHistoryByEducationId = catchAsync(async (req: Request, res: Response) => {
    const { studentId, educationId } = req.params;

    if (!studentId || !educationId) {
        throw new AppError("Student ID and Education ID are required.", 400);
    }

    // First, find the academic history for the student
    const academicHistory = await prisma.academicHistory.findUnique({
        where: { student_id: studentId },
        include: {
            undergrad: true,
            xEducation: true,
            xiiEducation: true
        }
    });

    if (!academicHistory) {
        throw new AppError("Academic history not found for this student.", 404);
    }

    // Check which education field matches the educationId and update accordingly
    let updateData: any = {};
    let educationFound = false;

    if (academicHistory.undergraduate === educationId) {
        updateData.undergraduate = null;
        educationFound = true;
    }
    if (academicHistory.x_education === educationId) {
        updateData.x_education = null;
        educationFound = true;
    }
    if (academicHistory.xii_education === educationId) {
        updateData.xii_education = null;
        educationFound = true;
    }

    if (!educationFound) {
        throw new AppError("Education record not found in academic history for this student.", 404);
    }

    // Update the academic history to remove the reference
    await prisma.academicHistory.update({
        where: { student_id: studentId },
        data: updateData
    });

    // Delete the education record
    await prisma.education.delete({
        where: { id: educationId }
    });

    res.status(200).json({
        success: true,
        message: "Education record deleted successfully from academic history."
    });
});



export const getAllProjects = catchAsync(async (req: Request, res: Response) => {
    const { studentId } = req.params;
    if (!studentId) throw new AppError("Student ID is required.", 400);
    
    await checkStudentExists(studentId);
    const projects = await prisma.project.findMany({
        where: { student_id: studentId },
        orderBy: { start_date: 'desc' }
    });

    res.status(200).json({
        success: true,
        count: projects.length,
        data: projects
    });
});

export const getProjectById = catchAsync(async (req: Request, res: Response) => {
    const { studentId, projectId } = req.params;

    if (!studentId) {
        throw new AppError("Student ID is required.", 400);
    }

    if (!projectId) {
        throw new AppError("Project ID is required.", 400);
    }

    const project = await prisma.project.findFirst({
        where: {
            id: projectId,
            student_id: studentId
        }
    });

    if (!project) {
        throw new AppError("Project not found for this student.", 404);
    }

    res.status(200).json({
        success: true,
        data: project
    });
});

export const createProject = catchAsync(async (req: Request, res: Response) => {
    const { studentId } = req.params;

    if (!studentId) {
        throw new AppError("Student ID is required.", 400);
    }

    // Check if student exists
    await checkStudentExists(studentId);

    const {
        name,
        description,
        technologies,
        github_link,
        live_link,
        start_date,
        end_date
    }: ProjectBody = req.body;

    // Validate required fields
    if (!name || typeof name !== "string") {
        throw new AppError("Project name is required and must be a string.", 400);
    }

    if (!start_date || !validateDate(start_date)) {
        throw new AppError("Start date is required and must be a valid date.", 400);
    }

    if (end_date && !validateDate(end_date)) {
        throw new AppError("End date must be a valid date.", 400);
    }

    // Validate URLs if provided
    if (github_link && !validateUrl(github_link)) {
        throw new AppError("Invalid GitHub URL format.", 400);
    }

    if (live_link && !validateUrl(live_link)) {
        throw new AppError("Invalid live URL format.", 400);
    }

    // Validate date logic
    const startDate = new Date(start_date);
    if (end_date) {
        const endDate = new Date(end_date);
        if (endDate < startDate) {
            throw new AppError("End date cannot be before start date.", 400);
        }
    }

    const project = await prisma.project.create({
        data: {
            student_id: studentId,
            name,
            description: description || null,
            technologies: technologies || null,
            github_link: github_link || null,
            live_link: live_link || null,
            start_date: startDate,
            end_date: end_date ? new Date(end_date) : null
        }
    });

    res.status(201).json({
        success: true,
        message: "Project created successfully.",
        data: project
    });
});

export const updateProject = catchAsync(async (req: Request, res: Response) => {
    const { studentId, projectId } = req.params;

    if (!studentId) {
        throw new AppError("Student ID is required.", 400);
    }

    if (!projectId) {
        throw new AppError("Project ID is required.", 400);
    }

    const {
        name,
        description,
        technologies,
        github_link,
        live_link,
        start_date,
        end_date
    }: Partial<ProjectBody> = req.body;

    // Check if project exists and belongs to the student
    const existingProject = await prisma.project.findFirst({
        where: {
            id: projectId,
            student_id: studentId
        }
    });

    if (!existingProject) {
        throw new AppError("Project not found for this student.", 404);
    }

    // Validate fields if provided
    if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
        throw new AppError("Project name must be a non-empty string.", 400);
    }

    if (start_date !== undefined && !validateDate(start_date)) {
        throw new AppError("Start date must be a valid date.", 400);
    }

    if (end_date !== undefined && end_date !== null && !validateDate(end_date)) {
        throw new AppError("End date must be a valid date.", 400);
    }

    if (github_link !== undefined && github_link !== null && !validateUrl(github_link)) {
        throw new AppError("Invalid GitHub URL format.", 400);
    }

    if (live_link !== undefined && live_link !== null && !validateUrl(live_link)) {
        throw new AppError("Invalid live URL format.", 400);
    }

    // Validate date logic if both dates are provided
    const finalStartDate = start_date ? new Date(start_date) : existingProject.start_date;
    const finalEndDate = end_date ? new Date(end_date) : existingProject.end_date;

    if (finalEndDate && finalEndDate < finalStartDate) {
        throw new AppError("End date cannot be before start date.", 400);
    }

    // Build update data
    const updateData: any = { updatedAt: new Date() };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (technologies !== undefined) updateData.technologies = technologies;
    if (github_link !== undefined) updateData.github_link = github_link;
    if (live_link !== undefined) updateData.live_link = live_link;
    if (start_date !== undefined) updateData.start_date = new Date(start_date);
    if (end_date !== undefined) updateData.end_date = end_date ? new Date(end_date) : null;

    const updatedProject = await prisma.project.update({
        where: { id: projectId },
        data: updateData
    });

    res.status(200).json({
        success: true,
        message: "Project updated successfully.",
        data: updatedProject
    });
});

export const deleteProject = catchAsync(async (req: Request, res: Response) => {
    const { studentId, projectId } = req.params;

    if (!studentId) {
        throw new AppError("Student ID is required.", 400);
    }

    if (!projectId) {
        throw new AppError("Project ID is required.", 400);
    }

    // Check if project exists and belongs to the student
    const project = await prisma.project.findFirst({
        where: {
            id: projectId,
            student_id: studentId
        }
    });

    if (!project) {
        throw new AppError("Project not found for this student.", 404);
    }

    await prisma.project.delete({
        where: { id: projectId }
    });

    res.status(200).json({
        success: true,
        message: "Project deleted successfully."
    });
});

export const getAllCertifications = catchAsync(async (req: Request, res: Response) => {
    const { studentId } = req.params;
    if (!studentId) throw new AppError("Student ID is required", 400);
    
    await checkStudentExists(studentId);
    const certifications = await prisma.certification.findMany({
        where: { student_id: studentId },
        orderBy: { start_date: "desc" }
    });

    res.status(200).json({
        success: true,
        count: certifications.length,
        data: certifications,
    });
});

export const getCertificationById = catchAsync(async (req: Request, res: Response) => {
    const { studentId, certificationId } = req.params;
    if (!studentId) throw new AppError("Student ID is required", 400);
    if (!certificationId) throw new AppError("Certification ID is required", 400);

    const certification = await prisma.certification.findFirst({
        where: { id: certificationId, student_id: studentId }
    });

    if (!certification) throw new AppError("Certification not found for this student", 404);

    res.status(200).json({
        success: true,
        data: certification,
    });
});

export const createCertification = catchAsync(async (req: Request, res: Response) => {
    const { studentId } = req.params;
    if (!studentId) throw new AppError("Student ID is required", 400);

    const {
        name,
        organisation,
        start_date,
        end_date,
        link,
    }: CertificationBody = req.body;

    await checkStudentExists(studentId);

    if (!name || typeof name !== "string" || name.trim() === "") {
        throw new AppError("Certification name is required and must be a non-empty string", 400);
    }
    if (!organisation || typeof organisation !== "string" || organisation.trim() === "") {
        throw new AppError("Organisation is required and must be a non-empty string", 400);
    }
    if (!start_date || !validateDate(start_date)) {
        throw new AppError("Start date is required and must be a valid date", 400);
    }
    if (end_date && !validateDate(end_date)) {
        throw new AppError("End date must be a valid date", 400);
    }
    if (link && !validateUrl(link)) {
        throw new AppError("Link must be a valid URL", 400);
    }
    if (end_date && new Date(end_date) < new Date(start_date)) {
        throw new AppError("End date cannot be before start date", 400);
    }

    const certification = await prisma.certification.create({
        data: {
            student_id: studentId,
            name: name.trim(),
            organisation: organisation.trim(),
            start_date: new Date(start_date),
            end_date: end_date ? new Date(end_date) : null,
            link: link ? link.trim() : null,
        }
    });

    res.status(201).json({
        success: true,
        message: "Certification created successfully.",
        data: certification,
    });
});

export const updateCertification = catchAsync(async (req: Request, res: Response) => {
    const { studentId, certificationId } = req.params;
    if (!studentId) throw new AppError("Student ID is required", 400);
    if (!certificationId) throw new AppError("Certification ID is required", 400);

    const {
        name,
        organisation,
        start_date,
        end_date,
        link,
    }: Partial<CertificationBody> = req.body;

    const existing = await prisma.certification.findFirst({
        where: { id: certificationId, student_id: studentId }
    });
    if (!existing) throw new AppError("Certification not found for this student", 404);

    if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
        throw new AppError("Certification name must be a non-empty string", 400);
    }
    if (organisation !== undefined && (typeof organisation !== "string" || organisation.trim() === "")) {
        throw new AppError("Organisation must be a non-empty string", 400);
    }
    if (start_date !== undefined && !validateDate(start_date)) {
        throw new AppError("Start date must be a valid date", 400);
    }
    if (end_date !== undefined && end_date !== null && !validateDate(end_date)) {
        throw new AppError("End date must be a valid date", 400);
    }
    if (link !== undefined && link !== null && !validateUrl(link)) {
        throw new AppError("Link must be a valid URL", 400);
    }
    if (start_date && end_date && new Date(end_date) < new Date(start_date)) {
        throw new AppError("End date cannot be before start date", 400);
    }

    const updatedCertification = await prisma.certification.update({
        where: { id: certificationId },
        data: {
            ...(name !== undefined && { name: name.trim() }),
            ...(organisation !== undefined && { organisation: organisation.trim() }),
            ...(start_date !== undefined && { start_date: new Date(start_date) }),
            ...(end_date !== undefined && { end_date: end_date ? new Date(end_date) : null }),
            ...(link !== undefined && { link: link ? link.trim() : null }),
        }
    });

    res.status(200).json({
        success: true,
        message: "Certification updated successfully.",
        data: updatedCertification,
    });
});

export const deleteCertification = catchAsync(async (req: Request, res: Response) => {
    const { studentId, certificationId } = req.params;
    if (!studentId) throw new AppError("Student ID is required", 400);
    if (!certificationId) throw new AppError("Certification ID is required", 400);

    const certification = await prisma.certification.findFirst({
        where: { id: certificationId, student_id: studentId }
    });

    if (!certification) throw new AppError("Certification not found for this student", 404);

    await prisma.certification.delete({ where: { id: certificationId } });

    res.status(200).json({
        success: true,
        message: "Certification deleted successfully."
    });
});


export const getAllPlacements = catchAsync(async (req: Request, res: Response) => {
    const { studentId } = req.params;
    if (!studentId) throw new AppError("Student ID is required.", 400);
    
    await checkStudentExists(studentId);
    const placements = await prisma.placement.findMany({
        where: { student_id: studentId },
        orderBy: { start_date: "desc" }
    });

    res.status(200).json({
        success: true,
        count: placements.length,
        data: placements,
    });
});

export const getPlacementsById = catchAsync(async (req: Request, res: Response) => {
    const { studentId, placementId } = req.params;
    if (!studentId) throw new AppError("Student ID is required.", 400);
    if (!placementId) throw new AppError("Placement ID is required.", 400);

    const placement = await prisma.placement.findFirst({
        where: { id: placementId, student_id: studentId }
    });
    if (!placement) throw new AppError("Placement not found for this student.", 404);

    res.status(200).json({
        success: true,
        data: placement,
    });
});

export const createPlacements = catchAsync(async (req: Request, res: Response) => {
    const { studentId } = req.params;
    if (!studentId) throw new AppError("Student ID is required.", 400);
    await checkStudentExists(studentId);
    const {
        job_type,
        work_mode,
        role,
        company_name,
        start_date,
        end_date,
        description,
    }: PlacementBody = req.body;

    // Validate
    if (!job_type || !isValidEnumValue(JobType, job_type)) throw new AppError(`job_type required and must be one of: ${Object.values(JobType).join(", ")}`, 400);
    if (!work_mode || !isValidEnumValue(WorkMode, work_mode)) throw new AppError(`work_mode required and must be one of: ${Object.values(WorkMode).join(", ")}`, 400);
    if (!role || typeof role !== "string" || role.trim() === "") throw new AppError("Role is required and must be a non-empty string.", 400);
    if (!company_name || typeof company_name !== "string" || company_name.trim() === "") throw new AppError("Company name is required and must be a non-empty string.", 400);
    if (!start_date || !validateDate(start_date)) throw new AppError("Start date is required and must be a valid date.", 400);
    if (end_date && !validateDate(end_date)) throw new AppError("End date must be a valid date.", 400);
    if (end_date && new Date(end_date) < new Date(start_date)) throw new AppError("End date cannot be before start date.", 400);

    const placement = await prisma.placement.create({
        data: {
            student_id: studentId,
            job_type,
            work_mode,
            role: role.trim(),
            company_name: company_name.trim(),
            start_date: new Date(start_date),
            end_date: end_date ? new Date(end_date) : null,
            description: description || null,
        }
    });

    res.status(201).json({
        success: true,
        message: "Placement created successfully.",
        data: placement,
    });
});

export const updatePlacements = catchAsync(async (req: Request, res: Response) => {
    const { studentId, placementId } = req.params;
    if (!studentId) throw new AppError("Student ID is required.", 400);
    if (!placementId) throw new AppError("Placement ID is required.", 400);

    const existing = await prisma.placement.findFirst({ where: { id: placementId, student_id: studentId } });
    if (!existing) throw new AppError("Placement not found for this student.", 404);

    const {
        job_type,
        work_mode,
        role,
        company_name,
        start_date,
        end_date,
        description,
    }: Partial<PlacementBody> = req.body;

    if (job_type !== undefined && !isValidEnumValue(JobType, job_type)) throw new AppError(`job_type must be one of: ${Object.values(JobType).join(", ")}`, 400);
    if (work_mode !== undefined && !isValidEnumValue(WorkMode, work_mode)) throw new AppError(`work_mode must be one of: ${Object.values(WorkMode).join(", ")}`, 400);
    if (role !== undefined && (typeof role !== "string" || role.trim() === "")) throw new AppError("Role must be a non-empty string.", 400);
    if (company_name !== undefined && (typeof company_name !== "string" || company_name.trim() === "")) throw new AppError("Company name must be a non-empty string.", 400);
    if (start_date !== undefined && !validateDate(start_date)) throw new AppError("Start date must be a valid date.", 400);
    if (end_date !== undefined && end_date !== null && !validateDate(end_date)) throw new AppError("End date must be a valid date.", 400);
    const newStartDate = start_date ? new Date(start_date) : existing.start_date;
    const newEndDate = end_date ? new Date(end_date) : existing.end_date;
    if (newEndDate && newEndDate < newStartDate) throw new AppError("End date cannot be before start date.", 400);

    const updateData: any = { updatedAt: new Date() };
    if (job_type !== undefined) updateData.job_type = job_type;
    if (work_mode !== undefined) updateData.work_mode = work_mode;
    if (role !== undefined) updateData.role = role.trim();
    if (company_name !== undefined) updateData.company_name = company_name.trim();
    if (start_date !== undefined) updateData.start_date = new Date(start_date);
    if (end_date !== undefined) updateData.end_date = end_date ? new Date(end_date) : null;
    if (description !== undefined) updateData.description = description;

    const updated = await prisma.placement.update({
        where: { id: placementId },
        data: updateData,
    });

    res.status(200).json({
        success: true,
        message: "Placement updated successfully.",
        data: updated,
    });
});

export const deletePlacements = catchAsync(async (req: Request, res: Response) => {
    const { studentId, placementId } = req.params;
    if (!studentId) throw new AppError("Student ID is required.", 400);
    if (!placementId) throw new AppError("Placement ID is required.", 400);

    const existing = await prisma.placement.findFirst({
        where: { id: placementId, student_id: studentId }
    });
    if (!existing) throw new AppError("Placement not found for this student.", 404);

    await prisma.placement.delete({ where: { id: placementId } });

    res.status(200).json({
        success: true,
        message: "Placement deleted successfully."
    });
});

export const getAllAchievements = catchAsync(async (req: Request, res: Response) => {
    const { studentId } = req.params;
    if (!studentId) throw new AppError("Student ID is required.", 400);
    
    await checkStudentExists(studentId);
    const achievements = await prisma.achievement.findMany({
        where: { student_id: studentId },
        orderBy: { start_date: "desc" },
    });

    res.status(200).json({
        success: true,
        count: achievements.length,
        data: achievements,
    });
});

export const getAchievementsById = catchAsync(async (req: Request, res: Response) => {
    const { studentId, achievementId } = req.params;
    if (!studentId) throw new AppError("Student ID is required.", 400);
    if (!achievementId) throw new AppError("Achievement ID is required.", 400);

    const achievement = await prisma.achievement.findFirst({
        where: { id: achievementId, student_id: studentId }
    });

    if (!achievement) throw new AppError("Achievement not found for this student", 404);

    res.status(200).json({
        success: true,
        data: achievement,
    });
});

export const createAchievement = catchAsync(async (req: Request, res: Response) => {
    const { studentId } = req.params;
    if (!studentId) throw new AppError("Student ID is required.", 400);

    const {
        title,
        description,
        start_date,
        organisation
    }: AchievementBody = req.body;

    await checkStudentExists(studentId);

    // Validation
    if (!title || typeof title !== "string" || title.trim() === "") {
        throw new AppError("Title is required and must be a non-empty string.", 400);
    }
    if (!start_date || !validateDate(start_date)) {
        throw new AppError("Start date is required and must be a valid date.", 400);
    }
    if (organisation !== undefined && organisation !== null && typeof organisation !== "string") {
        throw new AppError("Organisation (if provided) must be a string.", 400);
    }

    const achievement = await prisma.achievement.create({
        data: {
            student_id: studentId,
            title: title.trim(),
            description: description || null,
            start_date: new Date(start_date),
            organisation: organisation ? organisation.trim() : null
        }
    });

    res.status(201).json({
        success: true,
        message: "Achievement created successfully.",
        data: achievement,
    });
});

export const updateAchievements = catchAsync(async (req: Request, res: Response) => {
    const { studentId, achievementId } = req.params;
    if (!studentId) throw new AppError("Student ID is required.", 400);
    if (!achievementId) throw new AppError("Achievement ID is required.", 400);

    const {
        title,
        description,
        start_date,
        organisation
    }: Partial<AchievementBody> = req.body;

    // Check achievement exists for this student
    const existing = await prisma.achievement.findFirst({
        where: { id: achievementId, student_id: studentId }
    });
    if (!existing) throw new AppError("Achievement not found for this student", 404);

    if (title !== undefined && (typeof title !== "string" || title.trim() === "")) {
        throw new AppError("Title must be a non-empty string.", 400);
    }
    if (start_date !== undefined && !validateDate(start_date)) {
        throw new AppError("Start date must be a valid date.", 400);
    }
    if (organisation !== undefined && organisation !== null && typeof organisation !== "string") {
        throw new AppError("Organisation (if provided) must be a string.", 400);
    }

    const updateData: any = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description;
    if (start_date !== undefined) updateData.start_date = new Date(start_date);
    if (organisation !== undefined) updateData.organisation = organisation ? organisation.trim() : null;

    const updated = await prisma.achievement.update({
        where: { id: achievementId },
        data: updateData,
    });

    res.status(200).json({
        success: true,
        message: "Achievement updated successfully.",
        data: updated,
    });
});

export const deleteAchievements = catchAsync(async (req: Request, res: Response) => {
    const { studentId, achievementId } = req.params;
    if (!studentId) throw new AppError("Student ID is required.", 400);
    if (!achievementId) throw new AppError("Achievement ID is required.", 400);

    const achievement = await prisma.achievement.findFirst({
        where: { id: achievementId, student_id: studentId }
    });
    if (!achievement) throw new AppError("Achievement not found for this student", 404);

    await prisma.achievement.delete({ where: { id: achievementId } });

    res.status(200).json({
        success: true,
        message: "Achievement deleted successfully."
    });
});

export const getAllSocialLinks = catchAsync(async (req: Request, res: Response) => {
    const { studentId } = req.params;
    if (!studentId) throw new AppError("Student ID is required.", 400);
    
    await checkStudentExists(studentId);
    const links = await prisma.socialLink.findMany({
        where: { student_id: studentId },
        orderBy: { createdAt: "desc" }
    });

    res.status(200).json({
        success: true,
        count: links.length,
        data: links,
    });
});
export const getSocialLinksById = catchAsync(async (req: Request, res: Response) => {
    const { studentId, socialLinkId } = req.params;
    if (!studentId) throw new AppError("Student ID is required.", 400);
    if (!socialLinkId) throw new AppError("Social Link ID is required.", 400);

    const socialLink = await prisma.socialLink.findFirst({
        where: { id: socialLinkId, student_id: studentId }
    });

    if (!socialLink) throw new AppError("Social link not found for this student", 404);

    res.status(200).json({
        success: true,
        data: socialLink,
    });
});

export const createSocialLinks = catchAsync(async (req: Request, res: Response) => {
    const { studentId } = req.params;
    if (!studentId) throw new AppError("Student ID is required.", 400);

    const { platform, link }: SocialLinkBody = req.body;
    await checkStudentExists(studentId);

    if (!platform || typeof platform !== "string" || !ALLOWED_PLATFORMS.includes(platform)) {
        throw new AppError(`Platform is required and must be one of: ${ALLOWED_PLATFORMS.join(", ")}`, 400);
    }
    if (!link || typeof link !== "string" || !validateUrl(link)) {
        throw new AppError("Link is required and must be a valid URL.", 400);
    }

    // Check for duplicate platform for student
    const existing = await prisma.socialLink.findFirst({
        where: { student_id: studentId, platform }
    });
    if (existing) throw new AppError(`Social link for platform ${platform} already exists for this student.`, 400);

    const socialLink = await prisma.socialLink.create({
        data: {
            student_id: studentId,
            platform,
            link: link.trim(),
        }
    });

    res.status(201).json({
        success: true,
        message: "Social link created successfully.",
        data: socialLink,
    });
});

export const updateSocialLinks = catchAsync(async (req: Request, res: Response) => {
    const { studentId, socialLinkId } = req.params;
    if (!studentId) throw new AppError("Student ID is required.", 400);
    if (!socialLinkId) throw new AppError("Social Link ID is required.", 400);

    const { platform, link }: Partial<SocialLinkBody> = req.body;

    const existing = await prisma.socialLink.findFirst({
        where: { id: socialLinkId, student_id: studentId }
    });
    if (!existing) throw new AppError("Social link not found for this student.", 404);

    if (platform !== undefined && (!ALLOWED_PLATFORMS.includes(platform))) {
        throw new AppError(`Platform must be one of: ${ALLOWED_PLATFORMS.join(", ")}`, 400);
    }
    if (link !== undefined && (typeof link !== "string" || !validateUrl(link))) {
        throw new AppError("Link must be a valid URL.", 400);
    }
    if (platform && platform !== existing.platform) {
        // Ensure no duplicate for student if changing platform
        const platformExist = await prisma.socialLink.findFirst({ where: { student_id: studentId, platform } });
        if (platformExist) throw new AppError(`Social link for platform ${platform} already exists for this student.`, 400);
    }

    const updateData: any = { updatedAt: new Date() };
    if (platform) updateData.platform = platform;
    if (link) updateData.link = link.trim();

    const updated = await prisma.socialLink.update({
        where: { id: socialLinkId },
        data: updateData,
    });

    res.status(200).json({
        success: true,
        message: "Social link updated successfully.",
        data: updated,
    });
});

export const deleteSocialLinks = catchAsync(async (req: Request, res: Response) => {
    const { studentId, socialLinkId } = req.params;
    if (!studentId) throw new AppError("Student ID is required.", 400);
    if (!socialLinkId) throw new AppError("Social Link ID is required.", 400);

    const existing = await prisma.socialLink.findFirst({
        where: { id: socialLinkId, student_id: studentId }
    });
    if (!existing) throw new AppError("Social link not found for this student", 404);

    await prisma.socialLink.delete({ where: { id: socialLinkId } });

    res.status(200).json({
        success: true,
        message: "Social link deleted successfully."
    });
});

export const getStudentProfiles = catchAsync(async (req: Request, res: Response<ResponseProfileData>) => {
    const { studentId } = req.params;

    // Validate studentId as UUID
    if (!studentId || !uuidValidate(studentId)) {
        throw new AppError("Invalid or missing student ID", 400);
    }

    // Fetch student basic info and is_active status
    const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true, name: true, email: true, is_active: true },
    });

    if (!student) {
        throw new AppError("Student not found", 404);
    }

    if (!student.is_active) {
        throw new AppError("Student account is deactivated", 403);
    }

    // Fetch all profile-related data in parallel for performance
    const [
        personalDetails,
        academicHistory,
        projects,
        certifications,
        placements,
        achievements,
        socialLinks,
    ] = await Promise.all([
        prisma.personalDetail.findUnique({ where: { student_id: studentId } }),
        prisma.academicHistory.findUnique({
            where: { student_id: studentId },
            include: {
                undergrad: true,
                xEducation: true,
                xiiEducation: true,
            },
        }),
        prisma.project.findMany({ where: { student_id: studentId }, orderBy: { start_date: "desc" } }),
        prisma.certification.findMany({ where: { student_id: studentId }, orderBy: { start_date: "desc" } }),
        prisma.placement.findMany({ where: { student_id: studentId }, orderBy: { start_date: "desc" } }),
        prisma.achievement.findMany({ where: { student_id: studentId }, orderBy: { start_date: "desc" } }),
        prisma.socialLink.findMany({ where: { student_id: studentId }, orderBy: { createdAt: "desc" } }),
    ]);

    // Profile sections counting and completion calculation
    const profileSections = [
        personalDetails,
        academicHistory,
        projects.length > 0 ? projects : null,
        certifications.length > 0 ? certifications : null,
        placements.length > 0 ? placements : null,
        achievements.length > 0 ? achievements : null,
        socialLinks.length > 0 ? socialLinks : null,
    ];

    const completedSections = profileSections.filter(section => section !== null).length;
    const totalSections = profileSections.length;
    // Calculate completion percentage
    const completionPercentage = Math.round((completedSections / totalSections) * 100);

    res.status(200).json({
        success: true,
        message: "Student profile retrieved successfully.",
        data: {
            studentInfo: {
                id: student.id,
                name: student.name,
                email: student.email,
                is_active: student.is_active,
            },
            profile: {
                personalDetails,
                academicHistory,
                projects,
                certifications,
                placements,
                achievements,
                socialLinks,
            },
            stats: {
                completionPercentage,
                completedSections,
                totalSections,
                projectsCount: projects.length,
                certificationsCount: certifications.length,
                placementsCount: placements.length,
                achievementsCount: achievements.length,
                socialLinksCount: socialLinks.length,
                personalDetailsExists: personalDetails !== null,
                academicHistoryExists: academicHistory !== null,
            },
        },
    });
});