import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";
import { z } from "zod";

const createSubjectSchema = z.object({
  name: z.string().min(1, "Subject name is required").max(100, "Subject name cannot exceed 100 characters"),
  semester_id: z.string().min(1, "Semester ID is required"),
  credits: z.number().int().min(1, "Credits must be a positive integer").max(10, "Credits cannot exceed 10"),
  code: z.string().min(2, "Subject code is required").max(20, "Subject code cannot exceed 20 characters").toUpperCase(),
  teacher_id: z.string().min(1, "Teacher ID is required"),
});

const updateSubjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  semester_id: z.string().min(1).optional(),
  credits: z.number().int().min(1).max(10).optional(),
  code: z.string().min(2).max(20).toUpperCase().optional(),
  teacher_id: z.string().min(1).optional(),
});


export const createSubject = catchAsync(async (req: Request, res: Response) => {
  const validation = createSubjectSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: validation.error.format(),
    });
  }

  const { name, semester_id, credits, code, teacher_id } = validation.data;



  const [semester, teacher] = await Promise.all([
    prisma.semester.findUnique({ where: { id: semester_id } }),
    prisma.teacher.findUnique({ where: { id: teacher_id } })
  ]);

  if (!semester) {
    throw new AppError("Semester not found", 404);
  }

  if (!teacher) {
    throw new AppError("Teacher not found", 404);
  }

  const subject = await prisma.subject.create({
    data: {
      name,
      semester_id,
      credits,
      code,
      teacher_id,
    },
    include: {
      semester: {
        select: {
          id: true,
          number: true,
          division: {
            select: { id: true, code: true }
          }
        }
      },
      teacher: {
        select: {
          id: true,
          name: true,
          email: true,
        }
      }
    }
  });

  res.status(201).json({
    success: true,
    message: "Subject created successfully",
    data: subject,
  });
});


export const getStudentsForSubject = async (req: Request, res: Response) => {
  const { subjectId } = req.params;

  if (!subjectId) {
    throw new AppError("Subject Id Required", 400)
  }

  try {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      include: {
        semester: {
          include: {
            division: true,
          },
        },
      },
    });

    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found.' });
    }


    const students = await prisma.student.findMany({
      where: {
        division_id: subject.semester.division_id,
        is_active: true,
      },
      select: {
        name: true,
        enrollment_id: true,
      },
      orderBy: {
        enrollment_id: 'asc',
      },
    });

    return res.status(200).json({ success: true, data: students });

  } catch (error) {
    console.error('Error fetching students for subject:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

/**
 * @desc    Get all subjects with filtering
 * @route   GET /api/subjects
 * @access  Private (ADMIN, SUPER_ADMIN)
 */
export const getAllSubjects = catchAsync(async (req: Request, res: Response) => {
  const { semester_id, teacher_id, search } = req.query;

  // Build where conditions
  const whereConditions: any = {};

  if (semester_id) {
    whereConditions.semester_id = semester_id as string;
  }

  if (teacher_id) {
    whereConditions.teacher_id = teacher_id as string;
  }

  if (search) {
    whereConditions.OR = [
      { name: { contains: search as string, mode: "insensitive" } },
      { code: { contains: search as string, mode: "insensitive" } },
    ];
  }

  const subjects = await prisma.subject.findMany({
    where: whereConditions,
    include: {
      semester: {
        select: {
          id: true,
          number: true,
          division: {
            select: { id: true, code: true }
          }
        }
      },
      teacher: {
        select: {
          id: true,
          name: true,
          email: true,
        }
      },
      _count: {
        select: {
          classes: true,
          exams: true,
        }
      }
    },
    orderBy: [{ name: "asc" }, { code: "asc" }],
  });

  res.status(200).json({
    success: true,
    count: subjects.length,
    data: subjects,
  });
});

/**
 * @desc    Get subject by ID
 * @route   GET /api/subjects/:subjectId
 * @access  Private (ADMIN, SUPER_ADMIN)
 */
export const getSubjectById = catchAsync(async (req: Request, res: Response) => {
  const { subjectId } = req.params;

  if (!subjectId) {
    throw new AppError("Subject ID is required", 400);
  }

  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    include: {
      semester: {
        select: {
          id: true,
          number: true,
          start_date: true,
          end_date: true,
          division: {
            select: {
              id: true,
              code: true,
              center: { select: { id: true, name: true } },
              school: { select: { id: true, name: true } },
              batch: { select: { id: true, name: true } },
            }
          }
        }
      },
      teacher: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        }
      },
      classes: {
        select: {
          id: true,
          start_date: true,
          end_date: true,
        },
        orderBy: { start_date: "desc" }
      },
      exams: {
        select: {
          id: true,
          name: true,
          exam_date: true,
          full_marks: true,
        },
        orderBy: { exam_date: "desc" }
      },
      _count: {
        select: {
          classes: true,
          exams: true,
        }
      }
    }
  });

  if (!subject) {
    throw new AppError("Subject not found", 404);
  }

  res.status(200).json({
    success: true,
    data: subject,
  });
});

/**
 * @desc    Get subjects by semester
 * @route   GET /api/semesters/:semesterId/subjects
 * @access  Private (ADMIN, SUPER_ADMIN)
 */
export const getSubjectsBySemester = catchAsync(async (req: Request, res: Response) => {
  const { semesterId } = req.params;

  if (!semesterId) {
    throw new AppError("Semester ID is required", 400);
  }

  // Verify semester exists
  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    select: { id: true, number: true, division: { select: { code: true } } }
  });

  if (!semester) {
    throw new AppError("Semester not found", 404);
  }

  const subjects = await prisma.subject.findMany({
    where: { semester_id: semesterId },
    include: {
      teacher: {
        select: {
          id: true,
          name: true,
          email: true,
        }
      },
      _count: {
        select: {
          classes: true,
          exams: true,
        }
      }
    },
    orderBy: { name: "asc" },
  });

  res.status(200).json({
    success: true,
    semester: semester,
    count: subjects.length,
    data: subjects,
  });
});

/**
 * @desc    Get subjects by teacher
 * @route   GET /api/teachers/:teacherId/subjects
 * @access  Private (ADMIN, SUPER_ADMIN)
 */
export const getSubjectsByTeacher = catchAsync(async (req: Request, res: Response) => {
  const { teacherId } = req.params;

  if (!teacherId) {
    throw new AppError("Teacher ID is required", 400);
  }

  // Verify teacher exists
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { id: true, name: true, email: true }
  });

  if (!teacher) {
    throw new AppError("Teacher not found", 404);
  }

  const subjects = await prisma.subject.findMany({
    where: { teacher_id: teacherId },
    include: {
      semester: {
        select: {
          id: true,
          number: true,
          division: {
            select: { id: true, code: true }
          }
        }
      },
      _count: {
        select: {
          classes: true,
          exams: true,
        }
      }
    },
    orderBy: { name: "asc" },
  });

  res.status(200).json({
    success: true,
    teacher: teacher,
    count: subjects.length,
    data: subjects,
  });
});

/**
 * @desc    Update subject
 * @route   PATCH /api/subjects/:subjectId
 * @access  Private (ADMIN, SUPER_ADMIN)
 */
export const updateSubject = catchAsync(async (req: Request, res: Response) => {
  const { subjectId } = req.params;

  if (!subjectId) {
    throw new AppError("Subject ID is required", 400);
  }

  const validation = updateSubjectSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: validation.error.format(),
    });
  }

  const updates = validation.data;

  const existingSubject = await prisma.subject.findUnique({
    where: { id: subjectId },
  });

  if (!existingSubject) {
    throw new AppError("Subject not found", 404);
  }

  const validationPromises: Promise<void>[] = [];

  if (updates.semester_id && updates.semester_id !== existingSubject.semester_id) {
    validationPromises.push(
      prisma.semester.findUnique({ where: { id: updates.semester_id } }).then((semester) => {
        if (!semester) throw new AppError("Semester not found", 404);
      })
    );
  }

  if (updates.teacher_id && updates.teacher_id !== existingSubject.teacher_id) {
    validationPromises.push(
      prisma.teacher.findUnique({ where: { id: updates.teacher_id } }).then((teacher) => {
        if (!teacher) throw new AppError("Teacher not found", 404);
      })
    );
  }

  await Promise.all(validationPromises);

  // Build Prisma update object safely
  const data: any = { updatedAt: new Date() };

  if (updates.name !== undefined) data.name = updates.name;
  if (updates.code !== undefined) data.code = updates.code;
  if (updates.credits !== undefined) data.credits = updates.credits;
  if (updates.semester_id !== undefined) data.semesterId = updates.semester_id;
  if (updates.teacher_id !== undefined) data.teacherId = updates.teacher_id;

  const updatedSubject = await prisma.subject.update({
    where: { id: subjectId },
    data,
    include: {
      semester: {
        select: {
          id: true,
          number: true,
          division: { select: { id: true, code: true } },
        },
      },
      teacher: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  res.status(200).json({
    success: true,
    message: "Subject updated successfully",
    data: updatedSubject,
  });
});
/**
 * @desc    Delete subject (with cascade warnings)
 * @route   DELETE /api/subjects/:subjectId
 * @access  Private (ADMIN, SUPER_ADMIN)
 */
export const deleteSubject = catchAsync(async (req: Request, res: Response) => {
  const { subjectId } = req.params;
  const { force } = req.query;

  if (!subjectId) {
    throw new AppError("Subject ID is required", 400);
  }

  // Check if subject exists and get related data counts
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    include: {
      _count: {
        select: {
          classes: true,
          exams: true,
        }
      },
      semester: {
        select: { number: true, division: { select: { code: true } } }
      }
    }
  });

  if (!subject) {
    throw new AppError("Subject not found", 404);
  }

  // Warn about cascade deletions if force is not specified
  const hasRelatedData = subject._count.classes > 0 || subject._count.exams > 0;

  if (hasRelatedData && force !== 'true') {
    return res.status(200).json({
      success: false,
      message: "Subject has related data that will be deleted",
      warning: {
        classes_count: subject._count.classes,
        exams_count: subject._count.exams,
        cascade_info: "Deleting this subject will also delete all associated classes, exams, attendance records, and exam marks."
      },
      action_required: "Add ?force=true to the URL to confirm deletion"
    });
  }

  // Proceed with deletion (cascade will handle related records)
  await prisma.subject.delete({
    where: { id: subjectId }
  });

  res.status(200).json({
    success: true,
    message: `Subject '${subject.name}' deleted successfully`,
    deleted_data: {
      subject_name: subject.name,
      subject_code: subject.code,
      classes_deleted: subject._count.classes,
      exams_deleted: subject._count.exams,
    }
  });
});

/**
 * @desc    Get subject statistics
 * @route   GET /api/subjects/statistics
 * @access  Private (ADMIN, SUPER_ADMIN)
 */
export const getSubjectStatistics = catchAsync(async (req: Request, res: Response) => {
  const [
    totalSubjects,
    subjectsByCredits,
    subjectsBySemester,
    subjectsWithMostClasses,
    subjectsWithMostExams
  ] = await Promise.all([
    // Total subjects count
    prisma.subject.count(),

    // Subjects grouped by credits
    prisma.subject.groupBy({
      by: ['credits'],
      _count: {
        id: true
      },
      orderBy: { credits: 'asc' }
    }),

    // Subjects per semester
    prisma.subject.groupBy({
      by: ['semester_id'],
      _count: {
        id: true
      },
      orderBy: { _count: { id: 'desc' } }
    }),

    // Subjects with most classes
    prisma.subject.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        _count: {
          select: { classes: true }
        }
      },
      orderBy: {
        classes: { _count: 'desc' }
      }
    }),

    // Subjects with most exams
    prisma.subject.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        _count: {
          select: { exams: true }
        }
      },
      orderBy: {
        exams: { _count: 'desc' }
      }
    })
  ]);

  res.status(200).json({
    success: true,
    data: {
      overview: {
        total_subjects: totalSubjects,
      },
      subjects_by_credits: subjectsByCredits,
      subjects_by_semester: subjectsBySemester,
      most_active_subjects: {
        by_classes: subjectsWithMostClasses,
        by_exams: subjectsWithMostExams,
      }
    }
  });
});



export const getMyOngoingSubjects = catchAsync(async (req: Request, res: Response) => {
  const teacherId = req.user!.id;
  const today = new Date();


  const subjectsWithDetails = await prisma.subject.findMany({
    where: {
      teacher_id: teacherId,
      semester: {
        start_date: {
          lte: today,
        },
        OR: [
          {
            end_date: {
              gte: today,
            },
          },
          {
            end_date: null,
          },
        ],
      },
    },
    select: {
      id: true,
      name: true,
      code: true,
      credits: true,
      semester: {
        select: {
          id: true,
          number: true,
          division: {
            select: {
              id: true,
              code: true,
              batch: {
                select: {
                  name: true,
                },
              },
              school: {
                select: {
                  name: true,
                },
              },
              center: {
                select: {
                  code: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });

  const transformedSubjects = subjectsWithDetails.map((subject) => {
    const division = subject.semester.division;

    const centerCode = division?.center?.code ?? '';
    const schoolName = division?.school?.name ?? '';
    const batchName = division?.batch?.name ?? '';
    const divisionCode = division?.code ?? '';

    const detailedName = `${subject.name} (${centerCode}${schoolName}${batchName}${divisionCode})`;

    return {
      id: subject.id,
      name: detailedName, 
      originalName: subject.name, 
      code: subject.code,
      credits: subject.credits,
      semester: {
        id: subject.semester.id,
        number: subject.semester.number,
        division: {
          id: division.id,
          code: division.code,
        },
      },
    };
  });

  res.status(200).json({
    success: true,
    count: transformedSubjects.length,
    data: transformedSubjects,
  });
});
