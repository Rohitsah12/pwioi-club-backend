import { PrismaClient } from '@prisma/client';
import type {StudentExamMarks, Exam, ExamType} from '@prisma/client'
import type {
  ExamAnalyticsQueryDto,
  ExamAnalyticsResponse,
  ExamOverviewStats,
  PerformanceBreakdownItem,
  ScoreDistributionItem,
} from '../types/adminExam.types.js';

const prisma = new PrismaClient();

// Type for marks with included exam details
type MarkWithExam = StudentExamMarks & { 
  exam: Exam;
};

export const getExamAnalytics = async (
  filters: ExamAnalyticsQueryDto
): Promise<ExamAnalyticsResponse> => {
  if (filters.examId && filters.subjectId) {
    return getExamLevelAnalytics(filters.examId);
  }
  if (filters.examType && filters.subjectId) {
    return getExamTypeLevelAnalytics(filters.subjectId, filters.examType);
  }
  if (filters.subjectId) {
    return getSubjectLevelAnalytics(filters.subjectId);
  }
  return getSemesterLevelAnalytics(filters.semesterId);
};

// LEVEL 1: SEMESTER ANALYTICS
const getSemesterLevelAnalytics = async (
  semesterId: string
): Promise<ExamAnalyticsResponse> => {
  const subjects = await prisma.subject.findMany({ 
    where: { semester_id: semesterId } 
  });
  
  const subjectIds = subjects.map((s) => s.id);

  const marks = await prisma.studentExamMarks.findMany({
    where: { subject_id: { in: subjectIds } },
    include: { exam: true },
  });

  const overview = calculateOverviewStats(marks);
  overview.totalExams = await prisma.exam.count({ 
    where: { subject_id: { in: subjectIds } } 
  });
  overview.subjects = subjects.map(s => ({ id: s.id, name: s.name }));

  const performanceBySubject = new Map<string, MarkWithExam[]>();
  marks.forEach((mark) => {
    if (!performanceBySubject.has(mark.subject_id)) {
      performanceBySubject.set(mark.subject_id, []);
    }
    performanceBySubject.get(mark.subject_id)!.push(mark);
  });

  const performanceBreakdown: PerformanceBreakdownItem[] = [];
  for (const [subjectId, subjectMarks] of performanceBySubject.entries()) {
    const stats = calculateOverviewStats(subjectMarks);
    const subjectName = subjects.find(s => s.id === subjectId)?.name || 'Unknown Subject';
    performanceBreakdown.push({
      id: subjectId,
      name: subjectName,
      averageScore: stats.averageScore,
      passRate: stats.passRate,
    });
  }

  return { level: 'semester', overview, performanceBreakdown };
};

// LEVEL 2: SUBJECT ANALYTICS
const getSubjectLevelAnalytics = async (
  subjectId: string
): Promise<ExamAnalyticsResponse> => {
  const marks = await prisma.studentExamMarks.findMany({
    where: { subject_id: subjectId },
    include: { exam: true },
  });

  const overview = calculateOverviewStats(marks);
  overview.totalExams = await prisma.exam.count({ 
    where: { subject_id: subjectId } 
  });

  const performanceByType = new Map<string, MarkWithExam[]>();
  marks.forEach((mark) => {
    const type = mark.exam.exam_type;
    if (!performanceByType.has(type)) {
      performanceByType.set(type, []);
    }
    performanceByType.get(type)!.push(mark);
  });

  const performanceBreakdown: PerformanceBreakdownItem[] = [];
  for (const [examType, typeMarks] of performanceByType.entries()) {
    const stats = calculateOverviewStats(typeMarks);
    performanceBreakdown.push({
      id: examType,
      name: examType,
      averageScore: stats.averageScore,
      passRate: stats.passRate,
    });
  }
  
  return { level: 'subject', overview, performanceBreakdown };
};

// LEVEL 3: EXAM TYPE ANALYTICS
const getExamTypeLevelAnalytics = async (
  subjectId: string,
  examType: ExamType
): Promise<ExamAnalyticsResponse> => {
  const marks = await prisma.studentExamMarks.findMany({
    where: { 
      subject_id: subjectId, 
      exam: { exam_type: examType } 
    },
    include: { exam: true },
  });

  const overview = calculateOverviewStats(marks);

  const performanceByExam = new Map<string, MarkWithExam[]>();
  marks.forEach((mark) => {
    if (!performanceByExam.has(mark.exam_id)) {
      performanceByExam.set(mark.exam_id, []);
    }
    performanceByExam.get(mark.exam_id)!.push(mark);
  });

  const performanceBreakdown: PerformanceBreakdownItem[] = [];
  for (const [examId, examMarks] of performanceByExam.entries()) {
    const stats = calculateOverviewStats(examMarks);
    performanceBreakdown.push({
      id: examId,
      name: examMarks[0]!.exam.name,
      averageScore: stats.averageScore,
      passRate: stats.passRate,
    });
  }

  return { level: 'examType', overview, performanceBreakdown };
};

// LEVEL 4: SPECIFIC EXAM ANALYTICS
const getExamLevelAnalytics = async (
  examId: string
): Promise<ExamAnalyticsResponse> => {
  const marks = await prisma.studentExamMarks.findMany({
    where: { exam_id: examId },
    include: { exam: true },
  });

  const overview = calculateOverviewStats(marks);

  const scoreDistribution: ScoreDistributionItem[] = [
    { range: '91-100', count: 0 }, { range: '81-90', count: 0 },
    { range: '71-80', count: 0 }, { range: '61-70', count: 0 },
    { range: '51-60', count: 0 }, { range: '41-50', count: 0 },
    { range: '31-40', count: 0 }, { range: '0-30', count: 0 },
  ];
  
  marks.forEach(mark => {
    const scorePercent = (mark.marks_obtained / mark.exam.full_marks) * 100;
    if (scorePercent > 90) scoreDistribution[0]!.count++;
    else if (scorePercent > 80) scoreDistribution[1]!.count++;
    else if (scorePercent > 70) scoreDistribution[2]!.count++;
    else if (scorePercent > 60) scoreDistribution[3]!.count++;
    else if (scorePercent > 50) scoreDistribution[4]!.count++;
    else if (scorePercent > 40) scoreDistribution[5]!.count++;
    else if (scorePercent > 30) scoreDistribution[6]!.count++;
    else scoreDistribution[7]!.count++;
  });

  return { level: 'exam', overview, performanceBreakdown: scoreDistribution };
};

// Helper function to calculate overview stats
const calculateOverviewStats = (marks: MarkWithExam[]): ExamOverviewStats => {
  if (marks.length === 0) {
    return { totalStudents: 0, averageScore: 0, passRate: 0, highestScore: 0 };
  }

  let totalScorePercent = 0;
  let passedCount = 0;
  let highestScorePercent = 0;
  const studentIds = new Set<string>();

  marks.forEach((mark) => {
    studentIds.add(mark.student_id);
    const scorePercent = (mark.marks_obtained / mark.exam.full_marks) * 100;
    totalScorePercent += scorePercent;

    if (mark.marks_obtained >= mark.exam.passing_marks) {
      passedCount++;
    }
    if (scorePercent > highestScorePercent) {
      highestScorePercent = scorePercent;
    }
  });

  const totalStudents = studentIds.size;
  const averageScore = totalScorePercent / marks.length;
  const passRate = (passedCount / totalStudents) * 100;

  return {
    totalStudents,
    averageScore: parseFloat(averageScore.toFixed(2)),
    passRate: parseFloat(passRate.toFixed(2)),
    highestScore: parseFloat(highestScorePercent.toFixed(2)),
  };
};