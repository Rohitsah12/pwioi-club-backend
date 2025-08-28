import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/AppError.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AuthorRole } from "@prisma/client";

interface CreateCenterBody {
    name: string;
    location: string;
    code: number;
}

interface AssignHeadsBody {
    businessHeadId?: string;
    academicHeadId?: string;
}

export const createCenter = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
        const { name, location, code } = req.body as CreateCenterBody;

        if (!name || !location || !code) {
            throw new AppError("Missing required fields: name, location, code", 400);
        }

        const existing = await prisma.center.findUnique({ where: { code } });
        if (existing) {
            throw new AppError(`Center code ${code} already exists`, 409);
        }

        const center = await prisma.center.create({
            data: { name, location, code, business_head: null, academic_head: null },
        });

        res.status(201).json({
            success: true,
            message: "Center created successfully",
            data: center,
        });
    }
);
export const updateCenter = catchAsync(async (req: Request, res: Response) => {
    const { centerId } = req.params;
    const { 
        name, 
        location, 
        code, 
        business_head, 
        academic_head 
    } = req.body;

    if (!centerId) {
        throw new AppError("Center ID is required.", 400);
    }

    // Check if center exists
    const existingCenter = await prisma.center.findUnique({
        where: { id: centerId },
        include: {
            businessHead: {
                select: { id: true, name: true, email: true }
            },
            academicHead: {
                select: { id: true, name: true, email: true }
            }
        }
    });

    if (!existingCenter) {
        throw new AppError("Center not found.", 404);
    }

    // Validate unique code if provided
    if (code && code !== existingCenter.code) {
        const codeExists = await prisma.center.findUnique({
            where: { code: code }
        });

        if (codeExists) {
            throw new AppError("Center code already exists.", 400);
        }
    }

    // Validate business head exists if provided
    if (business_head) {
        const businessHead = await prisma.admin.findUnique({
            where: { id: business_head }
        });

        if (!businessHead) {
            throw new AppError("Business head admin not found.", 404);
        }
    }

    // Validate academic head exists if provided
    if (academic_head) {
        const academicHead = await prisma.admin.findUnique({
            where: { id: academic_head }
        });

        if (!academicHead) {
            throw new AppError("Academic head admin not found.", 404);
        }
    }

    // Prepare update data (only include fields that are provided)
    const updateData: any = {};
    
    if (name !== undefined) updateData.name = name;
    if (location !== undefined) updateData.location = location;
    if (code !== undefined) updateData.code = code;
    if (business_head !== undefined) updateData.business_head = business_head;
    if (academic_head !== undefined) updateData.academic_head = academic_head;

    // Add updatedAt timestamp
    updateData.updatedAt = new Date();

    // Update the center
    const updatedCenter = await prisma.center.update({
        where: { id: centerId },
        data: updateData,
        include: {
            businessHead: {
                select: { id: true, name: true, email: true }
            },
            academicHead: {
                select: { id: true, name: true, email: true }
            },
            _count: {
                select: {
                    students: true,
                    teachers: true,
                    batches: true,
                    rooms: true,
                    schools: true
                }
            }
        }
    });

    res.status(200).json({
        success: true,
        message: "Center updated successfully.",
        data: {
            center: updatedCenter
        }
    });
});
export const assignCenterHeads = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const code = Number(req.params.code);
    const { businessHeadId, academicHeadId } = req.body as AssignHeadsBody;

    const center = await prisma.center.findUnique({ where: { code } });
    if (!center) {
      throw new AppError(`Center with code ${code} not found`, 404);
    }

    if (businessHeadId) {
      const admin = await prisma.admin.findUnique({ where: { id: businessHeadId } });
      if (!admin) {
        throw new AppError(`Business head admin ID is invalid`, 400);
      }
    }

    if (academicHeadId) {
      const admin = await prisma.admin.findUnique({ where: { id: academicHeadId } });
      if (!admin) {
        throw new AppError(`Academic head admin ID is invalid`, 400);
      }
    }

    const updated = await prisma.center.update({
      where: { code },
      data: {
        ...(businessHeadId && { business_head: businessHeadId }),
        ...(academicHeadId && { academic_head: academicHeadId }),
      },
      select: {
        id: true,
        name: true,
        location: true,
        code: true,
        createdAt: true,
        updatedAt: true,
        businessHead: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            linkedin: true,
            designation: true,
            lastLoginAt: true
          }
        },
        academicHead: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            linkedin: true,
            designation: true,
            lastLoginAt: true
          }
        }
      }
    });

    res.status(200).json({
      success: true,
      message: "Center heads updated successfully",
      data: updated,
    });
  }
);

export const getAllCenters = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const centers = await prisma.center.findMany({
      select: {
        id: true,
        name: true,
        location: true,
        code: true,
        business_head: true,
        academic_head: true,
        createdAt: true,
        updatedAt: true,
        businessHead: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            linkedin: true,
            designation: true,
            lastLoginAt: true
          }
        },
        academicHead: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            linkedin: true,
            designation: true,
            lastLoginAt: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    res.status(200).json({
      success: true,
      count: centers.length,
      data: centers
    });
  }
);

export const getAllCentersByAdmin = catchAsync(async (
  req: Request,
  res: Response
) => {
  const { adminId } = req.params;

  if(!adminId){
    throw new AppError("Admin Id Required",400)
  }
  const { role, id } = req.user!;

  let centers, stats;

  // Both SUPER_ADMIN and ADMIN now have full access to all centers
  if (role === AuthorRole.SUPER_ADMIN || role === AuthorRole.ADMIN) {
    centers = await prisma.center.findMany({
      include: {
        businessHead: { select: { id: true, name: true, designation: true } },
        academicHead: { select: { id: true, name: true, designation: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // System-wide counts for all centers
    const [
      schools, cohorts, teachers, students, batches, divisions, policy
    ] = await Promise.all([
      prisma.school.count(),
      prisma.cohort.count(),
      prisma.teacher.count(),
      prisma.student.count(),
      prisma.batch.count(),
      prisma.division.count(),
      prisma.policy.count()
    ]);

    stats = {
      schools,
      cohorts,
      teachers,
      students,
      batches,
      divisions,
      policy
    };
  } else {
    throw new AppError("Role not permitted.", 403);
  }

  res.status(200).json({
    success: true,
    count: centers.length,
    data: centers,
    stats
  });
});
