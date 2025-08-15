import type { Request, Response ,NextFunction} from "express";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/AppError.js";
import { AuthorRole } from "../types/postApi.js";
import { catchAsync } from "../utils/catchAsync.js";

interface CreateSchoolsBody {
  centerId: string;
  schoolNames: string[]; 
}

export const createSchools = catchAsync(async (req: Request<{}, {}, CreateSchoolsBody>, res: Response, next: NextFunction) => {
  const { centerId, schoolNames } = req.body;
  const { role, sub } = req.user!;

  if (!centerId || !Array.isArray(schoolNames) || schoolNames.length === 0) {
    throw new AppError("centerId and non-empty schoolNames array are required", 400);
  }

  const upperCaseNames = schoolNames.map(name => name.trim().toUpperCase());
  const validSchoolNames = ["SOT", "SOM", "SOH"];

  for (const name of upperCaseNames) {
    if (!validSchoolNames.includes(name)) {
      throw new AppError(`Invalid school name: ${name}`, 400);
    }
  }

  if (role === AuthorRole.SUPER_ADMIN) {
    // allowed
  } else if (role === AuthorRole.ADMIN) {
    const center = await prisma.center.findUnique({
      where: { id: centerId },
      select: { business_head: true, academic_head: true }
    });
    if (!center) throw new AppError("Center not found", 404);

    if (center.business_head !== sub && center.academic_head !== sub) {
      throw new AppError("Not authorized to add schools to this center", 403);
    }
  } else {
    throw new AppError("Role not allowed to add schools", 403);
  }

  const schoolsToCreate = upperCaseNames.map(name => ({
    center_id: centerId,
    name: name as "SOT" | "SOM" | "SOH"
  }));

  try {
    await prisma.school.createMany({
      data: schoolsToCreate
    });
  } catch (err: any) {
    if (err.code === "P2002") {
      return next(new AppError("A school with this name already exists in the same center", 400));
    }
    throw err;
  }

  const schools = await prisma.school.findMany({
    where: { center_id: centerId },
    orderBy: { name: "asc" }
  });

  res.status(201).json({
    success: true,
    message: "Schools added successfully",
    data: schools
  });
});


export const getAllSchools = catchAsync(async (
  req: Request,
  res: Response
) => {
  const { centerId } = req.params;

  if(!centerId){
    throw new AppError("centerId required ", 400)
  }
  const { role, sub } = req.user!;

  if (role === AuthorRole.SUPER_ADMIN) {
    const schools = await prisma.school.findMany({
      where: { center_id: centerId },
      orderBy: { name: "asc" },
      select:{id:true,name:true}
    });

    return res.status(200).json({ success: true, count: schools.length, data: schools });
  }

  if (role === AuthorRole.ADMIN) {
    const center = await prisma.center.findUnique({
      where: { id: centerId },
      select: {
        business_head: true,
        academic_head: true
      }
    });

    if (!center) {
      throw new AppError("Center not found", 404);
    }

    if (center.business_head !== sub && center.academic_head !== sub) {
      throw new AppError("Not authorized to access schools of this center", 403);
    }

    const schools = await prisma.school.findMany({
      where: { center_id: centerId },
      orderBy: { name: "asc" },
      select:{id:true,name:true}
    });

    return res.status(200).json({ success: true, count: schools.length, data: schools });
  }

  throw new AppError("Role not permitted", 403);
});

export const deleteSchool = catchAsync(
  async (req: Request, res: Response) => {
    const { centerId, schoolId } = req.params;

    if (!centerId || !schoolId) {
      throw new AppError("CenterId and schoolId are required", 400);
    }

    const { role, sub } = req.user!;

    const center = await prisma.center.findUnique({
      where: { id: centerId },
      select: { business_head: true, academic_head: true }
    });

    if (!center) throw new AppError("Center not found", 404);

    if (role === AuthorRole.ADMIN) {
      if (center.business_head !== sub && center.academic_head !== sub) {
        throw new AppError("Not authorized to delete school in this center", 403);
      }
    } else if (role !== AuthorRole.SUPER_ADMIN) {
      throw new AppError("Role not permitted to delete schools", 403);
    }

    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new AppError("School not found", 404);
    if (school.center_id !== centerId) {
      throw new AppError("School does not belong to the specified center", 400);
    }

    await prisma.school.delete({ where: { id: schoolId } });

    res.status(200).json({
      success: true,
      message: "School deleted successfully"
    });
  }
);
export const getSchoolStats = catchAsync(async (
  req: Request,
  res: Response
) => {
  const { schoolId } = req.params;

  if(!schoolId){
    throw new AppError("School Id required",400)
  }
  const { role, sub } = req.user!;

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      id: true,
      center_id: true,
      batches: true,
      students: true,
      teacherSchools: {
        select: {
          teacher: true
        }
      },
      center: {
        select: {
          business_head: true,
          academic_head: true
        }
      }
    }
  });

  if (!school) {
    throw new AppError("School not found", 404);
  }

  if (role === AuthorRole.ADMIN) {
    const center = school.center;
    if (!center) throw new AppError("Center not found", 404);
    if (center.business_head !== sub && center.academic_head !== sub) {
      throw new AppError("Not authorized to access this school's stats", 403);
    }
  } else if (role !== AuthorRole.SUPER_ADMIN) {
    throw new AppError("Role not permitted to access school stats", 403);
  }

  const [batchCount, divisionCount, studentCount, teacherCount] = await Promise.all([
    prisma.batch.count({ where: { school_id: schoolId } }),
    prisma.division.count({ where: { school_id: schoolId } }),
    prisma.student.count({ where: { school_id: schoolId } }),
    prisma.teacherSchool.count({ where: { school_id: schoolId } }) 
  ]);

  res.status(200).json({
    success: true,
    data: {
      batches: batchCount,
      divisions: divisionCount,
      students: studentCount,
      teachers: teacherCount
    }
  });
});