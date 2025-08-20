import { Router } from "express";
import { authenticateJwt } from "../middlewares/authMiddleware.js";
import { getAttendanceAnalytics, getDailyAttendanceAnalytics } from "../controllers/teacherAttendance.controller.js";

const teacherAttendanceRoutes=Router();


teacherAttendanceRoutes.get('/:subjectId/overall', authenticateJwt ,getAttendanceAnalytics);
teacherAttendanceRoutes.get("/:subjectId/daily",authenticateJwt,getDailyAttendanceAnalytics)


export default teacherAttendanceRoutes;