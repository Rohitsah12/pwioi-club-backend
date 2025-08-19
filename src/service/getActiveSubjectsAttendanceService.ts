export interface ActiveSubjectAttendance {
    subjectName: string;
    batchName: string;
    divisionName: string;
    semester: number;
    attendancePercentage: number;
}

import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js'

export async function getActiveSubjectsWithAttendance(
  teacherId: string,
): Promise<ActiveSubjectAttendance[]> {
  const query = Prisma.sql`
    SELECT
      s.name AS "subjectName",
      b.name AS "batchName",
      d.code AS "divisionName",
      sem.number AS "semester",
      COALESCE(
        (
          CAST(
            COUNT(a.id) FILTER (WHERE a.status = 'PRESENT') AS DECIMAL
          ) / NULLIF(COUNT(a.id), 0)
        ) * 100,
        0
      ) AS "attendancePercentage"
    FROM "Subject" s
    JOIN "Semester" sem ON s.semester_id = sem.id
    JOIN "Division" d ON sem.division_id = d.id
    JOIN "Batch" b ON d.batch_id = b.id
    LEFT JOIN "Class" c ON c.subject_id = s.id
    LEFT JOIN "Attendance" a ON a.class_id = c.id
    WHERE
      s.teacher_id = ${teacherId}
      AND NOW() BETWEEN d.start_date AND d.end_date
      AND NOW() BETWEEN sem.start_date AND sem.end_date
    GROUP BY
      s.name, b.name, d.code, sem.number
    ORDER BY
      s.name;
  `;

  try {
    const result = await prisma.$queryRaw<ActiveSubjectAttendance[]>(query);

    return result.map((item) => ({
      ...item,
      semester: Number(item.semester),
      attendancePercentage: parseFloat(Number(item.attendancePercentage).toFixed(2)),
    }));
  } catch (error) {
    console.error("Database query failed:", error);
    throw new Error("Failed to fetch teacher's active subjects.");
  }
}