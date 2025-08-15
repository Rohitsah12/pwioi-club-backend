import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/AppError.js";
import { catchAsync } from "../utils/catchAsync.js";
import { RoleType } from "@prisma/client";

interface CreateAdminBody {
    name: string;
    email: string;
    phone: string;
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
            designation,
            businessHeadCenters = [],
            academicHeadCenters = [],
        } = req.body as CreateAdminBody;

        if (!name || !email || !phone) {
            throw new AppError("Missing required fields: name, email, phone", 400);
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
                    designation: newAdmin.designation,
                    role: RoleType.ADMIN,
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
      count: admins.length,
      data: admins
    });
  }
);
