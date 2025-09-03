import { prisma } from "../db/prisma.js";
import type { CprModule, Subject } from "@prisma/client";

interface SubTopic {
    lecture_number: number;
    status: string;
    planned_start_date?: Date | string | null;
}

interface Topic {
    subTopics: SubTopic[];
}

interface CprModuleWithTopics extends CprModule {
    topics: Topic[];
}

export async function getOngoingSubjectsForSchool(centerId: string, schoolId: string) {
    const today = new Date();
    const subjects = await prisma.subject.findMany({
        where: {
            semester: {
                division: {
                    center_id: centerId,
                    school_id: schoolId,
                },
                start_date: { lte: today },
                end_date: { gte: today },
            },
        },
        include: { teacher: true },
    });
    return subjects;
}

export function calculateCprSummaryForSubject(
    cprModules: CprModuleWithTopics[], 
    subject: Subject & { teacher: any }
) {
    const allSubTopics = cprModules.flatMap(m => m.topics.flatMap((t: Topic) => t.subTopics));
    const totalSubTopics = allSubTopics.length;
    
    const completedSubTopics = allSubTopics.filter(st => st.status === 'COMPLETED').length;
    
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const expectedLectureNumber = allSubTopics
        .filter(st => st.planned_start_date && new Date(st.planned_start_date) <= today)
        .reduce((max, st) => Math.max(max, st.lecture_number), 0);

    const subTopicsByLecture = new Map<number, { completed: number; total: number }>();
    for (const subTopic of allSubTopics) {
        const lectureNum = subTopic.lecture_number;
        if (!subTopicsByLecture.has(lectureNum)) {
            subTopicsByLecture.set(lectureNum, { completed: 0, total: 0 });
        }
        const lectureGroup = subTopicsByLecture.get(lectureNum)!;
        lectureGroup.total++;
        if (subTopic.status === 'COMPLETED') {
            lectureGroup.completed++;
        }
    }

    let actualLectureProgress = 0;
    const sortedLectures = Array.from(subTopicsByLecture.keys()).sort((a, b) => a - b);
    for (const lectureNum of sortedLectures) {
        const group = subTopicsByLecture.get(lectureNum)!;
        if (group.total > 0) {
            actualLectureProgress += group.completed / group.total;
        }
    }
  
    const completionLag = expectedLectureNumber - actualLectureProgress;

    return {
      subject_name: subject.name,
      teacher_name: subject.teacher?.name ?? 'N/A',
      expected_completion_lecture: expectedLectureNumber,
      actual_completion_lecture: parseFloat(actualLectureProgress.toFixed(2)),
      completion_lag: parseFloat(completionLag.toFixed(2)),
    };
}