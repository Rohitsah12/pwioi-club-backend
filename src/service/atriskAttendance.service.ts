import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/AppError.js';


export const calculateAtRiskStudents = async (divisionId: string, subjectCnt: number, threshold: number) => {
    const now = new Date();

    // 1. Fetch division, semester, subjects, and students
    const division = await prisma.division.findUnique({
        where: { id: divisionId },
        select: {
            code: true,
            school: { select: { name: true } },
            batch: { select: { name: true } },
            center: { select: { code: true } },
            currentSemester: {
                select: {
                    id: true,
                    start_date: true,
                    subjects: {
                        select: { id: true, name: true, code: true }
                    }
                }
            },
            students: {
                where: { is_active: true },
                select: { id: true, name: true, enrollment_id: true }
            }
        }
    });

    if (!division) throw new AppError('Division not found.', 404);
    if (!division.currentSemester) throw new AppError('Division does not have a current semester.', 404);

    const students = division.students;
    const subjects = division.currentSemester.subjects;
    
    if (students.length === 0) {
        return { atRiskStudents: [], divisionDetails: division, totalStudents: 0 };
    }
    
    if (subjects.length === 0) {
        return { atRiskStudents: [], divisionDetails: division, totalStudents: students.length };
    }

    const studentIds = students.map(s => s.id);
    const subjectIds = subjects.map(s => s.id);

    // 2. Get all classes for each subject that have occurred
    const classCountsBySubject = await prisma.class.groupBy({
        by: ['subject_id'],
        where: {
            division_id: divisionId,
            subject_id: { in: subjectIds },
            start_date: { lt: now }
        },
        _count: { id: true }
    });

    const totalClassesMap = new Map(classCountsBySubject.map(item => [item.subject_id, item._count.id]));

    // 3. Get attendance data for each student per subject
    const attendanceData = await prisma.attendance.groupBy({
        by: ['student_id', 'class_id'],
        where: {
            student_id: { in: studentIds },
            status: 'PRESENT',
            class: {
                division_id: divisionId,
                subject_id: { in: subjectIds },
                start_date: { lt: now }
            }
        },
        _count: { id: true }
    });

    // 4. Create a map to get subject_id from class_id
    const classes = await prisma.class.findMany({
        where: { 
            division_id: divisionId, 
            subject_id: { in: subjectIds },
            start_date: { lt: now }
        },
        select: { id: true, subject_id: true }
    });
    const classSubjectMap = new Map(classes.map(c => [c.id, c.subject_id]));

    // 5. Process attendance data by student and subject
    const studentSubjectAttendanceMap = new Map<string, Map<string, number>>();

    for (const record of attendanceData) {
        const studentId = record.student_id;
        const subjectId = classSubjectMap.get(record.class_id);
        if (!subjectId) continue;

        if (!studentSubjectAttendanceMap.has(studentId)) {
            studentSubjectAttendanceMap.set(studentId, new Map());
        }
        
        const subjectMap = studentSubjectAttendanceMap.get(studentId)!;
        const currentCount = subjectMap.get(subjectId) || 0;
        subjectMap.set(subjectId, currentCount + 1);
    }

    // 6. Analyze each student and collect detailed subject information
    const atRiskStudents = [];

    for (const student of students) {
        let subjectsBelowThresholdCount = 0;
        let studentTotalAttended = 0;
        let studentTotalClasses = 0;
        const subjectsBelowThreshold = [];

        for (const subject of subjects) {
            const totalClasses = totalClassesMap.get(subject.id) || 0;
            const attendedClasses = studentSubjectAttendanceMap.get(student.id)?.get(subject.id) || 0;
            
            studentTotalAttended += attendedClasses;
            studentTotalClasses += totalClasses;
            
            if (totalClasses > 0) {
                const percentage = Math.round((attendedClasses / totalClasses) * 100);
                if (percentage < threshold) {
                    subjectsBelowThresholdCount++;
                    subjectsBelowThreshold.push({
                        subjectCode: subject.code,
                        subjectName: subject.name,
                        attendancePercentage: percentage,
                        attendedClasses,
                        totalClasses
                    });
                }
            }
        }

        // Check if student is at risk (has threshold issues in >= subjectCnt subjects)
        if (subjectsBelowThresholdCount >= subjectCnt) {
            const overallAttendance = studentTotalClasses > 0 ? 
                Math.round((studentTotalAttended / studentTotalClasses) * 100) : 0;
                
            atRiskStudents.push({
                studentId: student.id,
                studentName: student.name,
                enrollmentId: student.enrollment_id,
                overallAttendance,
                subjectsBelowThresholdCount,
                subjectsBelowThreshold: subjectsBelowThreshold
            });
        }
    }

    return { 
        atRiskStudents, 
        divisionDetails: division, 
        totalStudents: students.length,
        totalSubjects: subjects.length 
    };
};


export const calculateConsecutiveAbsences = async (
    divisionId: string, 
    numberOfDays: number, 
    fromDate?: Date, 
    toDate?: Date
) => {
    const now = new Date();

    const division = await prisma.division.findUnique({
        where: { id: divisionId },
        select: {
            code: true, 
            school: { select: { name: true } }, 
            batch: { select: { name: true } }, 
            center: { select: { code: true } },
            currentSemester: { 
                select: { 
                    id: true,
                    start_date: true, 
                    end_date: true 
                } 
            },
            students: { 
                where: { is_active: true }, 
                select: { 
                    id: true, 
                    name: true, 
                    enrollment_id: true 
                } 
            }
        }
    });

    if (!division) throw new AppError('Division not found.', 404);
    if (!division.currentSemester) throw new AppError('Division does not have a current semester.', 404);

    const students = division.students;
    if (students.length === 0) {
        return { 
            flaggedStudents: [], 
            divisionDetails: division,
            totalStudents: 0,
            dateRange: { from: fromDate, to: toDate }
        };
    }

    const studentIds = students.map(s => s.id);

    const semesterStart = division.currentSemester.start_date;
    const semesterEnd = division.currentSemester.end_date || now;
    
    if (fromDate && fromDate < semesterStart) {
        const semStartDate = semesterStart.toISOString().split('T')[0];
        throw new AppError(`The 'from' date cannot be earlier than the semester start date (${semStartDate}).`, 400);
    }
    
    const effectiveFrom = fromDate && fromDate > semesterStart ? fromDate : semesterStart;
    const effectiveTo = toDate && toDate < semesterEnd ? toDate : (toDate || semesterEnd);
    
    const finalToDate = effectiveTo > now ? now : effectiveTo;

    const allHeldClasses = await prisma.class.findMany({
        where: {
            division_id: divisionId,
            start_date: { 
                gte: effectiveFrom, 
                lte: finalToDate 
            }
        },
        select: { 
            id: true, 
            start_date: true,
            subject: {
                select: { name: true, code: true }
            }
        },
        orderBy: { start_date: 'asc' }
    });

    if (allHeldClasses.length === 0) {
        return { 
            flaggedStudents: [], 
            divisionDetails: division,
            totalStudents: students.length,
            dateRange: { from: effectiveFrom, to: finalToDate },
            message: "No classes were held in the specified date range."
        };
    }

    const classIds = allHeldClasses.map(c => c.id);
    const allAttendances = await prisma.attendance.findMany({
        where: {
            student_id: { in: studentIds },
            class_id: { in: classIds },
            status: 'PRESENT'
        },
        select: { 
            student_id: true, 
            class_id: true,
            class: { 
                select: { 
                    start_date: true 
                } 
            } 
        }
    });
    
    const instructionalDaysSet = new Set<string>();
    const classDateMap = new Map<string, string>();
    
    allHeldClasses.forEach(classItem => {
        const dateStr = classItem.start_date.toISOString().split('T')[0]!;
        instructionalDaysSet.add(dateStr);
        classDateMap.set(classItem.id, dateStr);
    });
    
    const instructionalDays = Array.from(instructionalDaysSet).sort();

    const studentAttendanceByDate = new Map<string, Set<string>>(); 

    for (const attendance of allAttendances) {
        const studentId = attendance.student_id;
        const dateStr = attendance.class.start_date.toISOString().split('T')[0]!;
        
        if (!studentAttendanceByDate.has(studentId)) {
            studentAttendanceByDate.set(studentId, new Set());
        }
        studentAttendanceByDate.get(studentId)!.add(dateStr);
    }

    const flaggedStudents = [];
    
    for (const student of students) {
        const lastAttendedRecord = await prisma.attendance.findFirst({
            where: { 
                student_id: student.id, 
                status: 'PRESENT',
                class: { 
                    division_id: divisionId,
                    start_date: { 
                        gte: effectiveFrom,
                        lte: finalToDate
                    }
                }
            },
            orderBy: { class: { start_date: 'desc' } },
            select: { 
                class: { 
                    select: { 
                        start_date: true 
                    } 
                } 
            }
        });

        let consecutiveAbsentDays = 0;
        let lastAttendedDate: string | null = null;

        if (lastAttendedRecord) {
            lastAttendedDate = lastAttendedRecord.class.start_date.toISOString().split('T')[0]!;
            
            const lastAttendedIndex = instructionalDays.indexOf(lastAttendedDate);
            
            if (lastAttendedIndex !== -1 && lastAttendedIndex < instructionalDays.length - 1) {
                consecutiveAbsentDays = instructionalDays.length - 1 - lastAttendedIndex;
            }
        } else {
            consecutiveAbsentDays = instructionalDays.length;
            lastAttendedDate = null;
        }

        if (consecutiveAbsentDays >= numberOfDays) {
            const batchCode = `${division.center.code}${division.school.name}${division.batch.name}${division.code}`;
            
            flaggedStudents.push({
                enrollmentId: student.enrollment_id,
                studentName: student.name,
                batchCode: batchCode,
                consecutiveAbsentDays: consecutiveAbsentDays,
                lastAttendedOn: lastAttendedDate || 'Never attended in this period'
            });
        }
    }

    flaggedStudents.sort((a, b) => b.consecutiveAbsentDays - a.consecutiveAbsentDays);

    return { 
        flaggedStudents, 
        divisionDetails: division,
        totalStudents: students.length,
        dateRange: { from: effectiveFrom, to: finalToDate },
        totalInstructionalDays: instructionalDays.length
    };
};