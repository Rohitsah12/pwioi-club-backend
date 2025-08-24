import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../utils/AppError.js';
import { z } from 'zod';

// Zod Schemas for Validation
const createClubSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional(),
  center_id: z.string().uuid(),
  leader_enrollment_id: z.string(),
  established_date: z.string().datetime().optional(),
  official_ids: z.array(z.object({ id: z.string().uuid(), type: z.enum(['teacher', 'admin']) })).optional(),
  core_team_enrollment_ids: z.array(z.string()).optional(),
});

const updateClubSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  established_date: z.string().datetime().optional(),
  leader_enrollment_id: z.string().optional(),
  add_officials: z.array(z.object({ id: z.string().uuid(), type: z.enum(['teacher', 'admin']) })).optional(),
  remove_official_ids: z.array(z.string().uuid()).optional(),
  add_core_team_enrollment_ids: z.array(z.string()).optional(),
  remove_core_team_enrollment_ids: z.array(z.string()).optional(),
});


export const createClub = catchAsync(async (req: Request, res: Response) => {
  const validation = createClubSchema.safeParse(req.body);
  if (!validation.success) {
    throw new AppError('Invalid input data.', 400);
  }
  const data = validation.data;

  const newClub = await prisma.$transaction(async (tx) => {
    const leader = await tx.student.findUnique({ where: { enrollment_id: data.leader_enrollment_id } });
    if (!leader) throw new AppError(`Student with enrollment ID ${data.leader_enrollment_id} not found.`, 404);

    const club = await tx.club.create({
      data: {
        name: data.name,
        category: data.category,
        description: data.description,
        center_id: data.center_id,
        leader_id: leader.id,
        established: data.established_date ? new Date(data.established_date) : undefined,
      } as any,
    });

    if (data.official_ids && data.official_ids.length > 0) {
      await tx.clubOfficial.createMany({
        data: data.official_ids.map(official => ({
          club_id: club.id,
          teacher_id: official.type === 'teacher' ? official.id : null,
          admin_id: official.type === 'admin' ? official.id : null,
        })),
      });
    }

    if (data.core_team_enrollment_ids && data.core_team_enrollment_ids.length > 0) {
      const coreTeamStudents = await tx.student.findMany({
        where: { enrollment_id: { in: data.core_team_enrollment_ids } },
        select: { id: true },
      });
      await tx.clubCoreTeam.createMany({
        data: coreTeamStudents.map(student => ({
          club_id: club.id,
          student_id: student.id,
        })),
      });
    }
    return club;
  });

  res.status(201).json({
    success: true,
    message: 'Club created successfully.',
    data: newClub,
  });
});

export const getAllClubs = catchAsync(async (req: Request, res: Response) => {
    const clubs = await prisma.club.findMany({
        include: { center: { select: { name: true } } },
        orderBy: { name: 'asc' }
    });
    res.status(200).json({ success: true, data: clubs });
});

export const getClubsByCenter = catchAsync(async (req: Request, res: Response) => {
    const { centerId } = req.params;
    const clubs = await prisma.club.findMany({
        where: { center_id: centerId! },
        orderBy: { name: 'asc' }
    });
    res.status(200).json({ success: true, data: clubs });
});

export const getClubById = catchAsync(async (req: Request, res: Response) => {
    const { clubId } = req.params;
    const club = await prisma.club.findUnique({
        where: { id: clubId !},
        include: {
            center: { select: { name: true } },
            leader: { select: { name: true, enrollment_id: true } },
            clubOfficials: { include: { teacher: { select: { name: true } }, admin: { select: { name: true } } } },
            coreTeams: { include: { student: { select: { name: true, enrollment_id: true } } } }
        }
    });
    if (!club) throw new AppError('Club not found.', 404);
    res.status(200).json({ success: true, data: club });
});

export const updateClub = catchAsync(async (req: Request, res: Response) => {
    const { clubId } = req.params;
    const validation = updateClubSchema.safeParse(req.body);
    if (!validation.success) {
        throw new AppError('Invalid input data.', 400);
    }
    const data = validation.data;

    const updatedClub = await prisma.$transaction(async (tx) => {
        let leaderId: string | undefined;
        if (data.leader_enrollment_id) {
            const leader = await tx.student.findUnique({ where: { enrollment_id: data.leader_enrollment_id } });
            if (!leader) throw new AppError('New leader not found.', 404);
            leaderId = leader.id;
        }
        await tx.club.update({
            where: { id: clubId! },
            data: {
                name: data.name,
                description: data.description,
                established: data.established_date ? new Date(data.established_date) : undefined,
                leader_id: leaderId,
            } as any
        });

        // 2. Add new officials
        if (data.add_officials && data.add_officials.length > 0) {
            await tx.clubOfficial.createMany({
                data: data.add_officials.map(o => ({
                    club_id: clubId,
                    teacher_id: o.type === 'teacher' ? o.id : null,
                    admin_id: o.type === 'admin' ? o.id : null,
                } as any)),
                skipDuplicates: true,
            });
        }
        
        // 3. Remove officials
        if (data.remove_official_ids && data.remove_official_ids.length > 0) {
            await tx.clubOfficial.deleteMany({
                where: { club_id: clubId!, OR: [ { teacher_id: { in: data.remove_official_ids } }, { admin_id: { in: data.remove_official_ids } } ] }
            });
        }

        // 4. Add core team members
        if (data.add_core_team_enrollment_ids && data.add_core_team_enrollment_ids.length > 0) {
            const students = await tx.student.findMany({ where: { enrollment_id: { in: data.add_core_team_enrollment_ids } } });
            await tx.clubCoreTeam.createMany({
                data: students.map(s => ({ club_id: clubId!, student_id: s.id })),
                skipDuplicates: true,
            });
        }

        // 5. Remove core team members
        if (data.remove_core_team_enrollment_ids && data.remove_core_team_enrollment_ids.length > 0) {
            const students = await tx.student.findMany({ where: { enrollment_id: { in: data.remove_core_team_enrollment_ids } } });
            const studentIds = students.map(s => s.id);
            await tx.clubCoreTeam.deleteMany({
                where: { club_id: clubId!, student_id: { in: studentIds } }
            });
        }

        return tx.club.findUnique({ where: { id: clubId! } });
    });

    res.status(200).json({ success: true, message: 'Club updated successfully.', data: updatedClub });
});


export const deleteClub = catchAsync(async (req: Request, res: Response) => {
    const { clubId } = req.params;
    await prisma.club.delete({ where: { id: clubId! } });
    res.status(204).send();
});
