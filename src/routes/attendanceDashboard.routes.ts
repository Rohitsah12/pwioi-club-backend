import { Router } from "express";
import { getAttendanceDashboard, getDivisionAttendanceLeaderboard, getDivisionSubjectThresholdAnalysis, getSchoolAnalysisByDivision } from "../controllers/attendanceDashboard.controller.js";

const attendanceDashboardRoutes = Router();


attendanceDashboardRoutes.get("/",getAttendanceDashboard);
attendanceDashboardRoutes.get('/school-analysis',getSchoolAnalysisByDivision);
attendanceDashboardRoutes.get('/division-analysis',getDivisionSubjectThresholdAnalysis);
attendanceDashboardRoutes.get('/division-leaderboard',getDivisionAttendanceLeaderboard)


export default attendanceDashboardRoutes;