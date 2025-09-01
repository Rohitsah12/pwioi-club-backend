import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { RoleType } from "@prisma/client";
import { AppError } from "../utils/AppError.js";
import { catchAsync } from "../utils/catchAsync.js";

// Zod Schemas for validation
const createSuperAdminSchema = z.object({
    name: z.string().min(1, "Name is required").max(100, "Name too long"),
    email: z.string().email("Invalid email format"),
    phone: z.string().min(10, "Phone number must be at least 10 digits").max(15, "Phone number too long"),
    designation: z.string().min(1, "Designation is required").max(100, "Designation too long"),
    pwId: z.string().optional(),
    linkedin: z.string().url("Invalid LinkedIn URL").optional(),
});

const updateSuperAdminSchema = z.object({
    name: z.string().min(1, "Name is required").max(100, "Name too long").optional(),
    email: z.string().email("Invalid email format").optional(),
    phone: z.string().min(10, "Phone number must be at least 10 digits").max(15, "Phone number too long").optional(),
    designation: z.string().min(1, "Designation is required").max(100, "Designation too long").optional(),
    pwId: z.string().optional().nullable(),
    linkedin: z.string().url("Invalid LinkedIn URL").optional().nullable(),
});

const paramsSchema = z.object({
    superadminId: z.string().uuid("Invalid superadmin ID format"),
});

// Types
type CreateSuperAdminBody = z.infer<typeof createSuperAdminSchema>;
type UpdateSuperAdminBody = z.infer<typeof updateSuperAdminSchema>;
type SuperAdminParams = z.infer<typeof paramsSchema>;


export const createSuperAdmin = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
        // Validate request body
        const validatedData = createSuperAdminSchema.parse(req.body);
        
        const { name, email, designation, phone, pwId, linkedin } = validatedData;

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
                pwId: pwId || null,
                linkedin: linkedin || null,
                role_id: superAdminRole.id,
                designation
            },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                pwId: true,
                linkedin: true,
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
            success: true,
            message: "Super admin created successfully",
            data: {
                admin: superAdmin
            }
        });
    }
);

/**
 * @desc    Get all super admins
 * @route   GET /api/superadmins/all
 * @access  Private (SUPER_ADMIN, ADMIN, BATCHOPS, OPS)
 */
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
                pwId: true,
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

/**
 * @desc    Get super admin by ID
 * @route   GET /api/superadmins/:superadminId
 * @access  Private (SUPER_ADMIN, ADMIN, BATCHOPS, OPS)
 */
export const getSuperAdminById = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
        // Validate params
        const { superadminId } = paramsSchema.parse(req.params);

        const superAdmin = await prisma.admin.findUnique({
            where: { 
                id: superadminId,
                role: { role: RoleType.SUPER_ADMIN }
            },
            select: {
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
            }
        });

        if (!superAdmin) {
            throw new AppError("Super admin not found", 404);
        }

        res.status(200).json({
            success: true,
            data: {
                admin: superAdmin
            }
        });
    }
);


export const updateSuperAdmin = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
        // Validate params
        const { superadminId } = paramsSchema.parse(req.params);
        
        // Validate request body
        const validatedData = updateSuperAdminSchema.parse(req.body);
        
        const { name, email, phone, designation, pwId, linkedin } = validatedData;

        // Check if super admin exists
        const existingSuperAdmin = await prisma.admin.findUnique({
            where: { 
                id: superadminId,
                role: { role: RoleType.SUPER_ADMIN }
            }
        });

        if (!existingSuperAdmin) {
            throw new AppError("Super admin not found", 404);
        }

        // Check for unique constraints only if values are being updated
        const updateData: any = {};

        if (name !== undefined) updateData.name = name;
        if (designation !== undefined) updateData.designation = designation;
        if (linkedin !== undefined) updateData.linkedin = linkedin;

        if (email && email !== existingSuperAdmin.email) {
            const existingAdminWithEmail = await prisma.admin.findUnique({
                where: { email }
            });

            if (existingAdminWithEmail) {
                throw new AppError("Admin with this email already exists", 400);
            }
            updateData.email = email;
        }

        if (phone && phone !== existingSuperAdmin.phone) {
            const existingAdminWithPhone = await prisma.admin.findUnique({
                where: { phone }
            });

            if (existingAdminWithPhone) {
                throw new AppError("Admin with this phone number already exists", 400);
            }
            updateData.phone = phone;
        }

        if (pwId !== undefined && pwId !== existingSuperAdmin.pwId) {
            if (pwId) {
                const existingAdminWithPwId = await prisma.admin.findUnique({
                    where: { pwId }
                });

                if (existingAdminWithPwId) {
                    throw new AppError("Admin with this PW ID already exists", 400);
                }
            }
            updateData.pwId = pwId || null;
        }

        // Update super admin basic info
        const updatedSuperAdmin = await prisma.admin.update({
            where: { id: superadminId },
            data: updateData,
            select: safeAdminSelect, // Using a shared select for consistency
        });

        // Corrected Response Structure
        return res.status(200).json({
            success: true,
            message: "Super admin updated successfully",
            data: updatedSuperAdmin
        });
    }
);

/**
 * @desc    Delete a super admin
 * @route   DELETE /api/superadmins/:superadminId
 * @access  Private (SUPER_ADMIN only)
 */
export const deleteSuperAdmin = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
        // Validate params
        const { superadminId } = paramsSchema.parse(req.params);

        // Check if super admin exists
        const existingSuperAdmin = await prisma.admin.findUnique({
            where: { 
                id: superadminId,
                role: { role: RoleType.SUPER_ADMIN }
            }
        });

        if (!existingSuperAdmin) {
            throw new AppError("Super admin not found", 404);
        }

        // Check if this is the last super admin (prevent deletion of all super admins)
        const superAdminCount = await prisma.admin.count({
            where: {
                role: { role: RoleType.SUPER_ADMIN }
            }
        });

        if (superAdminCount <= 1) {
            throw new AppError("Cannot delete the last super admin", 400);
        }

        // Remove super admin from center assignments before deletion
        await prisma.center.updateMany({
            where: {
                OR: [
                    { business_head: superadminId },
                    { academic_head: superadminId }
                ]
            },
            data: {
                business_head: null,
                academic_head: null
            }
        });

        // Delete the super admin
        await prisma.admin.delete({
            where: { id: superadminId }
        });

        res.status(200).json({
            success: true,
            message: "Super admin deleted successfully"
        });
    }
);

// Keep your existing comprehensive getAllAdmin function
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

/**
 * @desc    Get all admins with comprehensive summary
 * @route   GET /api/superadmins
 * @access  Private (SUPER_ADMIN, ADMIN, BATCHOPS, OPS)
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
        adminsWithPwIdCount
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