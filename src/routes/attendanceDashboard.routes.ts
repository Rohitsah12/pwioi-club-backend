import { Router } from "express";
import { exportAtRiskStudentsToExcel, exportConsecutiveAbsencesToExcel, getAtRiskStudents, getAttendanceDashboard, getConsecutiveAbsences, getDivisionAttendanceLeaderboard, getDivisionSubjectThresholdAnalysis, getSchoolAnalysisByDivision } from "../controllers/attendanceDashboard.controller.js";
import { authenticateJwt, requireRoles } from "../middlewares/authMiddleware.js";

const attendanceDashboardRoutes = Router();


attendanceDashboardRoutes.get("/",authenticateJwt,requireRoles("ADMIN","BATCHOPS","OPS","SUPER_ADMIN"),getAttendanceDashboard);
attendanceDashboardRoutes.get('/school-analysis',authenticateJwt,requireRoles("ADMIN","BATCHOPS","OPS","SUPER_ADMIN"),getSchoolAnalysisByDivision);
attendanceDashboardRoutes.get('/division-analysis',authenticateJwt,requireRoles("ADMIN","BATCHOPS","OPS","SUPER_ADMIN"),getDivisionSubjectThresholdAnalysis);
attendanceDashboardRoutes.get('/division-leaderboard',authenticateJwt,requireRoles("ADMIN","BATCHOPS","OPS","SUPER_ADMIN"),getDivisionAttendanceLeaderboard)
attendanceDashboardRoutes.get('/at-risk-students',authenticateJwt,requireRoles("ADMIN","BATCHOPS","OPS","SUPER_ADMIN"),getAtRiskStudents)
attendanceDashboardRoutes.get('/at-risk-students/export',authenticateJwt,requireRoles("ADMIN","BATCHOPS","OPS","SUPER_ADMIN"),exportAtRiskStudentsToExcel)
attendanceDashboardRoutes.get('/consecutive-absences',authenticateJwt,requireRoles("ADMIN","BATCHOPS","OPS","SUPER_ADMIN"),getConsecutiveAbsences)
attendanceDashboardRoutes.get('/consecutive-absences/export',authenticateJwt,requireRoles("ADMIN","BATCHOPS","OPS","SUPER_ADMIN"),exportConsecutiveAbsencesToExcel)


export default attendanceDashboardRoutes;