import { ExamType, Gender } from '@prisma/client';

export interface TeacherExamResponse {
  id: string;
  name: string;
  examType: ExamType;
  examDate: Date;
  fullMarks: number;
  passingMarks: number;
  weightage: number;
  subject: {
    id: string;
    name: string;
    code: string;
    credits: number;
  };
  markedStudents: number;
  totalStudents: number;
  averageMarks: number;
}

export interface ExamDetailsResponse {
  id: string;
  name: string;
  examType: ExamType;
  examDate: Date;
  fullMarks: number;
  passingMarks: number;
  weightage: number;
  subject: {
    id: string;
    name: string;
    code: string;
    credits: number;
    semester: {
      number: number;
      division: {
        code: string;
      };
    };
  };
  stats: {
    totalStudents: number;
    markedStudents: number;
    unmarkedStudents: number;
    passedStudents: number;
    failedStudents: number;
    averageMarks: number;
    highestMarks: number;
    lowestMarks: number;
  };
}

export interface StudentMarksResponse {
  id: string;
  marksObtained: number;
  isPresent: boolean;
  remarks?: string;
  gradedAt: Date;
  student: {
    id: string;
    name: string;
    enrollmentId: string;
    email: string;
  };
}

export interface ExamMarksQueryParams {
  subjectId?: string;
  examType?: ExamType;
  startDate?: string;
  endDate?: string;
}

export interface StudentMarksQueryParams {
  status?: 'graded' | 'ungraded' | 'all';
  limit?: number | string;
  offset?: number| string;
  search?: string;
}

export interface AddMarksRequest {
  studentId: string;
  marksObtained: number;
  isPresent: boolean;
  remarks?: string;
}

export interface BulkMarksRequest {
  marks: AddMarksRequest[];
}

export interface UpdateMarksRequest {
  marksObtained?: number;
  isPresent?: boolean;
  remarks?: string;
}

export interface BulkMarksResponse {
  success: boolean;
  message: string;
  summary: {
    totalProcessed: number;
    successfullyAdded: number;
    successfullyUpdated: number;
    errors: number;
  };
  data: Array<{
    studentId: string;
    status: 'added' | 'updated' | 'error';
    marksId?: string;
    error?: string;
  }>;
}

export interface ExamStatistics {
  totalStudents: number;
  markedStudents: number;
  unmarkedStudents: number;
  presentStudents: number;
  absentStudents: number;
  passedStudents: number;
  failedStudents: number;
  averageMarks: number;
  medianMarks: number;
  highestMarks: number;
  lowestMarks: number;
  standardDeviation: number;
  gradeDistribution: {
    'A+': number;
    'A': number;
    'B+': number;
    'B': number;
    'C+': number;
    'C': number;
    'F': number;
  };
}
