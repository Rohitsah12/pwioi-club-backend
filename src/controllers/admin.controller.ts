import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/AppError.js";
import { catchAsync } from "../utils/catchAsync.js";
import { RoleType } from "@prisma/client";

interface CreateAdminBody {
    name: string;
    email: string;
    phone: string;
    pwId?: string; // Added pwId field
    designation?: string;
    businessHeadCenters?: number[];
    academicHeadCenters?: number[];
}

export const createAdmin = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
        const {
            name,
            email,
            phone,
            pwId, // Added pwId
            designation,
            businessHeadCenters = [],
            academicHeadCenters = [],
        } = req.body as CreateAdminBody;

        if (!name || !email || !phone) {
            throw new AppError("Missing required fields: name, email, phone", 400);
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

        const adminRole = await prisma.roleAdmin.upsert({
            where: { role: RoleType.ADMIN },
            update: {},
            create: { role: RoleType.ADMIN }
        });

        if (!adminRole) {
            throw new AppError("Role ADMIN not found in RoleAdmin table", 500);
        }

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

        const newAdmin = await prisma.admin.create({
            data: {
                name,
                email,
                phone,
                pwId: pwId || null, // Include pwId in creation
                designation: designation ?? null,
                role_id: adminRole.id,
            },
        });

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
                    pwId: newAdmin.pwId, // Include pwId in response
                    designation: newAdmin.designation,
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
                pwId: true, // Include pwId in select
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

/**
 * @desc    Update an admin
 * @route   PUT /api/admins/:id
 * @access  Private (SUPER_ADMIN, ADMIN)
 */
// export const updateAdmin = catchAsync(
//     async (req: Request, res: Response, next: NextFunction) => {
//         const { id } = req.params;
//         const {
//             name,
//             email,
//             phone,
//             pwId,
//             designation,
//             linkedin,
//             businessHeadCenters = [],
//             academicHeadCenters = [],
//         } = req.body;

//         // Check if admin exists
//         const existingAdmin = await prisma.admin.findUnique({
//             where: { id }
//         });

//         if (!existingAdmin) {
//             throw new AppError("Admin not found", 404);
//         }

//         // Check for unique constraints only if values are being updated
//         const updateData: any = {};

//         if (name !== undefined) updateData.name = name;
//         if (designation !== undefined) updateData.designation = designation;
//         if (linkedin !== undefined) updateData.linkedin = linkedin;

//         if (email && email !== existingAdmin.email) {
//             const existingAdminWithEmail = await prisma.admin.findUnique({
//                 where: { email }
//             });

//             if (existingAdminWithEmail) {
//                 throw new AppError("Admin with this email already exists", 400);
//             }
//             updateData.email = email;
//         }

//         if (phone && phone !== existingAdmin.phone) {
//             const existingAdminWithPhone = await prisma.admin.findUnique({
//                 where: { phone }
//             });

//             if (existingAdminWithPhone) {
//                 throw new AppError("Admin with this phone number already exists", 400);
//             }
//             updateData.phone = phone;
//         }

//         if (pwId !== undefined && pwId !== existingAdmin.pwId) {
//             if (pwId) {
//                 const existingAdminWithPwId = await prisma.admin.findUnique({
//                     where: { pwId }
//                 });

//                 if (existingAdminWithPwId) {
//                     throw new AppError("Admin with this PW ID already exists", 400);
//                 }
//             }
//             updateData.pwId = pwId || null;
//         }

//         // Validate center codes if provided
//         const allCodes = [...new Set([...businessHeadCenters, ...academicHeadCenters])];
//         if (allCodes.length) {
//             const existingCenters = await prisma.center.findMany({
//                 where: { code: { in: allCodes } },
//                 select: { code: true },
//             });
//             const existingCodes = existingCenters.map(c => c.code);
//             const missing = allCodes.filter(code => !existingCodes.includes(code));
//             if (missing.length) {
//                 throw new AppError(`Centers not found for codes: ${missing.join(", ")}`, 400);
//             }
//         }

//         // Update admin basic info
//         const updatedAdmin = await prisma.admin.update({
//             where: { id },
//             data: updateData,
//         });

//         // Update center assignments
//         // First, remove this admin from all centers where they might be assigned
//         await prisma.center.updateMany({
//             where: {
//                 OR: [
//                     { business_head: id },
//                     { academic_head: id }
//                 ]
//             },
//             data: {
//                 business_head: null,
//                 academic_head: null
//             }
//         });

//         // Then assign to new centers
//         if (businessHeadCenters.length) {
//             await prisma.center.updateMany({
//                 where: { code: { in: businessHeadCenters } },
//                 data: { business_head: updatedAdmin.id },
//             });
//         }

//         if (academicHeadCenters.length) {
//             await prisma.center.updateMany({
//                 where: { code: { in: academicHeadCenters } },
//                 data: { academic_head: updatedAdmin.id },
//             });
//         }

//         // Get updated admin with relations
//         const adminWithRelations = await prisma.admin.findUnique({
//             where: { id },
//             select: {
//                 id: true,
//                 name: true,
//                 email: true,
//                 phone: true,
//                 pwId: true,
//                 linkedin: true,
//                 designation: true,
//                 createdAt: true,
//                 updatedAt: true,
//                 role: {
//                     select: {
//                         id: true,
//                         role: true
//                     }
//                 },
//                 businessHeadCenters: {
//                     select: {
//                         id: true,
//                         name: true,
//                         location: true,
//                         code: true
//                     }
//                 },
//                 academicHeadCenters: {
//                     select: {
//                         id: true,
//                         name: true,
//                         location: true,
//                         code: true
//                     }
//                 }
//             }
//         });

//         return res.status(200).json({
//             success: true,
//             message: "Admin updated successfully",
//             data: {
//                 admin: adminWithRelations
//             }
//         });
//     }
// );

/**
 * @desc    Get admin by ID
 * @route   GET /api/admins/:id
 * @access  Private (SUPER_ADMIN, ADMIN)
 */
// export const getAdminById = catchAsync(
//     async (req: Request, res: Response, next: NextFunction) => {
//         const { id } = req.params;

//         const admin = await prisma.admin.findUnique({
//             where: { id },
//             select: {
//                 id: true,
//                 name: true,
//                 email: true,
//                 phone: true,
//                 pwId: true,
//                 linkedin: true,
//                 designation: true,
//                 lastLoginAt: true,
//                 createdAt: true,
//                 updatedAt: true,
//                 role: {
//                     select: {
//                         id: true,
//                         role: true
//                     }
//                 },
//                 businessHeadCenters: {
//                     select: {
//                         id: true,
//                         name: true,
//                         location: true,
//                         code: true
//                     }
//                 },
//                 academicHeadCenters: {
//                     select: {
//                         id: true,
//                         name: true,
//                         location: true,
//                         code: true
//                     }
//                 },
//                 clubOfficials: {
//                     select: {
//                         id: true,
//                         club: {
//                             select: {
//                                 id: true,
//                                 name: true,
//                                 category: true
//                             }
//                         }
//                     }
//                 },
//                 behaviours: {
//                     select: {
//                         id: true,
//                         action: true,
//                         description: true,
//                         createdAt: true,
//                         student: {
//                             select: {
//                                 id: true,
//                                 name: true,
//                                 enrollment_id: true
//                             }
//                         }
//                     },
//                     take: 10,
//                     orderBy: { createdAt: 'desc' }
//                 }
//             }
//         });

//         if (!admin) {
//             throw new AppError("Admin not found", 404);
//         }

//         res.status(200).json({
//             success: true,
//             data: {
//                 admin
//             }
//         });
//     }
// );

/**
 * @desc    Delete an admin
 * @route   DELETE /api/admins/:id
 * @access  Private (SUPER_ADMIN only)
 */
// export const deleteAdmin = catchAsync(
//     async (req: Request, res: Response, next: NextFunction) => {
//         const { id } = req.params;

//         if(!id){
//             throw new AppErro
//         }
//         // Check if admin exists
//         const existingAdmin = await prisma.admin.findUnique({
//             where: { id }
//         });

//         if (!existingAdmin) {
//             throw new AppError("Admin not found", 404);
//         }

//         // Remove admin from center assignments before deletion
//         await prisma.center.updateMany({
//             where: {
//                 OR: [
//                     { business_head: id },
//                     { academic_head: id }
//                 ]
//             },
//             data: {
//                 business_head: null,
//                 academic_head: null
//             }
//         });

//         // Delete the admin
//         await prisma.admin.delete({
//             where: { id!}
//         });

//         res.status(200).json({
//             success: true,
//             message: "Admin deleted successfully"
//         });
//     }
// );