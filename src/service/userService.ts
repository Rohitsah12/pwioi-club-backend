// services/userService.ts
import type { AuthUser, UserRole } from '../auth/types.js';
import { prisma } from '../db/prisma.js';
import type { AuthorRole } from '../types/postApi.js';
import { AppError } from '../utils/AppError.js';

export const findUserByRole = async (id: string, role: UserRole) => {
  const roleMap: Record<UserRole, 'admin' | 'teacher' | 'student'> = {
    SUPER_ADMIN: 'admin',
    ADMIN: 'admin',
    OPS: 'admin',
    BATCHOPS: 'admin',
    TEACHER: 'teacher',
    ASSISTANT_TEACHER: 'teacher',
    STUDENT: 'student'
  };
  const model = roleMap[role];
  if (!model) throw new AppError('Invalid role', 400);
  const user = await (prisma[model] as any).findUnique({ where: { id } });
  if (!user) throw new AppError('User not found', 404);
  return user;
};


export async function findUserById(id: string): Promise<AuthUser | null> {
  const admin = await prisma.admin.findUnique({
    where: { id },
    include: { role: true }, 
  });

  if (admin) {
    return {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role.role as UserRole, 
      designation: admin.designation ?? "",
      phone: admin.phone,
    };
  }

  const teacher = await prisma.teacher.findUnique({
    where: { id },
  });

  if (teacher) {
    return {
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
      role: teacher.role as UserRole,
      designation: teacher.designation || "",
      phone: teacher.phone,
    };
  }

  const student = await prisma.student.findUnique({
    where: { id },
  });

  if (student) {
    return {
      id: student.id,
      name: student.name,
      email: student.email,
      role: "STUDENT",
      phone: student.phone,
    };
  }

  return null;
}