import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";
import { RoleType } from "@prisma/client";
import { AppError } from "../utils/AppError.js";
import { catchAsync } from "../utils/catchAsync.js";

export const createSuperAdmin = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
        const { name, email, designation, phone, pwId } = req.body;

        if (!name || !email || !designation || !phone) {
            throw new AppError("Missing required fields: name, email, designation, phone", 400);
        }

        // Check if pwId is provided and if it already exists
        if (pwId) {
            const existingAdminWithPwId = await prisma.admin.findUnique({
                where: { pwId }
            });

            if (existingAdminWithPwId) {
                throw new AppError("Admin with this PW ID already exists", 400);
            }
        }

        const existingAdminWithEmail = await prisma.admin.findUnique({
            where: { email }
        });

        if (existingAdminWithEmail) {
            throw new AppError("Admin with this email already exists", 400);
        }

        // Check if phone already exists
        const existingAdminWithPhone = await prisma.admin.findUnique({
            where: { phone }
        });

        if (existingAdminWithPhone) {
            throw new AppError("Admin with this phone number already exists", 400);
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
                pwId: pwId || null, // Include pwId if provided
                role_id: superAdminRole.id,
                designation
            },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                pwId: true, // Include pwId in response
                role_id: true,
                designation: true,
                createdAt: true,
                updatedAt: true,
                role: {
                    select: {
                        id: true,
                        role: true,
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
                pwId: true, // Include pwId in response
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
                businessHeadCenters: {
                    select: {
                        id: true,
                        name: true,
                        location: true,
                        code: true
                    }
                },
                academicHeadCenters: {
                    select: {
                        id: true,
                        name: true,
                        location: true,
                        code: true
                    }
                }
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
    pwId: true, 
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
    admins_with_pw_id: number; 
}

interface GetAllAdminResponse {
    success: boolean;
    summary: AdminSummary;
    admins_by_role: AdminsByRole[];
    total_count: number;
}

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
                    location: true,
                    code: true
                }
            },
            businessHeadCenters: {
                select: {
                    id: true,
                    name: true,
                    location: true,
                    code: true
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
        adminsAsCenterHeadsCount,
        adminsWithPwIdCount // New count for admins with PW ID
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
        }),

        prisma.admin.count({
            where: {
                pwId: { not: null }
            }
        })
    ]);

    const summary: AdminSummary = {
        total_admins: allAdmins.length,
        roles_breakdown: rolesBreakdown,
        recently_added_admins: recentlyAddedCount,
        active_admins: activeAdminsCount,
        admins_with_club_officials: adminsWithClubOfficialsCount,
        admins_as_center_heads: adminsAsCenterHeadsCount,
        admins_with_pw_id: adminsWithPwIdCount
    };

    const response: GetAllAdminResponse = {
        success: true,
        summary,
        admins_by_role: adminsByRole,
        total_count: allAdmins.length
    };

    res.status(200).json(response);
});
