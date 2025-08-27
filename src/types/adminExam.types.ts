import { ExamType } from '@prisma/client';

export interface ExamAnalyticsQueryDto {
  semesterId: string;
  subjectId?: string | undefined;
  examType?: ExamType | undefined;
  examId?: string | undefined;
}

export interface ExamOverviewStats {
  totalStudents: number;
  averageScore: number;
  passRate: number;
  highestScore: number;
  totalExams?: number;
  subjects?: { id: string; name: string }[];
}

export interface PerformanceBreakdownItem {
  id: string;
  name: string;
  averageScore: number;
  passRate: number;
}

export interface ScoreDistributionItem {
  range: string;
  count: number;
}

export interface ExamAnalyticsResponse {
  level: 'semester' | 'subject' | 'examType' | 'exam';
  overview: ExamOverviewStats;
  performanceBreakdown: PerformanceBreakdownItem[] | ScoreDistributionItem[];
}