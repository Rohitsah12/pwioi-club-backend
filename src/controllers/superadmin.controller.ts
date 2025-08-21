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
