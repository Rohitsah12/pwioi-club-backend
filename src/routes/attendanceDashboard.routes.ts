import { Router } from "express";
import { getAttendanceDashboard, getSchoolAnalysisByDivision } from "../controllers/attendanceDashboard.controller.js";

const attendanceDashboardRoutes = Router();


attendanceDashboardRoutes.get("/",getAttendanceDashboard);
attendanceDashboardRoutes.get('/school-analysis',getSchoolAnalysisByDivision);



export default attendanceDashboardRoutes;