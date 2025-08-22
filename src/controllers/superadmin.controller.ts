import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";
import { RoleType } from "@prisma/client";
import { AppError } from "../utils/AppError.js";
import { catchAsync } from "../utils/catchAsync.js";
import { tr } from "zod/locales";

export const createSuperAdmin = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
        const { name, email, designation, phone } = req.body;

        if (!name || !email || !designation || !phone) {
            throw new AppError("Missing required fields: name, email, designation, phone", 400);
        }

        const superAdminRole = await prisma.roleAdmin.upsert({
            where: { role: RoleType.SUPER_ADMIN },
            update: {},
            create: { role: RoleType.SUPER_ADMIN }
        });

        const superAdmin = await prisma.admin.create({
    data: {
        name,
        email,
        phone,
        role_id: superAdminRole.id,
        designation
    },
    select: {
        id:true,
        name: true,
        email: true,
        phone: true,
        role_id: true,
        designation: true,
        role: {
            select: {
                id: true,
                role: true,
                // Add other role fields you need
            }
        }
    }
});

        return res.status(201).json({
            status: "success",
            message: "Super admin created successfully",
            data: {
                admin: superAdmin
            }
        });
    }
);

export const getAllSuperAdmin = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const superAdmins = await prisma.admin.findMany({
      where: {
        role: { role: RoleType.SUPER_ADMIN }
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        linkedin: true,
        designation: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        role: {
          select: {
            id: true,
            role: true
          }
        },
        businessHeadCenters: true,
        academicHeadCenters: true
      },
      orderBy: { createdAt: "desc" }
    });

    res.status(200).json({
      success: true,
      count: superAdmins.length,
      data: superAdmins
    });
  }
);


const safeAdminSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  linkedin: true,
  designation: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  role: {
    select: {
      id: true,
      role: true,
      createdAt: true,
      updatedAt: true
    }
  }
};

interface AdminsByRole {
  role: RoleType;
  admins: any[];
  count: number;
}

interface AdminSummary {
  total_admins: number;
  roles_breakdown: {
    [key in RoleType]: number;
  };
  recently_added_admins: number; 
  active_admins: number; 
  admins_with_club_officials: number;
  admins_as_center_heads: number;
}

interface GetAllAdminResponse {
  success: boolean;
  summary: AdminSummary;
  admins_by_role: AdminsByRole[];
  total_count: number;
}

/**
 * @desc    Get all admins grouped by roles with statistics
 * @route   GET /api/super-admin/admins
 * @access  Private (ADMIN, SUPER_ADMIN, OPS, BATCHOPS)
 */
export const getAllAdmin = catchAsync(async (req: Request, res: Response) => {
  // Get all admins with their roles
  const allAdmins = await prisma.admin.findMany({
    select: {
      ...safeAdminSelect,
      behaviours: {
        select: {
          id: true,
          action: true,
          createdAt: true
        },
        take: 5,
        orderBy: { createdAt: 'desc' }
      },
      clubOfficials: {
        select: {
          id: true,
          club: {
            select: {
              id: true,
              name: true,
              category: true
            }
          }
        }
      },
      academicHeadCenters: {
        select: {
          id: true,
          name: true,
          location: true
        }
      },
      businessHeadCenters: {
        select: {
          id: true,
          name: true,
          location: true
        }
      }
    },
    orderBy: [
      { role: { role: 'asc' } },
      { createdAt: 'desc' }
    ]
  });

  const adminsByRole: AdminsByRole[] = [];
  const roleGroups = new Map<RoleType, any[]>();

  Object.values(RoleType).forEach(role => {
    roleGroups.set(role, []);
  });

  allAdmins.forEach(admin => {
    const role = admin.role.role;
    roleGroups.get(role)?.push(admin);
  });

  roleGroups.forEach((admins, role) => {
    adminsByRole.push({
      role,
      admins,
      count: admins.length
    });
  });

  const rolesBreakdown = Object.values(RoleType).reduce((acc, role) => {
    acc[role] = roleGroups.get(role)?.length || 0;
    return acc;
  }, {} as { [key in RoleType]: number });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    recentlyAddedCount,
    activeAdminsCount,
    adminsWithClubOfficialsCount,
    adminsAsCenterHeadsCount
  ] = await Promise.all([
    prisma.admin.count({
      where: {
        createdAt: { gte: thirtyDaysAgo }
      }
    }),
    
    prisma.admin.count({
      where: {
        lastLoginAt: { gte: sevenDaysAgo }
      }
    }),
    
    prisma.admin.count({
      where: {
        clubOfficials: { some: {} }
      }
    }),
    
    prisma.admin.count({
      where: {
        OR: [
          { academicHeadCenters: { some: {} } },
          { businessHeadCenters: { some: {} } }
        ]
      }
    })
  ]);

  const summary: AdminSummary = {
    total_admins: allAdmins.length,
    roles_breakdown: rolesBreakdown,
    recently_added_admins: recentlyAddedCount,
    active_admins: activeAdminsCount,
    admins_with_club_officials: adminsWithClubOfficialsCount,
    admins_as_center_heads: adminsAsCenterHeadsCount
  };

  const response: GetAllAdminResponse = {
    success: true,
    summary,
    admins_by_role: adminsByRole,
    total_count: allAdmins.length
  };

  res.status(200).json(response);
});