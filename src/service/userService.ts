// services/userService.ts
import type { UserRole } from '../auth/types.js';
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
