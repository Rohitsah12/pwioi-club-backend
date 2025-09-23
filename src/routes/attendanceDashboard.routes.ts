import { Router } from "express";
import { getAttendanceDashboard } from "../controllers/attendanceDashboard.controller.js";

const attendanceDashboardRoutes = Router();


attendanceDashboardRoutes.get("/",getAttendanceDashboard);



export default attendanceDashboardRoutes;