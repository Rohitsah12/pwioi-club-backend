export interface AttendanceAnalyticsQueryDto {
  centerId?: string | undefined;
  schoolId?: string | undefined;
  batchId?: string | undefined;
  divisionId?: string | undefined;
  semesterId?: string | undefined;
  subjectId?: string | undefined;
}


export interface TrendPoint {
  period: string; 
  percentage: number;
}


export interface AttendanceAnalyticsResponse {
  overview: {
    totalStudents: number;
    averageAttendance: number;
    presentYesterday: number;
    absentYesterday: number;
  };
  trends: {
    daily: TrendPoint[];   
    weekly: TrendPoint[];  
    monthly: TrendPoint[]; 
  };
}