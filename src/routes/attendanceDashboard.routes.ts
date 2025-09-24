import { Router } from "express";
import { exportAtRiskStudentsToExcel, exportConsecutiveAbsencesToExcel, getAtRiskStudents, getAttendanceDashboard, getConsecutiveAbsences, getDivisionAttendanceLeaderboard, getDivisionSubjectThresholdAnalysis, getSchoolAnalysisByDivision } from "../controllers/attendanceDashboard.controller.js";

const attendanceDashboardRoutes = Router();


attendanceDashboardRoutes.get("/",getAttendanceDashboard);
attendanceDashboardRoutes.get('/school-analysis',getSchoolAnalysisByDivision);
attendanceDashboardRoutes.get('/division-analysis',getDivisionSubjectThresholdAnalysis);
attendanceDashboardRoutes.get('/division-leaderboard',getDivisionAttendanceLeaderboard)
attendanceDashboardRoutes.get('/at-risk-students',getAtRiskStudents)
attendanceDashboardRoutes.get('/at-risk-students/export',exportAtRiskStudentsToExcel)
attendanceDashboardRoutes.get('/consecutive-absences',getConsecutiveAbsences)
attendanceDashboardRoutes.get('/consecutive-absences/export',exportConsecutiveAbsencesToExcel)


export default attendanceDashboardRoutes;