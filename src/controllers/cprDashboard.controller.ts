import type { Request, Response } from 'express';
import { catchAsync } from '../utils/catchAsync.js';
import { prisma } from '../db/prisma.js';
import type { Prisma } from '@prisma/client';
import { divisionProgressSchema, laggingAnalysisSchema, schoolDetailsSchema } from '../schema/cprDashboard.schema.js';
import { AppError } from '../utils/AppError.js';
import excel from 'exceljs';



async function calculateCprSummary(
    subjectId: string, 
    tx: Prisma.TransactionClient | typeof prisma = prisma
) {
    const subject = await tx.subject.findUnique({
        where: { id: subjectId },
        select: {
            id: true,
            name: true,
            code: true,
            teacher: { select: { name: true } },
            semester: {
                select: {
                    division: {
                        select: {
                            code: true,
                            batch: { select: { name: true } },
                            school: { select: { name: true } }, 
                            center: { select: { code: true } },
                        },
                    },
                },
            },
        },
    });

    if (!subject) return null;

    const division = subject.semester?.division;
    const centerCode = division?.center?.code ?? '';
    const schoolName = division?.school?.name ?? ''; // 'SOT', 'SOM', or 'SOH'
    const batchName = division?.batch?.name ?? '';
    const divisionCode = division?.code ?? '';
    const batchcode = `${centerCode}${schoolName}${batchName}${divisionCode}`;

    const allSubTopics = await tx.cprSubTopic.findMany({
        where: { topic: { module: { subject_id: subjectId } } },
        select: { status: true, lecture_number: true, planned_start_date: true },
    });

    const subjectForResponse = {
        id: subject.id,
        name: subject.name,
        code: subject.code,
    };

    if (allSubTopics.length === 0) {
        return {
            subject: subjectForResponse,
            batchcode,
            schoolName,
            teacher_name: subject.teacher?.name ?? 'Not Assigned',
            total_modules: 0,
            total_topics: 0,
            total_sub_topics: 0,
            total_lectures: 0,
            completed_sub_topics: 0,
            in_progress_sub_topics: 0,
            pending_sub_topics: 0,
            completion_percentage: 0,
            expected_completion_lecture: 0,
            actual_completion_lecture: 0,
            completion_lag: 0,
            has_cpr_data: false,
        };
    }

    const totalSubTopicsCount = allSubTopics.length;
    const completedSubTopics = allSubTopics.filter(st => st.status === 'COMPLETED').length;
    const inProgressSubTopics = allSubTopics.filter(st => st.status === 'IN_PROGRESS').length;
    const pendingSubTopics = totalSubTopicsCount - completedSubTopics - inProgressSubTopics;
    const totalLectures = allSubTopics.reduce((max, st) => Math.max(max, st.lecture_number), 0);

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const expectedLectureNumber = allSubTopics
        .filter(st => st.planned_start_date && new Date(st.planned_start_date) <= today)
        .reduce((max, st) => Math.max(max, st.lecture_number), 0);

    const subTopicsByLecture = new Map<number, { completed: number; total: number }>();
    allSubTopics.forEach(subTopic => {
        const lectureNum = subTopic.lecture_number;
        if (!subTopicsByLecture.has(lectureNum)) {
            subTopicsByLecture.set(lectureNum, { completed: 0, total: 0 });
        }
        const group = subTopicsByLecture.get(lectureNum)!;
        group.total++;
        if (subTopic.status === 'COMPLETED') group.completed++;
    });

    let actualLectureProgress = 0;
    const sortedLectures = Array.from(subTopicsByLecture.keys()).sort((a, b) => a - b);
    sortedLectures.forEach(lectureNum => {
        const group = subTopicsByLecture.get(lectureNum)!;
        if (group.total > 0) actualLectureProgress += group.completed / group.total;
    });

    const completionLag = expectedLectureNumber - actualLectureProgress;
    const moduleCount = await tx.cprModule.count({ where: { subject_id: subjectId } });
    const topicCount = await tx.cprTopic.count({ where: { module: { subject_id: subjectId } } });

    return {
        subject: subjectForResponse,
        batchcode,
        schoolName, // <-- Key addition for grouping
        teacher_name: subject.teacher?.name ?? 'Not Assigned',
        total_modules: moduleCount,
        total_topics: topicCount,
        total_sub_topics: totalSubTopicsCount,
        total_lectures: totalLectures,
        completed_sub_topics: completedSubTopics,
        in_progress_sub_topics: inProgressSubTopics,
        pending_sub_topics: pendingSubTopics,
        completion_percentage: totalSubTopicsCount > 0 ? Math.round((completedSubTopics / totalSubTopicsCount) * 100) : 0,
        expected_completion_lecture: expectedLectureNumber,
        actual_completion_lecture: parseFloat(actualLectureProgress.toFixed(2)),
        completion_lag: parseFloat(completionLag.toFixed(2)),
        has_cpr_data: true,
    };
}
const initializeSchoolDashboard = () => ({
    totalTeachers: 0,
    averageProgressRate: 0,
    subjectsAhead: 0,
    subjectsCompleted: 0,
    laggingSubjects: 0,
    subjectsOnTrack: 0,
    details: {
        teachers: [] as { teacherName: string; subjectName: string; batchCode: string }[],
        ahead: [] as { subjectName: string; teacherName: string; batchCode: string }[],
        completed: [] as { subjectName: string; teacherName: string; batchCode: string }[],
        lagging: [] as { subjectName: string; teacherName: string; batchCode: string }[],
        onTrack: [] as { subjectName: string; teacherName: string; batchCode: string }[],
    },
});

export const getCprDashboard = catchAsync(async (req: Request, res: Response) => {
    const today = new Date();

    const ongoingSubjects = await prisma.subject.findMany({
        where: {
            semester: {
                start_date: { lte: today },
                OR: [{ end_date: { gte: today } }, { end_date: null }],
            },
            cprModules: {
                some: { topics: { some: { subTopics: { some: {} } } } }
            }
        },
        select: { id: true },
    });

    if (ongoingSubjects.length === 0) {
        return res.status(200).json({
            success: true,
            message: 'No ongoing subjects with CPR data found.',
            data: {
                SOT: initializeSchoolDashboard(),
                SOM: initializeSchoolDashboard(),
                SOH: initializeSchoolDashboard(),
            },
        });
    }

    const summaryPromises = ongoingSubjects.map(subject => calculateCprSummary(subject.id));
    const allSummaries = (await Promise.all(summaryPromises))
        .filter((s): s is NonNullable<typeof s> => s !== null && s.has_cpr_data);

    const dashboardData = {
        SOT: initializeSchoolDashboard(),
        SOM: initializeSchoolDashboard(),
        SOH: initializeSchoolDashboard(),
    };
    
    const schoolProgressTotals: Record<string, { totalPercentage: number; subjectCount: number; teachers: Set<string> }> = {
        SOT: { totalPercentage: 0, subjectCount: 0, teachers: new Set() },
        SOM: { totalPercentage: 0, subjectCount: 0, teachers: new Set() },
        SOH: { totalPercentage: 0, subjectCount: 0, teachers: new Set() },
    };

    for (const summary of allSummaries) {
        const schoolKey = summary.schoolName as 'SOT' | 'SOM' | 'SOH';

        if (!dashboardData[schoolKey]) continue; 

        const schoolData = dashboardData[schoolKey];
        const progressData = schoolProgressTotals[schoolKey];

        progressData!.totalPercentage += summary.completion_percentage;
        progressData!.subjectCount++;
        
        // Aggregate teacher details and unique teacher count
        if (summary.teacher_name !== 'Not Assigned') {
            schoolData.details.teachers.push({
                teacherName: summary.teacher_name,
                subjectName: summary.subject.name,
                batchCode: summary.batchcode,
            });
            progressData?.teachers.add(summary.teacher_name);
        }
        
        const subjectDetails = {
            subjectName: summary.subject.name,
            teacherName: summary.teacher_name,
            batchCode: summary.batchcode,
        };

        // Categorize subjects based on progress
        if (summary.completion_percentage === 100) {
            schoolData.subjectsCompleted++;
            schoolData.details.completed.push(subjectDetails);
        } else if (summary.completion_lag > 1) {
            schoolData.laggingSubjects++;
            schoolData.details.lagging.push(subjectDetails);
        } else if (summary.completion_lag < -1) {
            schoolData.subjectsAhead++;
            schoolData.details.ahead.push(subjectDetails);
        } else {
            schoolData.subjectsOnTrack++;
            schoolData.details.onTrack.push(subjectDetails);
        }
    }

    // 5. Perform final calculations (average progress, unique teachers)
    for (const school of ['SOT', 'SOM', 'SOH']) {
        const key = school as 'SOT' | 'SOM' | 'SOH';
        const schoolData = dashboardData[key];
        const progressData = schoolProgressTotals[key];

        schoolData.totalTeachers = progressData!!.teachers.size;
        if (progressData!!.subjectCount > 0) {
            schoolData.averageProgressRate = Math.round(progressData!!.totalPercentage / progressData!!.subjectCount);
        }
    }

    // 6. Send the final, structured response
    res.status(200).json({
        success: true,
        data: dashboardData,
    });
});


export const getSchoolCprDetailsByCenter = catchAsync(async (req: Request, res: Response) => {
    const validation = schoolDetailsSchema.safeParse(req.query);
    if (!validation.success) {
        throw new AppError('Invalid query parameters. "school" and "from" are required.', 400);
    }
    const { school, from, to } = validation.data;
    
    const fromDate = from; 
    const toDate = to || new Date(); 

    const semesterDateFilter = {
        AND: [
            { start_date: { lte: toDate } }, 
            {
                OR: [
                    { end_date: { gte: fromDate } }, 
                    { end_date: null } 
                ]
            }
        ]
    };

    const subjects = await prisma.subject.findMany({
        where: {
            semester: {
                division: {
                    school: { name: school }
                },
                ...semesterDateFilter,
            },
            cprModules: { some: { topics: { some: { subTopics: { some: {} } } } } }
        },
        include: {
            cprModules: {
                include: {
                    topics: {
                        include: {
                            subTopics: {
                                select: { 
                                    status: true,
                                    actual_start_date: true,
                                    actual_end_date: true,
                                    planned_start_date: true,
                                    planned_end_date: true
                                }
                            }
                        }
                    }
                }
            },
            semester: {
                select: {
                    start_date: true, // Add semester start date
                    division: {
                        include: {
                            batch: true,
                            center: true
                        }
                    }
                }
            }
        }
    });

    if (subjects.length === 0) {
        return res.status(200).json({
            success: true,
            message: `No subjects with CPR data found for ${school} in the specified date range.`,
            data: [],
        });
    }

    const aggregatedData = new Map<string, {
        centerId: string;
        centerName: string;
        centerCode: number;
        divisions: Map<string, {
            divisionId: string;
            divisionCode: string;
            batchName: string;
            totalSubTopics: number;
            completedSubTopics: number;
            semesterStartDate: Date;        }>;
    }>();

    for (const subject of subjects) {
        const division = subject.semester?.division;
        const center = division?.center;
        const batch = division?.batch;
        const semesterStartDate = subject.semester?.start_date;

        if (!division || !center || !batch || !semesterStartDate) continue; 

        let subjectTotalSubTopics = 0;
        let subjectCompletedSubTopics = 0;
        
        subject.cprModules.forEach(module => {
            module.topics.forEach(topic => {
                topic.subTopics.forEach(subTopic => {
                    const isInDateRange = isSubTopicInDateRange(subTopic, fromDate, toDate);
                    
                    if (isInDateRange) {
                        subjectTotalSubTopics++;
                        if (subTopic.status === 'COMPLETED') {
                            subjectCompletedSubTopics++;
                        }
                    }
                });
            });
        });

        if (subjectTotalSubTopics === 0) continue;

        let centerEntry = aggregatedData.get(center.id);
        if (!centerEntry) {
            centerEntry = {
                centerId: center.id,
                centerName: center.name,
                centerCode: center.code,
                divisions: new Map(),
            };
            aggregatedData.set(center.id, centerEntry);
        }

        let divisionEntry = centerEntry.divisions.get(division.id);
        if (!divisionEntry) {
            divisionEntry = {
                divisionId: division.id,
                divisionCode: division.code,
                batchName: batch.name,
                totalSubTopics: 0,
                completedSubTopics: 0,
                semesterStartDate: semesterStartDate,
            };
            centerEntry.divisions.set(division.id, divisionEntry);
        }
        
        divisionEntry.totalSubTopics += subjectTotalSubTopics;
        divisionEntry.completedSubTopics += subjectCompletedSubTopics;
    }

    const result = Array.from(aggregatedData.values()).map(centerData => ({
        centerId: centerData.centerId,
        centerName: centerData.centerName,
        centerCode: centerData.centerCode,
        divisions: Array.from(centerData.divisions.values()).map(div => {
            const progress = div.totalSubTopics > 0
                ? Math.round((div.completedSubTopics / div.totalSubTopics) * 100)
                : 0;
            return {
                divisionId: div.divisionId,
                batchName: div.batchName,
                divisionCode: div.divisionCode,
                batchCode: `${div.batchName}${div.divisionCode}`,
                progress: progress,
                semesterStartDate: div.semesterStartDate,
            };
        }),
    }));

    res.status(200).json({
        success: true,
        data: result,
    });
});

function isSubTopicInDateRange(
    subTopic: {
        status: string;
        actual_start_date: Date | null;
        actual_end_date: Date | null;
        planned_start_date: Date | null;
        planned_end_date: Date | null;
    },
    fromDate: Date,
    toDate: Date
): boolean {
    const startDate = subTopic.actual_start_date || subTopic.planned_start_date;
    const endDate = subTopic.actual_end_date || subTopic.planned_end_date;

    if (!startDate && !endDate) {
        return true;
    }

    if (startDate && !endDate) {
        return startDate <= toDate && startDate >= fromDate;
    }

    if (!startDate && endDate) {
        return endDate >= fromDate && endDate <= toDate;
    }

    if (startDate && endDate) {
        return startDate <= toDate && endDate >= fromDate;
    }

    return false;
}


export const getDivisionProgressDetails = catchAsync(async (req: Request, res: Response) => {
    const validation = divisionProgressSchema.safeParse(req.query);
    if (!validation.success) {
        throw new AppError(validation.error.issues[0]!.message, 400);
    }
    const { divisionId, from, to } = validation.data;

    // 1. Fetch division and its current semester for date validation
    const division = await prisma.division.findUnique({
        where: { id: divisionId },
        include: { 
            currentSemester: true,
        },
    });

    if (!division || !division.currentSemester) {
        throw new AppError('Division or its current semester not found.', 404);
    }
    const semester = division.currentSemester;
    
    // 2. Validate the provided date range against the semester's dates
    const effectiveFrom = from || semester.start_date;
    const effectiveTo = to || semester.end_date || new Date();

    if (effectiveFrom < semester.start_date || effectiveTo > (semester.end_date || new Date())) {
        throw new AppError(
            `Date range must be within the semester's period: ${semester.start_date.toISOString().split('T')[0]} to ${semester.end_date?.toISOString().split('T')[0] || 'Ongoing'}.`, 
            400
        );
    }

    // 3. Fetch subjects for the division with their CPR data
    const subjects = await prisma.subject.findMany({
        where: {
            semester_id: semester.id,
            cprModules: { 
                some: { 
                    topics: { 
                        some: { 
                            subTopics: { 
                                some: {} 
                            } 
                        } 
                    } 
                } 
            }
        },
        include: {
            teacher: { select: { name: true } },
            cprModules: { 
                include: { 
                    topics: { 
                        include: { 
                            subTopics: {
                                where: {
                                    planned_start_date: {
                                        gte: effectiveFrom,
                                        lte: effectiveTo,
                                    }
                                },
                                select: { 
                                    status: true, 
                                    planned_start_date: true 
                                }
                            } 
                        } 
                    } 
                } 
            }
        }
    });

    const result = subjects.map(subject => {
        let expected_completed_subtopics = 0;
        let actual_completed_subtopics = 0;

        subject.cprModules.forEach(module => 
            module.topics.forEach(topic => {
                expected_completed_subtopics += topic.subTopics.length;
                actual_completed_subtopics += topic.subTopics.filter(
                    subTopic => subTopic.status === 'COMPLETED'
                ).length;
            })
        );

        return {
            subjectId: subject.id,
            subjectName: subject.name,
            teacherName: subject.teacher?.name ?? 'Not Assigned',
            expected_completed_subtopics,
            actual_completed_subtopics
        };
    });

    res.status(200).json({ success: true, data: result });
});

export const getLaggingSubjectsAnalysis = catchAsync(async (req: Request, res: Response) => {
    const validation = laggingAnalysisSchema.safeParse(req.query);
    if (!validation.success) {
        const errorMessage = validation.error.issues[0]?.message || 'Validation failed';
        throw new AppError(errorMessage, 400);
    }
    const { divisionId, from, to } = validation.data;
    const effectiveTo = to || new Date();

    const division = await prisma.division.findUnique({
        where: { id: divisionId },
        include: { 
            currentSemester: true,
        },
    });

    if (!division || !division.currentSemester) {
        throw new AppError('Division or its current semester not found.', 404);
    }
    const semester = division.currentSemester;
    
    const effectiveFrom = from;

    if (effectiveFrom < semester.start_date || effectiveTo > (semester.end_date || new Date())) {
        throw new AppError(
            `Date range must be within the semester's period: ${semester.start_date.toISOString().split('T')[0]} to ${semester.end_date?.toISOString().split('T')[0] || 'Ongoing'}.`, 
            400
        );
    }

    // 3. Find subjects for the specific division with CPR data
    const subjects = await prisma.subject.findMany({
        where: {
            semester_id: semester.id,
            cprModules: { 
                some: { 
                    topics: { 
                        some: { 
                            subTopics: { 
                                some: {} 
                            } 
                        } 
                    } 
                } 
            }
        },
        include: {
            teacher: { select: { name: true } },
            cprModules: { 
                include: { 
                    topics: { 
                        include: { 
                            subTopics: {
                                select: { 
                                    status: true, 
                                    planned_start_date: true, 
                                    lecture_number: true, 
                                    actual_end_date: true 
                                }
                            } 
                        } 
                    } 
                } 
            }
        }
    });

    const laggingSubjects = [];

    for (const subject of subjects) {
        const allSubTopics = subject.cprModules.flatMap(module => 
            module.topics.flatMap(topic => topic.subTopics)
        );
        
        // Find expected and actual completions WITHIN THE DATE RANGE
        const expected_subtopics_in_range = allSubTopics.filter(subTopic => 
            subTopic.planned_start_date && 
            subTopic.planned_start_date >= effectiveFrom && 
            subTopic.planned_start_date <= effectiveTo
        ).length;

        const actual_completed_in_range = allSubTopics.filter(subTopic => 
            subTopic.status === 'COMPLETED' && 
            subTopic.planned_start_date && 
            subTopic.planned_start_date >= effectiveFrom && 
            subTopic.planned_start_date <= effectiveTo
        ).length;

        // Only include subjects that are lagging
        if (actual_completed_in_range < expected_subtopics_in_range) {
            // Calculate lecture progress
            const subTopicsByLecture = new Map<number, { completed: number; total: number }>();
            
            allSubTopics.forEach(subTopic => {
                const lectureNum = subTopic.lecture_number;
                if (!subTopicsByLecture.has(lectureNum)) {
                    subTopicsByLecture.set(lectureNum, { completed: 0, total: 0 });
                }
                const group = subTopicsByLecture.get(lectureNum)!;
                group.total++;
                if (subTopic.status === 'COMPLETED') {
                    group.completed++;
                }
            });

            let actualLectureProgress = 0;
            const sortedLectures = Array.from(subTopicsByLecture.keys()).sort((a, b) => a - b);
            
            sortedLectures.forEach(lectureNum => {
                const group = subTopicsByLecture.get(lectureNum)!;
                if (group.total > 0) {
                    actualLectureProgress += group.completed / group.total;
                }
            });
            
            const expectedLectureNumber = allSubTopics
                .filter(subTopic => 
                    subTopic.planned_start_date && 
                    subTopic.planned_start_date <= effectiveTo
                )
                .reduce((max, subTopic) => Math.max(max, subTopic.lecture_number), 0);

            laggingSubjects.push({
                subjectId: subject.id,
                subjectName: subject.name,
                teacherName: subject.teacher?.name ?? 'Not Assigned',
                expected_subtopics_in_range,
                actual_completed_subtopics: actual_completed_in_range,
                completed_lectures: parseFloat(actualLectureProgress.toFixed(2)),
                lectures_behind: parseFloat((expectedLectureNumber - actualLectureProgress).toFixed(2)),
            });
        }
    }

    res.status(200).json({ success: true, data: laggingSubjects });
});


const calculateDivisionProgress = async (divisionId: string, from?: Date, to?: Date) => {
    const division = await prisma.division.findUnique({
        where: { id: divisionId },
        include: { currentSemester: true },
    });

    if (!division || !division.currentSemester) {
        throw new AppError('Division or its current semester not found.', 404);
    }
    const semester = division.currentSemester;

    const effectiveFrom = from || semester.start_date;
    const effectiveTo = to || new Date();

    // Validate that date range is within current semester bounds
    const semesterEndDate = semester.end_date || new Date();
    if (effectiveFrom < semester.start_date || effectiveTo > semesterEndDate) {
        throw new AppError(
            `Date range must be within the current semester's period: ${semester.start_date.toISOString().split('T')[0]} to ${semester.end_date?.toISOString().split('T')[0] || 'Ongoing'}.`,
            400
        );
    }

    // Additional validation to ensure 'from' is not later than 'to'
    if (effectiveFrom > effectiveTo) {
        throw new AppError(
            `Start date cannot be later than end date.`,
            400
        );
    }

    const subjects = await prisma.subject.findMany({
        where: {
            semester_id: semester.id,
            cprModules: { some: { topics: { some: { subTopics: { some: {} } } } } }
        },
        include: {
            teacher: { select: { name: true } },
            cprModules: {
                include: {
                    topics: {
                        include: {
                            subTopics: {
                                select: {
                                    id: true,
                                    status: true,
                                    lecture_number: true,
                                    planned_start_date: true,
                                    planned_end_date: true,
                                    actual_start_date: true,
                                    actual_end_date: true
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    const result = subjects.map(subject => {
        const allSubTopics = subject.cprModules.flatMap(m => m.topics.flatMap(t => t.subTopics));
        
        if (allSubTopics.length === 0) return null;

        const totalLectures = Math.max(...allSubTopics.map(st => st.lecture_number));

        const subTopicsWithPlannedInRange = allSubTopics.filter(st => {
            const plannedStartDate = st.planned_start_date;
            const plannedEndDate = st.planned_end_date;
            
            if (!plannedStartDate) return false;
            
            if (plannedEndDate) {
                return plannedStartDate <= effectiveTo && plannedEndDate >= effectiveFrom;
            } else {
                return plannedStartDate >= effectiveFrom && plannedStartDate <= effectiveTo;
            }
        });
        
        const allocatedLectures = new Set(subTopicsWithPlannedInRange.map(st => st.lecture_number)).size;

        const actualTopicThatShouldBeCompleted = subTopicsWithPlannedInRange.length;

        const completedSubtopicsInRange = allSubTopics.filter(st => {
            if (st.status !== 'COMPLETED') return false;
            
            const actualEndDate = st.actual_end_date;
            if (!actualEndDate) return false;
            
            return actualEndDate >= effectiveFrom && actualEndDate <= effectiveTo;
        });
        
        const completedSubtopics = completedSubtopicsInRange.length;

        const progress = actualTopicThatShouldBeCompleted > 0 
            ? (completedSubtopics / actualTopicThatShouldBeCompleted) * 100 
            : 0;

        // 6. Ahead/Behind Calculation
        let aheadByBehindBy = 0;
        if (actualTopicThatShouldBeCompleted > 0) {
            const expectedCompletion = actualTopicThatShouldBeCompleted;
            const actualCompletion = completedSubtopics;
            
            if (actualCompletion > expectedCompletion) {
                // Ahead: (actual - expected) / expected * 100
                aheadByBehindBy = ((actualCompletion - expectedCompletion) / expectedCompletion) * 100;
            } else if (actualCompletion < expectedCompletion) {
                aheadByBehindBy = ((actualCompletion - expectedCompletion) / expectedCompletion) * 100;
            }
        }

        let completionLagByLectures = 0;
        
        if (completedSubtopics < actualTopicThatShouldBeCompleted) {
            const incompleteSubtopics = actualTopicThatShouldBeCompleted - completedSubtopics;
            
            const subtopicsByLecture = new Map();
            subTopicsWithPlannedInRange.forEach(st => {
                if (!subtopicsByLecture.has(st.lecture_number)) {
                    subtopicsByLecture.set(st.lecture_number, 0);
                }
                subtopicsByLecture.set(st.lecture_number, subtopicsByLecture.get(st.lecture_number) + 1);
            });
            
            const avgSubtopicsPerLecture = subtopicsByLecture.size > 0 
                ? subTopicsWithPlannedInRange.length / subtopicsByLecture.size 
                : 1;
            
            completionLagByLectures = incompleteSubtopics / avgSubtopicsPerLecture;
        }

        return {
            subject: subject.name,
            teacherName: subject.teacher?.name ?? 'Not Assigned',
            totalLectures,
            allocatedLectures,
            completedSubtopics,
            actualTopicThatShouldBeCompleted,
            progress: `${progress.toFixed(2)}%`,
            aheadByBehindBy: `${aheadByBehindBy.toFixed(2)}%`,
            completionLagByLectures: Math.round(completionLagByLectures * 10) / 10,
        };
    }).filter(Boolean); 

    return result;
};

export const getDivisionCprDetails = catchAsync(async (req: Request, res: Response) => {
    const validation = divisionProgressSchema.safeParse(req.query);
    if (!validation.success) {
        throw new AppError(validation.error.issues[0]!.message, 400);
    }
    const { divisionId, from, to } = validation.data;

    const data = await calculateDivisionProgress(divisionId, from, to);

    res.status(200).json({ success: true, data });
});

export const exportDivisionCprToExcel = catchAsync(async (req: Request, res: Response) => {
    const validation = divisionProgressSchema.safeParse(req.query);
    if (!validation.success) {
        throw new AppError(validation.error.issues[0]!.message, 400);
    }
    const { divisionId, from, to } = validation.data;

    const divisionDetails = await prisma.division.findUnique({
        where: { id: divisionId },
        include: {
            batch: { select: { name: true } },
            currentSemester: true
        }
    });

    if (!divisionDetails) {
        throw new AppError('Division not found.', 404);
    }

    const data = await calculateDivisionProgress(divisionId, from, to);

    const workbook = new excel.Workbook();
    const worksheet = workbook.addWorksheet('Division CPR Progress');

    worksheet.columns = [
        { header: 'Subject', key: 'subject', width: 35 },
        { header: 'Teacher Name', key: 'teacherName', width: 25 },
        { header: 'Total Lectures', key: 'totalLectures', width: 15 },
        { header: 'Allocated Lectures', key: 'allocatedLectures', width: 18 },
        { header: 'Completed Subtopics', key: 'completedSubtopics', width: 20 },
        { header: 'Expected Subtopics', key: 'actualTopicThatShouldBeCompleted', width: 20 },
        { header: 'Progress', key: 'progress', width: 15 },
        { header: 'Ahead By / Behind By', key: 'aheadByBehindBy', width: 20 },
        { header: 'Completion Lag (Lectures)', key: 'completionLagByLectures', width: 25 },
    ];
    
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 12 };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6F3FF' }
    };

    data.forEach((item, index) => {
        const row = worksheet.addRow(item);
        
        if (index % 2 === 0) {
            row.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF8F9FA' }
            };
        }
        
        const progressCell = row.getCell('progress');
        const aheadBehindCell = row.getCell('aheadByBehindBy');
        
        const progressValue = parseFloat(item!.progress.replace('%', ''));
        const aheadBehindValue = parseFloat(item!.aheadByBehindBy.replace('%', ''));
        
        if (progressValue >= 90) {
            progressCell.font = { color: { argb: 'FF008000' }, bold: true }; // Green
        } else if (progressValue >= 70) {
            progressCell.font = { color: { argb: 'FFFF8C00' }, bold: true }; // Orange
        } else {
            progressCell.font = { color: { argb: 'FFDC143C' }, bold: true }; // Red
        }
        
        if (aheadBehindValue > 0) {
            aheadBehindCell.font = { color: { argb: 'FF008000' }, bold: true }; // Green (ahead)
        } else if (aheadBehindValue < 0) {
            aheadBehindCell.font = { color: { argb: 'FFDC143C' }, bold: true }; // Red (behind)
        } else {
            aheadBehindCell.font = { color: { argb: 'FF000000' }, bold: true }; // Black (on track)
        }
    });

    worksheet.columns.forEach(column => {
        if (column.key && column.width) {
            const maxLength = Math.max(
                column.header?.length || 0,
                ...data.map(row => String(row![column.key as keyof typeof row] || '').length)
            );
            column.width = Math.max(column.width, maxLength + 2);
        }
    });

    worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });
    });

    const batchCode = `${divisionDetails.batch.name}${divisionDetails.code}`;
    const effectiveFrom = from || divisionDetails.currentSemester?.start_date || new Date();
    const effectiveTo = to || new Date();
    const fromDateStr = effectiveFrom.toISOString().split('T')[0];
    const toDateStr = effectiveTo.toISOString().split('T')[0];

    const fileName = `Batch_Cpr_Progress_${batchCode}_${fromDateStr}_${toDateStr}.xlsx`;
    res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`
    );

    await workbook.xlsx.write(res);
    res.status(200).end();
});

