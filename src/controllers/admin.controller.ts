import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/AppError.js";
import { catchAsync } from "../utils/catchAsync.js";
import { RoleType } from "@prisma/client";

// Zod Schemas for validation
const createAdminSchema = z.object({
    name: z.string().min(1, "Name is required").max(100, "Name too long"),
    email: z.string().email("Invalid email format"),
    phone: z.string().min(10, "Phone number must be at least 10 digits").max(15, "Phone number too long"),
    pwId: z.string().optional(),
    designation: z.string().optional(),
    linkedin: z.string().url("Invalid LinkedIn URL").optional(),
    businessHeadCenters: z.array(z.number()).default([]),
    academicHeadCenters: z.array(z.number()).default([]),
});

const updateAdminSchema = z.object({
    name: z.string().min(1, "Name is required").max(100, "Name too long").optional(),
    email: z.string().email("Invalid email format").optional(),
    phone: z.string().min(10, "Phone number must be at least 10 digits").max(15, "Phone number too long").optional(),
    pwId: z.string().optional().nullable(),
    designation: z.string().optional().nullable(),
    linkedin: z.string().url("Invalid LinkedIn URL").optional().nullable(),
    businessHeadCenters: z.array(z.number()).default([]),
    academicHeadCenters: z.array(z.number()).default([]),
});

const paramsSchema = z.object({
    adminId: z.string().uuid("Invalid admin ID format"),
});

// Types
type CreateAdminBody = z.infer<typeof createAdminSchema>;
type UpdateAdminBody = z.infer<typeof updateAdminSchema>;
type AdminParams = z.infer<typeof paramsSchema>;


export const createAdmin = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
        // Validate request body
        const validatedData = createAdminSchema.parse(req.body);
        
        const {
            name,
            email,
            phone,
            pwId,
            designation,
            linkedin,
            businessHeadCenters,
            academicHeadCenters,
        } = validatedData;

        // Check if pwId is provided and if it already exists
        if (pwId) {
            const existingAdminWithPwId = await prisma.admin.findUnique({
                where: { pwId }
            });

            if (existingAdminWithPwId) {
                throw new AppError("Admin with this PW ID already exists", 400);
            }
        }

        // Check if email already exists
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

        // Get or create admin role
        const adminRole = await prisma.roleAdmin.upsert({
            where: { role: RoleType.ADMIN },
            update: {},
            create: { role: RoleType.ADMIN }
        });

        // Validate center codes
        const allCodes = [...new Set([...businessHeadCenters, ...academicHeadCenters])];
        if (allCodes.length) {
            const existingCenters = await prisma.center.findMany({
                where: { code: { in: allCodes } },
                select: { code: true },
            });
            const existingCodes = existingCenters.map(c => c.code);
            const missing = allCodes.filter(code => !existingCodes.includes(code));
            if (missing.length) {
                throw new AppError(`Centers not found for codes: ${missing.join(", ")}`, 400);
            }
        }

        // Create admin
        const newAdmin = await prisma.admin.create({
            data: {
                name,
                email,
                phone,
                pwId: pwId || null,
                designation: designation || null,
                linkedin: linkedin || null,
                role_id: adminRole.id,
            },
        });

        // Update center assignments
        if (businessHeadCenters.length) {
            await prisma.center.updateMany({
                where: { code: { in: businessHeadCenters } },
                data: { business_head: newAdmin.id },
            });
        }

        if (academicHeadCenters.length) {
            await prisma.center.updateMany({
                where: { code: { in: academicHeadCenters } },
                data: { academic_head: newAdmin.id },
            });
        }

        res.status(201).json({
            success: true,
            message: "Admin created and assigned successfully",
            data: {
                admin: {
                    id: newAdmin.id,
                    name: newAdmin.name,
                    email: newAdmin.email,
                    phone: newAdmin.phone,
                    pwId: newAdmin.pwId,
                    designation: newAdmin.designation,
                    linkedin: newAdmin.linkedin,
                    role: RoleType.ADMIN,
                    createdAt: newAdmin.createdAt,
                    updatedAt: newAdmin.updatedAt,
                },
            },
        });
    }
);


export const getAllAdmin = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
        const admins = await prisma.admin.findMany({
            where: {
                role: { role: RoleType.ADMIN }
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
            count: admins.length,
            data: admins
        });
    }
);


export const getAdminById = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
        // Validate params
        const { adminId } = paramsSchema.parse(req.params);

        const admin = await prisma.admin.findUnique({
            where: { id: adminId },
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
                behaviours: {
                    select: {
                        id: true,
                        action: true,
                        description: true,
                        createdAt: true,
                        student: {
                            select: {
                                id: true,
                                name: true,
                                enrollment_id: true
                            }
                        }
                    },
                    take: 10,
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        if (!admin) {
            throw new AppError("Admin not found", 404);
        }

        res.status(200).json({
            success: true,
            data: {
                admin
            }
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
  createdAt: true,
  updatedAt: true,
  role: { select: { role: true } },
};

export const updateAdmin = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
        // Validate params
        const { adminId } = paramsSchema.parse(req.params);
        
        // Validate request body
        const validatedData = updateAdminSchema.parse(req.body);
        
        const {
            name,
            email,
            phone,
            pwId,
            designation,
            linkedin,
            businessHeadCenters,
            academicHeadCenters,
        } = validatedData;

        // Check if admin exists
        const existingAdmin = await prisma.admin.findUnique({
            where: { id: adminId }
        });

        if (!existingAdmin) {
            throw new AppError("Admin not found", 404);
        }

        // Check for unique constraints only if values are being updated
        const updateData: any = {};

        if (name !== undefined) updateData.name = name;
        if (designation !== undefined) updateData.designation = designation;
        if (linkedin !== undefined) updateData.linkedin = linkedin;

        if (email && email !== existingAdmin.email) {
            const existingAdminWithEmail = await prisma.admin.findUnique({
                where: { email }
            });

            if (existingAdminWithEmail) {
                throw new AppError("Admin with this email already exists", 400);
            }
            updateData.email = email;
        }

        if (phone && phone !== existingAdmin.phone) {
            const existingAdminWithPhone = await prisma.admin.findUnique({
                where: { phone }
            });

            if (existingAdminWithPhone) {
                throw new AppError("Admin with this phone number already exists", 400);
            }
            updateData.phone = phone;
        }

        if (pwId !== undefined && pwId !== existingAdmin.pwId) {
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

        // Validate center codes if provided
        const allCodes = [...new Set([...businessHeadCenters, ...academicHeadCenters])];
        if (allCodes.length) {
            const existingCenters = await prisma.center.findMany({
                where: { code: { in: allCodes } },
                select: { code: true },
            });
            const existingCodes = existingCenters.map(c => c.code);
            const missing = allCodes.filter(code => !existingCodes.includes(code));
            if (missing.length) {
                throw new AppError(`Centers not found for codes: ${missing.join(", ")}`, 400);
            }
        }

        // Update admin basic info
        const updatedAdmin = await prisma.admin.update({
            where: { id: adminId },
            data: updateData,
        });

        // Update center assignments
        // First, remove this admin from all centers where they might be assigned
        await prisma.center.updateMany({
            where: {
                OR: [
                    { business_head: adminId },
                    { academic_head: adminId }
                ]
            },
            data: {
                business_head: null,
                academic_head: null
            }
        });

        // Then assign to new centers
        if (businessHeadCenters.length) {
            await prisma.center.updateMany({
                where: { code: { in: businessHeadCenters } },
                data: { business_head: updatedAdmin.id },
            });
        }

        if (academicHeadCenters.length) {
            await prisma.center.updateMany({
                where: { code: { in: academicHeadCenters } },
                data: { academic_head: updatedAdmin.id },
            });
        }

        // Get updated admin with relations
        const adminWithRelations = await prisma.admin.findUnique({
            where: { id: adminId },
            select: safeAdminSelect, // Using a shared select for consistency
        });

        return res.status(200).json({
            success: true,
            message: "Admin updated successfully",
            data: adminWithRelations
        });
    }
);


export const deleteAdmin = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
        // Validate params
        const { adminId } = paramsSchema.parse(req.params);

        // Check if admin exists
        const existingAdmin = await prisma.admin.findUnique({
            where: { id: adminId }
        });

        if (!existingAdmin) {
            throw new AppError("Admin not found", 404);
        }

        // Remove admin from center assignments before deletion
        await prisma.center.updateMany({
            where: {
                OR: [
                    { business_head: adminId },
                    { academic_head: adminId }
                ]
            },
            data: {
                business_head: null,
                academic_head: null
            }
        });

        // Delete the admin
        await prisma.admin.delete({
            where: { id: adminId }
        });

        res.status(200).json({
            success: true,
            message: "Admin deleted successfully"
        });
    }
);