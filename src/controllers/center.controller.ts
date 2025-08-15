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
  const { role, sub } = req.user!;

  let centers, stats;

  if (role === AuthorRole.SUPER_ADMIN) {
    centers = await prisma.center.findMany({
      include: {
        businessHead: { select: { id: true, name: true, designation: true } },
        academicHead: { select: { id: true, name: true, designation: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // System-wide counts
    const [
      schools, cohorts, teachers, students, batches, divisions
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
      divisions
    };

  } else if (role === AuthorRole.ADMIN) {
    if (adminId !== sub) {
      throw new AppError("Admins can only access their own centers.", 403);
    }
    centers = await prisma.center.findMany({
      where: {
        OR: [
          { business_head: adminId },
          { academic_head: adminId },
        ],
      },
      include: {
        businessHead: { select: { id: true, name: true, designation: true } },
        academicHead: { select: { id: true, name: true, designation: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // For these centers, get entity IDs
    const centerIds = centers.map(c => c.id);

    if(!centerIds){
      throw new AppError("Admin is not associated with any centers",400)
    }

    const [
      schools, cohorts, teachers, students, batches, divisions,policy
    ] = await Promise.all([
      prisma.school.count({ where: { center_id: { in: centerIds } } }),
      prisma.cohort.count({ where: { center_id: { in: centerIds } } }),
      prisma.teacher.count({ where: { center_id: { in: centerIds } } }),
      prisma.student.count({ where: { center_id: { in: centerIds } } }),
      prisma.batch.count({ where: { center_id: { in: centerIds } } }),
      prisma.division.count({ where: { center_id: { in: centerIds } } }),
      prisma.policy.count({where:{center_id:{in:centerIds}}})
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
